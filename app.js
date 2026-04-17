/* ============================================================
   MINDSTATZ — app.js
   Core JS: cursor, nav, gallery, paywall, video, admin flags
   ============================================================ */

'use strict';

/* ── Default Admin Flags ──────────────────────────────────────── */
const DEFAULT_ADMIN_FLAGS = {
  uiControls:     true,
  spatialAudio:   true,
  iosTweaks:      true,
  paywallEnabled: true,
  accentColor:    '#c9a84c',
  bgStyle:        'void',
};

let adminFlags = JSON.parse(localStorage.getItem('adminFlags')) || { ...DEFAULT_ADMIN_FLAGS };

function saveFlags() {
  localStorage.setItem('adminFlags', JSON.stringify(adminFlags));
}

function applyFlags() {
  // Paywall
  const paywall = document.getElementById('paywall-overlay');
  if (paywall) paywall.style.display = adminFlags.paywallEnabled ? 'flex' : 'none';

  // VR UI panel
  const uiPanel = document.getElementById('ui-panel');
  if (uiPanel) uiPanel.setAttribute('visible', adminFlags.uiControls);

  // Spatial audio
  const audioEl = document.getElementById('spatial-audio');
  if (audioEl) audioEl.setAttribute('sound', 'autoplay', adminFlags.spatialAudio);

  // Accent color via CSS variable
  if (adminFlags.accentColor) {
    document.documentElement.style.setProperty('--gold', adminFlags.accentColor);
  }

  // Background style
  applyBgStyle(adminFlags.bgStyle || 'void');
}

function toggleFlag(flag, value) {
  adminFlags[flag] = value;
  saveFlags();
  applyFlags();
}

function applyBgStyle(style) {
  const body = document.body;
  body.classList.remove('bg-void', 'bg-velvet', 'bg-cosmic', 'bg-noir');
  body.classList.add('bg-' + style);
}

/* ── Custom Cursor ─────────────────────────────────────────── */
function initCursor() {
  const dot      = document.querySelector('.cursor');
  const follower = document.querySelector('.cursor-follower');
  if (!dot || !follower) return;

  let mouseX = 0, mouseY = 0;
  let followerX = 0, followerY = 0;

  document.addEventListener('mousemove', e => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    dot.style.transform = `translate(${mouseX - 5}px, ${mouseY - 5}px)`;
  });

  function animateFollower() {
    followerX += (mouseX - followerX - 18) * 0.12;
    followerY += (mouseY - followerY - 18) * 0.12;
    follower.style.transform = `translate(${followerX}px, ${followerY}px)`;
    requestAnimationFrame(animateFollower);
  }
  animateFollower();

  // Hover effects on interactive elements
  const hoverEls = document.querySelectorAll('a, button, .clip-card, .btn, input, textarea, .admin-nav-item, .color-swatch');
  hoverEls.forEach(el => {
    el.addEventListener('mouseenter', () => {
      dot.style.transform += ' scale(2)';
      follower.style.transform += ' scale(1.5)';
      follower.style.borderColor = 'rgba(201,168,76,0.9)';
    });
    el.addEventListener('mouseleave', () => {
      follower.style.borderColor = 'rgba(201,168,76,0.5)';
    });
  });
}

/* ── Scroll-Reveal ─────────────────────────────────────────── */
function initReveal() {
  const els = document.querySelectorAll('.reveal');
  if (!els.length) return;

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        setTimeout(() => entry.target.classList.add('visible'), i * 80);
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  els.forEach(el => io.observe(el));
}

/* ── Sticky Nav ────────────────────────────────────────────── */
function initNav() {
  const navbar = document.querySelector('.navbar');
  if (!navbar) return;

  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 60);
  });

  // Burger menu
  const burger = document.querySelector('.burger');
  const navLinks = document.querySelector('.nav-links');
  if (burger && navLinks) {
    burger.addEventListener('click', () => {
      navLinks.classList.toggle('open');
      burger.classList.toggle('open');
    });
    // Close on link click
    navLinks.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => navLinks.classList.remove('open'));
    });
  }

  // Active link highlighting
  const sections = document.querySelectorAll('section[id]');
  const navAs = document.querySelectorAll('.nav-links a');
  window.addEventListener('scroll', () => {
    let current = '';
    sections.forEach(s => {
      if (window.scrollY >= s.offsetTop - 120) current = s.id;
    });
    navAs.forEach(a => {
      a.classList.toggle('active', a.getAttribute('href') === '#' + current);
    });
  });
}

/* ── Age Gate ──────────────────────────────────────────────── */
function initAgeGate() {
  const gate = document.getElementById('age-gate');
  if (!gate) return;

  if (sessionStorage.getItem('ageVerified') === 'true') {
    gate.style.display = 'none';
    return;
  }

  document.getElementById('age-yes')?.addEventListener('click', () => {
    sessionStorage.setItem('ageVerified', 'true');
    gate.style.opacity = '0';
    gate.style.transition = 'opacity 0.6s ease';
    setTimeout(() => gate.remove(), 600);
  });

  document.getElementById('age-no')?.addEventListener('click', () => {
    window.location.href = 'https://www.google.com';
  });
}

/* ── VR Player ─────────────────────────────────────────────── */
let vrVideo = null;

function initVRPlayer() {
  vrVideo = document.getElementById('preview-video');
  if (!vrVideo) return;

  // iOS autoplay unlock — single tap on body
  document.body.addEventListener('click', () => {
    if (vrVideo && vrVideo.paused) vrVideo.play().catch(() => {});
  }, { once: true });
}

function toggleVideo() {
  if (!vrVideo) return;
  const audioEl = document.getElementById('spatial-audio');
  if (vrVideo.paused) {
    vrVideo.play();
    audioEl?.components?.sound?.playSound();
  } else {
    vrVideo.pause();
    audioEl?.components?.sound?.pauseSound();
  }
}

function toggleMute() {
  if (!vrVideo) return;
  vrVideo.muted = !vrVideo.muted;
}

function recenterView() {
  document.querySelector('a-camera')?.setAttribute('rotation', '0 0 0');
}

function unlockPreview() {
  toggleFlag('paywallEnabled', false);
  vrVideo?.play().catch(() => {});
}

/* ── Standard Video Player ─────────────────────────────────── */
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

  // Play / Pause
  const togglePlay = () => {
    video.paused ? video.play() : video.pause();
    updatePlayIcon();
  };

  video.addEventListener('click', togglePlay);
  playBtn?.addEventListener('click', togglePlay);

  function updatePlayIcon() {
    if (!playBtn) return;
    playBtn.innerHTML = video.paused
      ? `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`
      : `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
  }

  // Progress
  video.addEventListener('timeupdate', () => {
    if (!video.duration) return;
    const pct = (video.currentTime / video.duration) * 100;
    if (fill) fill.style.width = pct + '%';
    if (timeDisp) timeDisp.textContent = formatTime(video.currentTime) + ' / ' + formatTime(video.duration);
  });

  progress?.addEventListener('click', e => {
    const rect = progress.getBoundingClientRect();
    const pct  = (e.clientX - rect.left) / rect.width;
    video.currentTime = pct * video.duration;
  });

  // Volume
  muteBtn?.addEventListener('click', () => {
    video.muted = !video.muted;
    if (volSlider) volSlider.value = video.muted ? 0 : video.volume;
    updateMuteIcon();
  });

  volSlider?.addEventListener('input', e => {
    video.volume = e.target.value;
    video.muted  = video.volume === 0;
    updateMuteIcon();
  });

  function updateMuteIcon() {
    if (!muteBtn) return;
    muteBtn.innerHTML = video.muted
      ? `<svg viewBox="0 0 24 24"><path d="M16.5 12A4.5 4.5 0 0014 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>`
      : `<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`;
  }

  // Fullscreen
  fsBtn?.addEventListener('click', () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      playerWrap.requestFullscreen?.() || playerWrap.webkitRequestFullscreen?.();
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    if (e.code === 'ArrowRight') video.currentTime += 10;
    if (e.code === 'ArrowLeft')  video.currentTime -= 10;
    if (e.code === 'KeyM')       { video.muted = !video.muted; updateMuteIcon(); }
    if (e.code === 'KeyF')       fsBtn?.click();
  });
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

/* ── Gallery hover-play ────────────────────────────────────── */
function initGallery() {
  document.querySelectorAll('.clip-card video').forEach(v => {
    const card = v.closest('.clip-card');
    card?.addEventListener('mouseenter', () => v.play().catch(() => {}));
    card?.addEventListener('mouseleave', () => { v.pause(); v.currentTime = 0; });
  });
}

/* ── Admin Login ───────────────────────────────────────────── */
const ADMIN_CREDENTIALS = {
  username: 'admin',
  password: 'mindstatz2024'   // ← change before deploying
};

function adminLogin(e) {
  if (e) e.preventDefault();
  const user = document.getElementById('admin-user')?.value;
  const pass = document.getElementById('admin-pass')?.value;

  if (user === ADMIN_CREDENTIALS.username && pass === ADMIN_CREDENTIALS.password) {
    localStorage.setItem('adminAuthed', 'true');
    window.location.href = 'admin.html';
  } else {
    const err = document.getElementById('login-error');
    if (err) { err.textContent = 'Invalid credentials.'; err.style.display = 'block'; }
    // Shake animation
    const box = document.querySelector('.admin-login-box');
    box?.classList.add('shake');
    setTimeout(() => box?.classList.remove('shake'), 500);
  }
}

function checkAdminAuth() {
  if (localStorage.getItem('adminAuthed') !== 'true') {
    window.location.href = 'index.html#admin-login';
  }
}

function adminLogout() {
  localStorage.removeItem('adminAuthed');
  window.location.href = 'index.html';
}

/* ── Admin: Video Management ───────────────────────────────── */
function getVideoLibrary() {
  return JSON.parse(localStorage.getItem('videoLibrary')) || [];
}

function saveVideoLibrary(lib) {
  localStorage.setItem('videoLibrary', JSON.stringify(lib));
}

function addVideo(entry) {
  const lib = getVideoLibrary();
  lib.unshift({ ...entry, id: Date.now(), createdAt: new Date().toISOString() });
  saveVideoLibrary(lib);
  renderVideoTable();
}

function removeVideo(id) {
  const lib = getVideoLibrary().filter(v => v.id !== id);
  saveVideoLibrary(lib);
  renderVideoTable();
}

function renderVideoTable() {
  const tbody = document.getElementById('video-tbody');
  if (!tbody) return;
  const lib = getVideoLibrary();

  if (!lib.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:2rem;">No videos uploaded yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = lib.map(v => `
    <tr>
      <td><div class="thumb skeleton"></div></td>
      <td style="color:var(--text-primary)">${escHtml(v.title)}</td>
      <td><span class="clip-badge ${v.type}">${v.type.toUpperCase()}</span></td>
      <td>${v.access === 'free' ? '<span style="color:var(--gold)">Free</span>' : '<span style="color:var(--violet-light)">Premium</span>'}</td>
      <td style="color:var(--text-muted)">${new Date(v.createdAt).toLocaleDateString()}</td>
      <td>
        <button class="btn btn-ghost" style="padding:0.3rem 0.7rem;font-size:0.65rem" onclick="removeVideo(${v.id})">Remove</button>
      </td>
    </tr>
  `).join('');
}

function escHtml(str) {
  return str.replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}

/* ── Admin: Upload Form ────────────────────────────────────── */
function initUploadForm() {
  const form = document.getElementById('upload-form');
  if (!form) return;

  form.addEventListener('submit', e => {
    e.preventDefault();
    const title  = document.getElementById('up-title')?.value.trim();
    const url    = document.getElementById('up-url')?.value.trim();
    const type   = document.getElementById('up-type')?.value;
    const access = document.getElementById('up-access')?.value;
    const desc   = document.getElementById('up-desc')?.value.trim();

    if (!title || !url) return;

    addVideo({ title, url, type, access, desc });
    form.reset();
    showToast('Video added successfully!');
  });

  // Drag & drop zone
  const zone = document.querySelector('.upload-zone');
  if (zone) {
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('dragover');
      showToast('File upload requires server-side storage. Please use a URL or embed link for GitHub Pages.');
    });
  }
}

/* ── Admin: Theme Controls ─────────────────────────────────── */
function initThemeControls() {
  // Accent color swatches
  document.querySelectorAll('.color-swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
      const color = swatch.dataset.color;
      adminFlags.accentColor = color;
      saveFlags();
      applyFlags();
    });
    // Mark active
    if (swatch.dataset.color === adminFlags.accentColor) swatch.classList.add('active');
  });

  // Background style buttons
  document.querySelectorAll('[data-bg]').forEach(btn => {
    btn.addEventListener('click', () => {
      adminFlags.bgStyle = btn.dataset.bg;
      saveFlags();
      applyFlags();
    });
  });

  // Toggle switches
  document.querySelectorAll('.admin-toggle-input').forEach(input => {
    const flag = input.dataset.flag;
    if (flag) {
      input.checked = !!adminFlags[flag];
      input.addEventListener('change', () => toggleFlag(flag, input.checked));
    }
  });
}

/* ── Toast Notification ────────────────────────────────────── */
function showToast(msg, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = `
      position:fixed;bottom:2rem;right:2rem;z-index:99999;
      display:flex;flex-direction:column;gap:0.5rem;
    `;
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.style.cssText = `
    padding:0.85rem 1.5rem;
    background:var(--bg-card);
    border:1px solid ${type === 'success' ? 'var(--gold-dim)' : 'rgba(180,60,60,0.5)'};
    border-radius:var(--radius-sm);
    font-size:0.78rem;
    color:var(--text-primary);
    font-family:var(--font-body);
    letter-spacing:0.04em;
    box-shadow:0 8px 30px rgba(0,0,0,0.5);
    animation:fadeUp 0.35s ease;
    max-width:300px;
  `;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

/* ── Init ──────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  applyFlags();
  initCursor();
  initReveal();
  initNav();
  initAgeGate();
  initVRPlayer();
  initStdPlayer();
  initGallery();
  initUploadForm();
  initThemeControls();
  renderVideoTable();
});
