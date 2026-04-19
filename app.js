/* ============================================================
   MINDSTATZ — app.js  (Supabase edition)
   All video/config data now comes from Supabase via api.js.
   ============================================================ */

'use strict';

const { Auth, Videos, Config, MemberAccess, logEvent } = window.MindstatzAPI;

let _currentUser    = null;
let _currentProfile = null;
let _siteConfig     = {};

document.addEventListener('DOMContentLoaded', async () => {
  initCursor();
  initNav();
  initAgeGate();

  await loadSiteConfig();

  const session = await Auth.getSession();
  if (session?.user) {
    _currentUser    = session.user;
    _currentProfile = await Auth.getProfile(session.user.id);
  }

  updateAuthUI();
  initReveal();

  if (document.getElementById('dynamic-gallery'))  await initGallery();
  if (document.getElementById('video-tbody'))       await initAdminPage();
  if (document.querySelector('.vr-wrapper'))        initVRPlayer();
  if (document.querySelector('.player-wrap'))       initStdPlayer();

  Auth.onAuthChange(async (session) => {
    _currentUser    = session?.user || null;
    _currentProfile = _currentUser ? await Auth.getProfile(_currentUser.id) : null;
    updateAuthUI();
    if (document.getElementById('dynamic-gallery')) await initGallery();
  });
});

// ── Site Config ───────────────────────────────────────────────
async function loadSiteConfig() {
  try {
    _siteConfig = await Config.getAll();
  } catch (_) {
    _siteConfig = { accentColor:'#c9a84c', bgStyle:'void', paywallEnabled:'true', uiControls:'true', spatialAudio:'true', heroHeadline:'Immerse Yourself in Pure Luxury', heroSub:'Premium content in stunning 180° VR.' };
  }
  applyConfig();
}

function applyConfig() {
  const c = _siteConfig;
  if (c.accentColor) document.documentElement.style.setProperty('--gold', c.accentColor);
  applyBgStyle(c.bgStyle || 'void');
  const h1 = document.querySelector('.hero h1');
  const hp = document.querySelector('.hero p');
  if (h1 && c.heroHeadline) h1.innerHTML = c.heroHeadline;
  if (hp && c.heroSub)      hp.textContent = c.heroSub;
  const paywall = document.getElementById('paywall-overlay');
  if (paywall) paywall.style.display = c.paywallEnabled === 'false' ? 'none' : 'flex';
  const uiPanel = document.getElementById('ui-panel');
  if (uiPanel) uiPanel.setAttribute('visible', c.uiControls !== 'false');
}

function applyBgStyle(style) {
  document.body.classList.remove('bg-void','bg-velvet','bg-cosmic','bg-noir');
  document.body.classList.add('bg-' + (style || 'void'));
}

// ── Auth UI ───────────────────────────────────────────────────
function updateAuthUI() {
  const loggedIn = !!_currentUser;
  const isAdmin  = _currentProfile?.role === 'admin';
  document.querySelectorAll('[data-auth="member"]').forEach(el => el.style.display = loggedIn ? '' : 'none');
  document.querySelectorAll('[data-auth="guest"]') .forEach(el => el.style.display = loggedIn ? 'none' : '');
  document.querySelectorAll('[data-auth="admin"]') .forEach(el => el.style.display = isAdmin  ? '' : 'none');
}

// ── Auth Modal ────────────────────────────────────────────────
function openAuthModal(mode = 'signin') {
  const modal = document.getElementById('auth-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  modal.dataset.mode  = mode;
  updateAuthModalUI(mode);
}

function closeAuthModal() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.style.display = 'none';
  clearAuthError();
}

function updateAuthModalUI(mode) {
  const title   = document.getElementById('auth-modal-title');
  const btn     = document.getElementById('auth-submit-btn');
  const toggle  = document.getElementById('auth-toggle-text');
  const modal   = document.getElementById('auth-modal');
  if (modal) modal.dataset.mode = mode;
  if (mode === 'signin') {
    if (title)  title.textContent  = 'Sign In';
    if (btn)    btn.textContent    = 'Sign In';
    if (toggle) toggle.innerHTML   = `No account? <a href="#" onclick="updateAuthModalUI('signup')" style="color:var(--gold)">Sign Up</a>`;
  } else {
    if (title)  title.textContent  = 'Create Account';
    if (btn)    btn.textContent    = 'Create Account';
    if (toggle) toggle.innerHTML   = `Have an account? <a href="#" onclick="updateAuthModalUI('signin')" style="color:var(--gold)">Sign In</a>`;
  }
}

async function submitAuth(e) {
  e.preventDefault();
  const modal    = document.getElementById('auth-modal');
  const mode     = modal?.dataset.mode || 'signin';
  const email    = document.getElementById('auth-email')?.value.trim();
  const password = document.getElementById('auth-password')?.value;
  const btn      = document.getElementById('auth-submit-btn');
  if (!email || !password) return;
  btn.textContent = mode === 'signin' ? 'Signing in…' : 'Creating account…';
  btn.disabled = true;
  clearAuthError();
  try {
    if (mode === 'signin') {
      const { profile } = await Auth.signIn(email, password);
      closeAuthModal();
      showToast('Welcome back!');
      if (profile.role === 'admin') window.location.href = 'admin.html';
    } else {
      await Auth.signUp(email, password);
      showToast('Account created! Check your email to confirm.');
      closeAuthModal();
    }
  } catch (err) {
    showAuthError(err.message || 'Authentication failed.');
  } finally {
    btn.disabled = false;
    btn.textContent = mode === 'signin' ? 'Sign In' : 'Create Account';
  }
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}
function clearAuthError() {
  const el = document.getElementById('auth-error');
  if (el) { el.textContent = ''; el.style.display = 'none'; }
}

async function handleSignOut() {
  try { await Auth.signOut(); showToast('Signed out.'); window.location.href = 'index.html'; }
  catch (err) { showToast(err.message, 'error'); }
}

// ── Gallery ───────────────────────────────────────────────────
async function initGallery() {
  const container = document.getElementById('dynamic-gallery');
  if (!container) return;
  container.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--text-muted)">Loading…</div>`;
  try {
    const rows = await Videos.list();
    if (!rows.length) {
      container.innerHTML = `<p style="color:var(--text-muted);font-size:0.85rem;text-align:center;grid-column:1/-1;padding:2rem">No videos available yet.</p>`;
      return;
    }

    // Attempt decryption for admin (has session key) or fetch URLs via Edge Fn
    const isAdmin = _currentProfile?.role === 'admin';
    let items = rows;

    if (isAdmin && window.MindstatzAPI) {
      try { items = await Videos.decryptAll(rows); }
      catch (_) { items = rows.map(r => ({...r, title:'— key needed —', url:'', thumb:''})); }
    } else {
      items = await Promise.all(rows.map(async row => {
        if (!_currentUser && row.access === 'premium') return {...row, url:null, title:'Members Only', thumb:''};
        try {
          const url = await MemberAccess.getVideoUrl(row.id);
          return {...row, url, title: row.access==='free' ? 'Free Preview' : 'Premium'};
        } catch (_) {
          return {...row, url:null, title: row.access==='free' ? 'Preview' : 'Members Only', thumb:''};
        }
      }));
    }

    container.innerHTML = items.map(v => buildCard(v)).join('');
    initReveal();
    attachGalleryHover();
  } catch (err) {
    container.innerHTML = `<p style="color:var(--text-muted);grid-column:1/-1;text-align:center;padding:2rem">Could not load gallery.</p>`;
  }
}

function buildCard(v) {
  const isLocked = v.access === 'premium' && !_currentUser;
  const isVR     = v.video_type === 'vr';
  const title    = escHtml(v.title || 'Untitled');
  const onclick  = isLocked
    ? `onclick="openAuthModal('signin')"`
    : v.url
      ? `onclick="openPlayer('${escHtml(v.url)}','${title}')"`
      : `onclick="openAuthModal('signin')"`;
  const duration = v.duration ? ` · ${escHtml(v.duration)}` : '';

  const lockOverlay = isLocked ? `
    <div class="lock-overlay">
      <svg viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
      <span>Sign in to unlock</span>
    </div>` : '';

  const mediaEl = v.thumb
    ? `<img src="${escHtml(v.thumb)}" alt="${title}" style="width:100%;height:100%;object-fit:cover;display:block;">`
    : v.url
      ? `<video src="${escHtml(v.url)}" muted loop preload="none" style="width:100%;height:100%;object-fit:cover;display:block;"></video>`
      : `<div style="width:100%;height:100%;background:var(--bg-elevated);display:flex;align-items:center;justify-content:center;"><svg viewBox="0 0 24 24" style="width:32px;fill:var(--text-muted)"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2z"/></svg></div>`;

  return `
    <div class="clip-card${isLocked?' locked':''} reveal" ${onclick}>
      ${isVR ? `<span class="clip-badge vr">VR 180°</span>` : ''}
      ${isLocked ? `<span class="clip-badge locked">Premium</span>` : `<span class="clip-badge preview">${v.access==='free'?'Preview':'Premium'}</span>`}
      ${mediaEl}
      <div class="play-btn-overlay"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
      ${lockOverlay}
      <div class="clip-overlay"><div>
        <div class="clip-title">${title}</div>
        <div class="clip-meta">${isVR?'VR 180°':'2D'}${duration} · ${isLocked?'Premium':'Free'}</div>
        <div class="clip-actions">${isLocked ? `<button class="btn btn-violet" style="padding:0.4rem 1rem;font-size:0.62rem">Sign In</button>` : `<button class="btn btn-gold" style="padding:0.4rem 1rem;font-size:0.62rem">Play</button>`}</div>
      </div></div>
    </div>`;
}

function attachGalleryHover() {
  document.querySelectorAll('.clip-card video').forEach(v => {
    const card = v.closest('.clip-card');
    if (card && !card.dataset.hoverBound) {
      card.dataset.hoverBound = '1';
      card.addEventListener('mouseenter', () => v.play().catch(()=>{}));
      card.addEventListener('mouseleave', () => { v.pause(); v.currentTime = 0; });
    }
  });
}

// ── Admin Page ────────────────────────────────────────────────
async function initAdminPage() {
  const session = await Auth.getSession();
  if (!session) { window.location.href = 'index.html'; return; }
  const profile = await Auth.getProfile(session.user.id);
  if (profile?.role !== 'admin') { window.location.href = 'index.html'; return; }
  _currentProfile = profile;

  // Show rehydrate modal if session key not in memory
  if (typeof window.MindstatzAPI?.hasSessionKey === 'function' && !window.MindstatzAPI.hasSessionKey()) {
    const modal = document.getElementById('rehydrate-modal');
    if (modal) modal.style.display = 'flex';
    return;
  }
  await loadAdminData();
}

async function rehydrateKey(e) {
  e.preventDefault();
  const pw  = document.getElementById('rehydrate-pw')?.value;
  const btn = document.getElementById('rehydrate-btn');
  if (!pw) return;
  btn.disabled = true; btn.textContent = 'Verifying…';
  try {
    const valid = await Auth.verifyAdminPassword(pw);
    if (!valid) throw new Error('Incorrect password.');
    await Auth.rehydrateKey(pw);
    document.getElementById('rehydrate-modal').style.display = 'none';
    await loadAdminData();
    showToast('Session key active. Decryption enabled.');
  } catch (err) {
    const el = document.getElementById('rehydrate-error');
    if (el) { el.textContent = err.message; el.style.display = 'block'; }
  } finally {
    btn.disabled = false; btn.textContent = 'Unlock Dashboard';
  }
}

async function loadAdminData() {
  await Promise.all([ renderVideoTable(), loadConfigToUI() ]);
  initUploadForm();
  initThemeControls();
  updateClock();
  setInterval(updateClock, 1000);
}

async function renderVideoTable() {
  const tbody = document.getElementById('video-tbody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-muted)">Loading…</td></tr>`;
  try {
    const rows = await Videos.list();
    let items = rows;
    try { items = await Videos.decryptAll(rows); } catch(_) {}
    if (!items.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-muted)">No videos yet.</td></tr>`;
      updateAdminStats([]);
      return;
    }
    tbody.innerHTML = items.map(v => `
      <tr>
        <td>${v.thumb ? `<img class="thumb" src="${escHtml(v.thumb)}" alt="">` : `<div class="thumb skeleton"></div>`}</td>
        <td style="color:var(--text-primary)">${escHtml(v.title || '— encrypted —')}</td>
        <td><span class="clip-badge ${v.video_type}">${(v.video_type||'').toUpperCase()}</span></td>
        <td>${v.access==='free' ? '<span style="color:var(--gold)">Free</span>' : '<span style="color:var(--violet-light)">Premium</span>'}</td>
        <td style="color:var(--text-muted)">${new Date(v.created_at).toLocaleDateString()}</td>
        <td style="display:flex;gap:0.4rem">
          <button class="btn btn-ghost" style="padding:0.3rem 0.7rem;font-size:0.62rem" onclick="editVideo('${v.id}')">Edit</button>
          <button class="btn btn-ghost" style="padding:0.3rem 0.7rem;font-size:0.62rem;border-color:rgba(200,60,60,0.4);color:#d47" onclick="deleteVideo('${v.id}')">Remove</button>
        </td>
      </tr>`).join('');
    updateAdminStats(items);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="color:#d44;padding:1rem">${escHtml(err.message)}</td></tr>`;
  }
}

async function deleteVideo(id) {
  if (!confirm('Remove this video permanently?')) return;
  try { await Videos.remove(id); await renderVideoTable(); showToast('Video removed.'); }
  catch (err) { showToast(err.message, 'error'); }
}

async function editVideo(id) {
  try {
    const row = await Videos.get(id);
    const v   = await Videos.decryptVideo(row);
    const set = (selector, val) => { const el = document.getElementById(selector); if (el) el.value = val || ''; };
    set('up-title', v.title); set('up-url', v.url); set('up-thumb', v.thumb); set('up-desc', v.desc);
    set('up-type', v.video_type); set('up-access', v.access);
    const form = document.getElementById('upload-form');
    if (form) form.dataset.editId = id;
    showSection('upload', document.querySelector('[data-section=upload]'));
    showToast('Editing video — update fields and save.');
  } catch (err) { showToast(err.message, 'error'); }
}

function updateAdminStats(rows = []) {
  const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
  el('stat-videos',  rows.length);
  el('stat-vr',      rows.filter(v => v.video_type === 'vr').length);
  el('stat-premium', rows.filter(v => v.access     === 'premium').length);
  el('stat-free',    rows.filter(v => v.access     === 'free').length);
}

function initUploadForm() {
  const form = document.getElementById('upload-form');
  if (!form || form.dataset.bound) return;
  form.dataset.bound = '1';

  const submitBtn = form.querySelector('[type=submit]');
  if (submitBtn) submitBtn.textContent = 'Encrypt & Save Video';

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn    = form.querySelector('[type=submit]');
    const editId = form.dataset.editId;
    const entry  = {
      title:     document.getElementById('up-title')?.value.trim(),
      url:       document.getElementById('up-url')?.value.trim(),
      videoType: document.getElementById('up-type')?.value,
      access:    document.getElementById('up-access')?.value,
      duration:  document.getElementById('up-duration')?.value.trim(),
      desc:      document.getElementById('up-desc')?.value.trim(),
      thumb:     document.getElementById('up-thumb')?.value.trim(),
    };
    if (!entry.title || !entry.url) { showToast('Title and URL are required.', 'error'); return; }

    btn.disabled = true;
    btn.textContent = editId ? 'Saving…' : 'Encrypting & Saving…';

    const bar  = document.getElementById('upload-progress');
    const fill = document.getElementById('upload-progress-fill');
    if (bar) bar.style.display = 'block';
    let pct = 0;
    const ticker = setInterval(() => { pct = Math.min(pct+12, 85); if(fill) fill.style.width = pct+'%'; }, 180);

    try {
      if (editId) { await Videos.update(editId, entry); delete form.dataset.editId; showToast('Video updated!'); }
      else        { await Videos.add(entry);             showToast('Video encrypted & saved to database!'); }
      form.reset();
      clearInterval(ticker);
      if (fill) fill.style.width = '100%';
      setTimeout(() => { if(bar) bar.style.display='none'; }, 600);
      await renderVideoTable();
    } catch (err) {
      clearInterval(ticker);
      if (bar) bar.style.display = 'none';
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Encrypt & Save Video';
    }
  });
}

function initThemeControls() {
  document.querySelectorAll('.color-swatch').forEach(sw => {
    sw.addEventListener('click', async () => {
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
      const c = sw.dataset.color;
      document.documentElement.style.setProperty('--gold', c);
      try { await Config.set('accentColor', c); showToast('Color saved.'); } catch (err) { showToast(err.message,'error'); }
    });
    if (sw.dataset.color === _siteConfig.accentColor) sw.classList.add('active');
  });

  document.querySelectorAll('[data-bg]').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.bg-option').forEach(o => o.classList.remove('active'));
      btn.classList.add('active');
      applyBgStyle(btn.dataset.bg);
      try { await Config.set('bgStyle', btn.dataset.bg); showToast('Background saved.'); } catch (err) { showToast(err.message,'error'); }
    });
    if (btn.dataset.bg === _siteConfig.bgStyle) btn.classList.add('active');
  });

  document.querySelectorAll('.admin-toggle-input').forEach(input => {
    const flag = input.dataset.flag;
    if (!flag) return;
    input.checked = _siteConfig[flag] !== 'false';
    input.addEventListener('change', async () => {
      const val = input.checked ? 'true' : 'false';
      try { await Config.set(flag, val); _siteConfig[flag] = val; applyConfig(); showToast(`${flag} ${input.checked?'enabled':'disabled'}.`); }
      catch (err) { showToast(err.message,'error'); }
    });
  });
}

async function loadConfigToUI() {
  try { _siteConfig = await Config.getAll(); applyConfig(); } catch(_) {}
  const hh = document.getElementById('hero-headline');
  const hs = document.getElementById('hero-sub');
  if (hh) hh.value = _siteConfig.heroHeadline || '';
  if (hs) hs.value = _siteConfig.heroSub       || '';
  document.querySelectorAll('.bg-option').forEach(o => o.classList.toggle('active', o.dataset.bg === (_siteConfig.bgStyle||'void')));
}

async function saveHeroText() {
  const h = document.getElementById('hero-headline')?.value;
  const s = document.getElementById('hero-sub')?.value;
  try { await Config.setMany({ heroHeadline: h, heroSub: s }); showToast('Hero text saved!'); }
  catch (err) { showToast(err.message,'error'); }
}

async function applyCustomColor() {
  const ci = document.getElementById('custom-color-input');
  const cp = document.getElementById('custom-color-picker');
  const c  = ci?.value || cp?.value;
  if (!c?.match(/^#[0-9a-fA-F]{3,6}$/)) { showToast('Enter a valid hex color.','error'); return; }
  document.documentElement.style.setProperty('--gold', c);
  try { await Config.set('accentColor', c); showToast('Accent color updated!'); }
  catch (err) { showToast(err.message,'error'); }
}

function selectBg(style, el) {
  document.querySelectorAll('.bg-option').forEach(o => o.classList.remove('active'));
  el?.classList.add('active');
  applyBgStyle(style);
  Config.set('bgStyle', style).catch(()=>{});
}

// ── VR Player ─────────────────────────────────────────────────
let vrVideo = null;

function initVRPlayer() {
  vrVideo = document.getElementById('preview-video');
  if (!vrVideo) return;
  if (_siteConfig.paywallEnabled === 'false') {
    const paywall = document.getElementById('paywall-overlay');
    if (paywall) paywall.style.display = 'none';
  }
  document.body.addEventListener('click', () => { if (vrVideo?.paused) vrVideo.play().catch(()=>{}); }, { once: true });
}

function toggleVideo() {
  if (!vrVideo) return;
  const audio = document.getElementById('spatial-audio');
  vrVideo.paused ? (vrVideo.play(), audio?.components?.sound?.playSound()) : (vrVideo.pause(), audio?.components?.sound?.pauseSound());
}

function toggleMute()  { if (vrVideo) vrVideo.muted = !vrVideo.muted; }
function recenterView(){ document.querySelector('a-camera')?.setAttribute('rotation','0 0 0'); }

async function unlockPreview() {
  if (!_currentUser) { openAuthModal('signin'); return; }
  const paywall = document.getElementById('paywall-overlay');
  if (paywall) paywall.style.display = 'none';
  const vrId = document.querySelector('.vr-wrapper')?.dataset.vrId;
  if (vrId) {
    try {
      const url = await MemberAccess.getVideoUrl(vrId);
      const vid = document.getElementById('preview-video');
      if (vid) { vid.src = url; vid.play().catch(()=>{}); }
    } catch (err) { showToast(err.message,'error'); }
  } else { vrVideo?.play().catch(()=>{}); }
}

function enterVRFullscreen() {
  const s = document.querySelector('a-scene');
  s?.requestFullscreen?.() || s?.webkitRequestFullscreen?.();
}

// ── Standard Player ───────────────────────────────────────────
function initStdPlayer() {
  const video      = document.getElementById('main-video');
  const playBtn    = document.getElementById('ctrl-play');
  const muteBtn    = document.getElementById('ctrl-mute');
  const fsBtn      = document.getElementById('ctrl-fs');
  const progress   = document.querySelector('.progress-bar');
  const fill       = document.querySelector('.progress-fill');
  const volSlider  = document.getElementById('vol-slider');
  const timeDisp   = document.querySelector('.time-display');
  const playerWrap = document.querySelector('.player-wrap');
  if (!video || !playerWrap) return;

  const togglePlay = () => { video.paused ? video.play() : video.pause(); updatePlayIcon(); };
  video.addEventListener('click', togglePlay);
  playBtn?.addEventListener('click', togglePlay);

  function updatePlayIcon() {
    if (!playBtn) return;
    playBtn.innerHTML = video.paused ? `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>` : `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
  }
  video.addEventListener('timeupdate', () => {
    if (!video.duration) return;
    if (fill)     fill.style.width  = (video.currentTime/video.duration*100)+'%';
    if (timeDisp) timeDisp.textContent = formatTime(video.currentTime)+' / '+formatTime(video.duration);
  });
  progress?.addEventListener('click', e => {
    video.currentTime = ((e.clientX - progress.getBoundingClientRect().left) / progress.offsetWidth) * video.duration;
  });
  muteBtn?.addEventListener('click', () => { video.muted = !video.muted; if(volSlider) volSlider.value = video.muted?0:video.volume; updateMuteIcon(); });
  volSlider?.addEventListener('input', e => { video.volume = e.target.value; video.muted = video.volume===0; updateMuteIcon(); });
  function updateMuteIcon() {
    if (!muteBtn) return;
    muteBtn.innerHTML = video.muted ? `<svg viewBox="0 0 24 24"><path d="M16.5 12A4.5 4.5 0 0014 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>` : `<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`;
  }
  fsBtn?.addEventListener('click', () => { document.fullscreenElement ? document.exitFullscreen() : playerWrap.requestFullscreen?.() || playerWrap.webkitRequestFullscreen?.(); });
  document.addEventListener('keydown', e => {
    if (['INPUT','TEXTAREA'].includes(e.target.tagName)) return;
    if (e.code==='Space')      { e.preventDefault(); togglePlay(); }
    if (e.code==='ArrowRight') video.currentTime += 10;
    if (e.code==='ArrowLeft')  video.currentTime -= 10;
    if (e.code==='KeyM')       { video.muted = !video.muted; updateMuteIcon(); }
    if (e.code==='KeyF')       fsBtn?.click();
  });
}

function formatTime(s) { return `${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,'0')}`; }

async function openPlayer(src, title) {
  if (!src) { openAuthModal('signin'); return; }
  const section = document.getElementById('player');
  const video   = document.getElementById('main-video');
  const titleEl = document.getElementById('player-title');
  if (!section || !video) return;
  video.src = src;
  if (titleEl) titleEl.textContent = title || '';
  section.style.display = 'block';
  section.scrollIntoView({ behavior:'smooth' });
  video.play().catch(()=>{});
  await logEvent('video_access', { title });
}

function closePlayer() {
  const section = document.getElementById('player');
  const video   = document.getElementById('main-video');
  if (video) { video.pause(); video.src = ''; }
  if (section) section.style.display = 'none';
  document.getElementById('gallery')?.scrollIntoView({ behavior:'smooth' });
}

function openPaywall() { if (!_currentUser) openAuthModal('signin'); }

// ── Utilities ─────────────────────────────────────────────────
function initCursor() {
  const dot = document.querySelector('.cursor'), follower = document.querySelector('.cursor-follower');
  if (!dot || !follower) return;
  let mx=0,my=0,fx=0,fy=0;
  document.addEventListener('mousemove', e => { mx=e.clientX; my=e.clientY; dot.style.transform=`translate(${mx-5}px,${my-5}px)`; });
  (function loop(){ fx+=(mx-fx-18)*0.12; fy+=(my-fy-18)*0.12; follower.style.transform=`translate(${fx}px,${fy}px)`; requestAnimationFrame(loop); })();
  document.querySelectorAll('a,button,.clip-card,.btn,input,textarea').forEach(el => {
    el.addEventListener('mouseenter', ()=>{ follower.style.borderColor='rgba(201,168,76,0.9)'; });
    el.addEventListener('mouseleave', ()=>{ follower.style.borderColor='rgba(201,168,76,0.5)'; });
  });
}

function initReveal() {
  const els = document.querySelectorAll('.reveal:not(.visible)');
  if (!els.length) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e,i) => { if(e.isIntersecting){ setTimeout(()=>e.target.classList.add('visible'),i*80); io.unobserve(e.target); } });
  }, { threshold:0.1 });
  els.forEach(el => io.observe(el));
}

function initNav() {
  const navbar=document.querySelector('.navbar'), burger=document.querySelector('.burger'), navLinks=document.querySelector('.nav-links');
  if (navbar) window.addEventListener('scroll', ()=>navbar.classList.toggle('scrolled',scrollY>60));
  if (burger && navLinks) {
    burger.addEventListener('click', ()=>navLinks.classList.toggle('open'));
    navLinks.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>navLinks.classList.remove('open')));
  }
}

function initAgeGate() {
  const gate = document.getElementById('age-gate');
  if (!gate) return;
  if (sessionStorage.getItem('ageVerified')) { gate.style.display='none'; return; }
  document.getElementById('age-yes')?.addEventListener('click', ()=>{ sessionStorage.setItem('ageVerified','true'); gate.style.opacity='0'; gate.style.transition='opacity 0.6s'; setTimeout(()=>gate.remove(),600); });
  document.getElementById('age-no')?.addEventListener('click', ()=>{ window.location.href='https://www.google.com'; });
}

function showSection(name, el) {
  document.querySelectorAll('.admin-section').forEach(s=>s.style.display='none');
  const sec = document.getElementById('sec-'+name);
  if (sec) sec.style.display = 'block';
  document.querySelectorAll('.admin-nav-item').forEach(a=>a.classList.remove('active'));
  if (el) el.classList.add('active');
  const titles = { overview:'Overview', upload:'Upload Videos', library:'Video Library', theme:'Theme & Colors', flags:'Site Flags' };
  const titleEl = document.getElementById('section-title');
  if (titleEl) titleEl.textContent = titles[name] || name;
  return false;
}

function showToast(msg, type='success') {
  let c = document.getElementById('toast-container');
  if (!c) { c=document.createElement('div'); c.id='toast-container'; c.style.cssText='position:fixed;bottom:2rem;right:2rem;z-index:99999;display:flex;flex-direction:column;gap:0.5rem;'; document.body.appendChild(c); }
  const t = document.createElement('div');
  t.style.cssText = `padding:0.85rem 1.5rem;background:var(--bg-card);border:1px solid ${type==='success'?'var(--gold-dim)':'rgba(180,60,60,0.5)'};border-radius:var(--radius-sm);font-size:0.78rem;color:var(--text-primary);font-family:var(--font-body);letter-spacing:0.04em;box-shadow:0 8px 30px rgba(0,0,0,0.5);animation:fadeUp 0.35s ease;max-width:300px;`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(()=>t.remove(), 3500);
}

function escHtml(str='') { return String(str).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

function updateClock() {
  const el = document.getElementById('admin-time');
  if (el) el.textContent = new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
}
