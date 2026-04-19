/* ============================================================
   MINDSTATZ — api.js
   Supabase client + AES-256-GCM encryption + SHA-256 hashing
   All sensitive data is encrypted before leaving this file.
   ============================================================ */

'use strict';

// ── Supabase config ─────────────────────────────────────────
// Replace these two values with your project's credentials.
// Find them at: Supabase Dashboard → Project Settings → API
const SUPABASE_URL    = window.SUPABASE_URL    || 'https://ihgafbmoyggubzmpyhnc.supabase.co';
const SUPABASE_ANON   = window.SUPABASE_ANON   || 'sb_publishable_X4Ob-56hV1Evg6g0UupTtQ_UecJrT8k';

// Lazily initialised Supabase client (loaded from CDN in HTML)
let _sb = null;
function sb() {
  if (!_sb) _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
  return _sb;
}

// ════════════════════════════════════════════════════════════
//  CRYPTO LAYER
//  AES-256-GCM  — symmetric authenticated encryption
//  SHA-256      — one-way hashing for passwords & tokens
// ════════════════════════════════════════════════════════════

const CRYPTO = window.crypto.subtle;
const ENC    = new TextEncoder();
const DEC    = new TextDecoder();

// ── Derive a CryptoKey from a passphrase via PBKDF2 ─────────
// The passphrase is the admin's password (never stored raw).
// Salt is the user's Supabase UUID — publicly known but unique.
async function deriveKey(passphrase, salt) {
  const raw = await CRYPTO.importKey(
    'raw', ENC.encode(passphrase), 'PBKDF2', false, ['deriveKey']
  );
  return CRYPTO.deriveKey(
    { name: 'PBKDF2', salt: ENC.encode(salt), iterations: 310_000, hash: 'SHA-256' },
    raw,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ── AES-256-GCM encrypt ─────────────────────────────────────
// Returns a base64-encoded JSON string: { iv, ct }
// (AES-GCM appends the 128-bit auth tag to the ciphertext)
async function aesEncrypt(plaintext, key) {
  const iv  = window.crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV
  const ct  = await CRYPTO.encrypt(
    { name: 'AES-GCM', iv },
    key,
    ENC.encode(plaintext)
  );
  const payload = {
    iv: b64Encode(iv),
    ct: b64Encode(new Uint8Array(ct))
  };
  return btoa(JSON.stringify(payload));
}

// ── AES-256-GCM decrypt ─────────────────────────────────────
// Returns the original plaintext string, or throws on tamper/wrong key.
async function aesDecrypt(blob, key) {
  const { iv, ct } = JSON.parse(atob(blob));
  const plain = await CRYPTO.decrypt(
    { name: 'AES-GCM', iv: b64Decode(iv) },
    key,
    b64Decode(ct)
  );
  return DEC.decode(plain);
}

// ── SHA-256 hash ─────────────────────────────────────────────
// Returns a lowercase hex string. Used for passwords & tokens.
async function sha256(input) {
  const buf  = await CRYPTO.digest('SHA-256', ENC.encode(input));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── Base64 helpers ───────────────────────────────────────────
function b64Encode(buf) {
  return btoa(String.fromCharCode(...buf));
}
function b64Decode(str) {
  return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}

// ── Session key management ───────────────────────────────────
// The derived CryptoKey lives only in memory for this page session.
// It is NEVER written to localStorage, sessionStorage, or the DOM.
let _sessionKey  = null;  // CryptoKey object
let _sessionSalt = null;  // user UUID (salt for PBKDF2)

async function establishSessionKey(password, userId) {
  _sessionSalt = userId;
  _sessionKey  = await deriveKey(password, userId);
  // Store a SHA-256 fingerprint of the key material so the
  // backend can audit key rotation without knowing the key.
  const fp = await sha256(password + userId);
  await sb().from('profiles').update({ key_hash: fp }).eq('id', userId);
}

function clearSessionKey() {
  _sessionKey  = null;
  _sessionSalt = null;
}

function hasSessionKey() {
  return _sessionKey !== null;
}

// Encrypt a value — throws if no session key is loaded
async function encrypt(plaintext) {
  if (!_sessionKey) throw new Error('No session key. Log in first.');
  if (!plaintext)   return null;
  return aesEncrypt(String(plaintext), _sessionKey);
}

// Decrypt a value — throws if no session key is loaded or on tamper
async function decrypt(ciphertext) {
  if (!_sessionKey)  throw new Error('No session key. Log in first.');
  if (!ciphertext)   return null;
  return aesDecrypt(ciphertext, _sessionKey);
}

// ════════════════════════════════════════════════════════════
//  AUTH API
// ════════════════════════════════════════════════════════════

const Auth = {

  // ── Sign up a new member ──────────────────────────────────
  async signUp(email, password) {
    const { data, error } = await sb().auth.signUp({ email, password });
    if (error) throw error;
    await logEvent('signup', { email: await sha256(email) });
    return data;
  },

  // ── Sign in ───────────────────────────────────────────────
  // For admins, also establishes the AES session key.
  async signIn(email, password) {
    const { data, error } = await sb().auth.signInWithPassword({ email, password });
    if (error) throw error;

    const profile = await Auth.getProfile(data.user.id);

    if (profile.role === 'admin') {
      // Derive AES key from password + UUID
      await establishSessionKey(password, data.user.id);
      // Store SHA-256 of admin password in profile for verification
      const pwHash = await sha256(password + data.user.id);
      await sb().from('profiles')
        .update({ pw_hash: pwHash })
        .eq('id', data.user.id);
    }

    await logEvent('login', { role: profile.role });
    return { user: data.user, profile };
  },

  // ── Sign out ──────────────────────────────────────────────
  async signOut() {
    await logEvent('logout', {});
    clearSessionKey();
    const { error } = await sb().auth.signOut();
    if (error) throw error;
  },

  // ── Get current session ───────────────────────────────────
  async getSession() {
    const { data: { session } } = await sb().auth.getSession();
    return session;
  },

  // ── Get current user ──────────────────────────────────────
  async getUser() {
    const { data: { user } } = await sb().auth.getUser();
    return user;
  },

  // ── Get profile row ───────────────────────────────────────
  async getProfile(userId) {
    const { data, error } = await sb()
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) throw error;
    return data;
  },

  // ── Check if current user is admin ───────────────────────
  async isAdmin() {
    const user = await Auth.getUser();
    if (!user) return false;
    const profile = await Auth.getProfile(user.id);
    return profile?.role === 'admin';
  },

  // ── Re-establish session key after page reload ────────────
  // Call on admin page load: prompt for password to re-derive key
  async rehydrateKey(password) {
    const user = await Auth.getUser();
    if (!user) throw new Error('Not authenticated');
    await establishSessionKey(password, user.id);
  },

  // ── Verify admin password via stored SHA-256 hash ─────────
  async verifyAdminPassword(password) {
    const user    = await Auth.getUser();
    if (!user) return false;
    const profile = await Auth.getProfile(user.id);
    const hash    = await sha256(password + user.id);
    return profile.pw_hash === hash;
  },

  // ── Listen to auth state changes ─────────────────────────
  onAuthChange(callback) {
    return sb().auth.onAuthStateChange((_event, session) => callback(session));
  },

  // ── Password reset ────────────────────────────────────────
  async resetPassword(email) {
    const { error } = await sb().auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/admin.html'
    });
    if (error) throw error;
  }
};

// ════════════════════════════════════════════════════════════
//  VIDEO API
// ════════════════════════════════════════════════════════════

const Videos = {

  // ── List videos (metadata only — decryption done per-video) ─
  // Returns plaintext metadata + opaque encrypted blobs.
  // RLS ensures unauthenticated users only see free videos.
  async list() {
    const { data, error } = await sb()
      .from('videos')
      .select('id, video_type, access, duration, display_order, created_at, enc_title, enc_thumb')
      .order('display_order', { ascending: true })
      .order('created_at',    { ascending: false });
    if (error) throw error;
    return data || [];
  },

  // ── Get single video (full record — admin or authorised member) ─
  async get(id) {
    const { data, error } = await sb()
      .from('videos')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  },

  // ── Add a video (admin only — encrypts before insert) ─────
  async add({ title, url, videoType, access, duration, desc, thumb }) {
    if (!hasSessionKey()) throw new Error('Admin session key required.');

    const [encTitle, encUrl, encDesc, encThumb] = await Promise.all([
      encrypt(title),
      encrypt(url),
      encrypt(desc   || ''),
      encrypt(thumb  || ''),
    ]);

    const user = await Auth.getUser();
    const { data, error } = await sb().from('videos').insert({
      enc_title:    encTitle,
      enc_url:      encUrl,
      enc_desc:     encDesc,
      enc_thumb:    encThumb,
      video_type:   videoType || 'regular',
      access:       access    || 'free',
      duration:     duration  || null,
      uploaded_by:  user.id,
    }).select().single();

    if (error) throw error;
    await logEvent('admin_action', { action: 'video_add', video_id: data.id });
    return data;
  },

  // ── Update a video (admin only) ───────────────────────────
  async update(id, fields) {
    if (!hasSessionKey()) throw new Error('Admin session key required.');

    const updates = {};
    if (fields.title)    updates.enc_title = await encrypt(fields.title);
    if (fields.url)      updates.enc_url   = await encrypt(fields.url);
    if (fields.desc)     updates.enc_desc  = await encrypt(fields.desc);
    if (fields.thumb)    updates.enc_thumb = await encrypt(fields.thumb);
    if (fields.access)   updates.access    = fields.access;
    if (fields.duration) updates.duration  = fields.duration;
    if (fields.videoType)updates.video_type= fields.videoType;

    const { data, error } = await sb()
      .from('videos').update(updates).eq('id', id).select().single();
    if (error) throw error;
    await logEvent('admin_action', { action: 'video_update', video_id: id });
    return data;
  },

  // ── Remove a video (admin only) ───────────────────────────
  async remove(id) {
    const { error } = await sb().from('videos').delete().eq('id', id);
    if (error) throw error;
    await logEvent('admin_action', { action: 'video_delete', video_id: id });
  },

  // ── Decrypt a video's sensitive fields ───────────────────
  // Authorised member/admin calls this per-video after fetching.
  async decryptVideo(row) {
    if (!hasSessionKey()) throw new Error('Session key required to decrypt.');
    const [title, url, desc, thumb] = await Promise.all([
      row.enc_title ? decrypt(row.enc_title) : Promise.resolve(''),
      row.enc_url   ? decrypt(row.enc_url)   : Promise.resolve(''),
      row.enc_desc  ? decrypt(row.enc_desc)  : Promise.resolve(''),
      row.enc_thumb ? decrypt(row.enc_thumb) : Promise.resolve(''),
    ]);
    return { ...row, title, url, desc, thumb };
  },

  // ── Decrypt all videos from a list (admin view) ───────────
  async decryptAll(rows) {
    return Promise.all(rows.map(r => Videos.decryptVideo(r)));
  }
};

// ════════════════════════════════════════════════════════════
//  ACCESS TOKEN API
// ════════════════════════════════════════════════════════════

const Tokens = {

  // ── Generate + store a token (admin only) ─────────────────
  // Returns the raw token — shown ONCE, never stored plaintext.
  async generate(userId, expiresAt = null) {
    const raw   = b64Encode(window.crypto.getRandomValues(new Uint8Array(32)));
    const hash  = await sha256(raw);

    const { error } = await sb().from('access_tokens').insert({
      token_hash: hash,
      user_id:    userId,
      granted_by: (await Auth.getUser()).id,
      expires_at: expiresAt,
    });
    if (error) throw error;
    await logEvent('admin_action', { action: 'token_generate', for_user: userId });
    return raw; // Show this to the admin — only time it's visible
  },

  // ── Verify a token (member presents raw token) ────────────
  async verify(rawToken) {
    const hash = await sha256(rawToken);
    const { data, error } = await sb()
      .from('access_tokens')
      .select('*')
      .eq('token_hash', hash)
      .eq('is_revoked', false)
      .single();

    if (error || !data) return { valid: false };
    if (data.expires_at && new Date(data.expires_at) < new Date())
      return { valid: false, reason: 'expired' };

    // Mark as used (first use timestamp)
    if (!data.used_at) {
      await sb().from('access_tokens')
        .update({ used_at: new Date().toISOString() })
        .eq('id', data.id);
    }

    return { valid: true, token: data };
  },

  // ── Revoke a token (admin only) ───────────────────────────
  async revoke(tokenId) {
    const { error } = await sb()
      .from('access_tokens')
      .update({ is_revoked: true })
      .eq('id', tokenId);
    if (error) throw error;
  },

  // ── List tokens (admin only) ──────────────────────────────
  async list() {
    const { data, error } = await sb()
      .from('access_tokens')
      .select('id, user_id, expires_at, used_at, is_revoked, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }
};

// ════════════════════════════════════════════════════════════
//  SITE CONFIG API
// ════════════════════════════════════════════════════════════

const Config = {

  // ── Load all config into an object ───────────────────────
  async getAll() {
    const { data, error } = await sb().from('site_config').select('key, value');
    if (error) throw error;
    return Object.fromEntries((data || []).map(r => [r.key, r.value]));
  },

  // ── Set a single key (admin only) ────────────────────────
  async set(key, value) {
    const user = await Auth.getUser();
    const { error } = await sb().from('site_config').upsert({
      key,
      value:      String(value),
      updated_by: user?.id,
      updated_at: new Date().toISOString()
    }, { onConflict: 'key' });
    if (error) throw error;
  },

  // ── Set multiple keys at once ─────────────────────────────
  async setMany(obj) {
    await Promise.all(Object.entries(obj).map(([k, v]) => Config.set(k, v)));
  }
};

// ════════════════════════════════════════════════════════════
//  SESSION AUDIT LOG
// ════════════════════════════════════════════════════════════

async function logEvent(event, meta = {}) {
  try {
    const user = await Auth.getUser();
    await sb().from('session_log').insert({
      user_id: user?.id || null,
      event,
      meta: { ...meta, ua: navigator.userAgent.substring(0, 80) }
    });
  } catch (_) {
    // Logging should never break the main flow
  }
}

// ════════════════════════════════════════════════════════════
//  MEMBERS — gallery decryption flow
//
//  Flow for a logged-in member:
//    1. Auth.signIn(email, password)
//    2. For premium videos: member doesn't have the AES key —
//       they request a "video access URL" from a Supabase
//       Edge Function that decrypts server-side after verifying
//       the JWT. See edge-function/decrypt-video.js.
//
//  Flow for admin:
//    1. Auth.signIn(email, password) — key derived automatically
//    2. Videos.decryptAll(rows) — fully decrypted in-browser
//
// ════════════════════════════════════════════════════════════

// ── Member video access ───────────────────────────────────────
// Members call this to get a short-lived signed URL for a video.
// The Edge Function verifies the JWT, checks membership,
// decrypts the URL server-side, and returns it.
const MemberAccess = {
  async getVideoUrl(videoId) {
    const session = await Auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const res = await fetch(`${SUPABASE_URL}/functions/v1/get-video-url`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ video_id: videoId })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Access denied');
    }

    const { url } = await res.json();
    return url;
  }
};

// ── Export all APIs to global scope ──────────────────────────
window.MindstatzAPI = { Auth, Videos, Tokens, Config, MemberAccess, sha256, logEvent };
