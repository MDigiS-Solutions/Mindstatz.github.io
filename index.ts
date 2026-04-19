// ============================================================
//  MINDSTATZ — Supabase Edge Function
//  File:  supabase/functions/get-video-url/index.ts
//
//  Deploy:
//    supabase functions deploy get-video-url
//
//  What it does:
//    1. Verifies the caller's Supabase JWT
//    2. Confirms the user is an active member or admin
//    3. Decrypts the video URL using the server-side AES key
//       (stored as a Supabase secret — never in the browser)
//    4. Returns the plaintext URL (or a signed CDN URL)
//
//  Secrets to set:
//    supabase secrets set MINDSTATZ_AES_KEY=<32-byte hex>
//    supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<key>
// ============================================================

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── CORS headers ─────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ── AES-256-GCM decrypt (Deno Web Crypto) ────────────────────
async function aesDecrypt(blob: string, keyHex: string): Promise<string> {
  const { iv, ct } = JSON.parse(atob(blob));

  const keyBytes = new Uint8Array(
    keyHex.match(/.{2}/g)!.map(h => parseInt(h, 16))
  );

  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']
  );

  function b64Decode(str: string) {
    return Uint8Array.from(atob(str), c => c.charCodeAt(0));
  }

  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64Decode(iv) },
    cryptoKey,
    b64Decode(ct)
  );

  return new TextDecoder().decode(plain);
}

// ── Main handler ─────────────────────────────────────────────
serve(async (req: Request) => {

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    // 1. Parse request
    const { video_id } = await req.json();
    if (!video_id) {
      return new Response(JSON.stringify({ error: 'video_id required' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }

    // 2. Verify JWT from Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing auth token' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }

    const jwt = authHeader.replace('Bearer ', '');

    // 3. Create service-role client to verify user + fetch video
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Verify JWT and get user
    const { data: { user }, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }

    // 4. Check profile is active
    const { data: profile, error: profErr } = await admin
      .from('profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .single();

    if (profErr || !profile?.is_active) {
      return new Response(JSON.stringify({ error: 'Account not active' }), {
        status: 403, headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }

    // 5. Fetch the video record
    const { data: video, error: vidErr } = await admin
      .from('videos')
      .select('enc_url, access')
      .eq('id', video_id)
      .single();

    if (vidErr || !video) {
      return new Response(JSON.stringify({ error: 'Video not found' }), {
        status: 404, headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }

    // 6. Enforce access control — premium requires active membership
    if (video.access === 'premium' && profile.role === 'guest') {
      return new Response(JSON.stringify({ error: 'Premium access required' }), {
        status: 403, headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }

    // 7. Decrypt the URL server-side using the secret AES key
    const aesKeyHex = Deno.env.get('MINDSTATZ_AES_KEY');
    if (!aesKeyHex) throw new Error('AES key not configured');

    const plainUrl = await aesDecrypt(video.enc_url, aesKeyHex);

    // 8. Log the access event (no raw URL in log)
    await admin.from('session_log').insert({
      user_id: user.id,
      event:   'video_access',
      meta:    { video_id, access: video.access }
    });

    // 9. Return decrypted URL
    return new Response(JSON.stringify({ url: plainUrl }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Edge function error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  }
});
