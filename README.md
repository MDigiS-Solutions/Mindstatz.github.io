# Mindstatz — Adult VR & Video Platform

A self-contained, GitHub Pages–ready adult content platform with VR 360° support, a premium video gallery, paywall system, and a full admin dashboard.

---

## 📁 File Structure

```
mindstatz/
├── index.html        ← Main site (gallery, VR preview, contact, admin login)
├── admin.html        ← Admin dashboard (upload, theme, flags, library)
├── styles.css        ← Unified stylesheet (dark luxury theme)
├── app.js            ← All JavaScript logic
├── assets/           ← Put your video files here
│   ├── featured-video.mp4
│   ├── vr-preview.mp4
│   ├── video1.mp4
│   ├── video2.mp4
│   └── ...
└── README.md
```

---

## 🚀 GitHub Pages Deployment

1. Create a new GitHub repository
2. Upload all files maintaining the folder structure above
3. Go to **Settings → Pages** → Source: **Deploy from branch** → Branch: `main` → folder: `/ (root)`
4. Your site will be live at `https://yourusername.github.io/repo-name/`

---

## 🎬 Adding Videos

### Option A — Small files (&lt;100MB)
Place `.mp4` files in the `assets/` folder and reference them as `assets/filename.mp4`

### Option B — Large files (recommended for HD content)
Host on an external CDN (Cloudinary, Bunny.net, Vimeo) and paste the full URL into the Admin upload form.

### Option C — Git LFS
Enable [Git Large File Storage](https://git-lfs.github.com/) to store files up to 2GB in your repo.

---

## 🔐 Admin Access

Default credentials (change immediately in Admin → Site Flags → Admin Credentials):
- **Username:** `admin`
- **Password:** `mindstatz2024`

Access the admin dashboard at: `/admin.html` or click **Admin** in the nav.

---

## ⚙️ Admin Features

| Feature | Description |
|---|---|
| **Upload Videos** | Add 2D regular or VR 360° videos with title, URL, access level |
| **Video Library** | View and remove all uploaded videos |
| **Theme & Colors** | Change accent color (preset swatches or custom hex), background style, hero text |
| **Site Flags** | Toggle paywall, VR UI controls, spatial audio, iOS tweaks on/off |
| **Credentials** | Update admin username/password (stored in localStorage) |

---

## 🥽 VR Player

Built with [A-Frame 1.3.0](https://aframe.io). The VR preview section uses a `<a-videosphere>` for 360° equirectangular video. Features:
- Floating in-scene UI controls (play/pause, mute, recenter, fullscreen)
- Spatial positional audio
- Gyroscope support on mobile
- VR headset mode toggle
- iOS autoplay unlock on first tap

**VR video format:** Equirectangular 360° `.mp4`, ideally 4K (3840×1920) or 5.7K.

---

## 🎨 Customization

All colors are CSS variables in `styles.css`:

```css
:root {
  --gold:          #c9a84c;   /* Primary accent */
  --violet:        #6b3fa0;   /* Secondary accent */
  --bg-void:       #080808;   /* Main background */
  /* ... */
}
```

Change these in the Admin → Theme & Colors panel, or edit `styles.css` directly.

---

## ⚠️ Important Notes

- This is a **static site** — all data (video library, flags, credentials) is stored in **localStorage** (browser-only, per device). For a multi-device setup, you'll need a backend.
- The paywall is **client-side only** — not secure for real payment gating. For real paywalls, integrate a service like Paddle, Stripe, or Fanvue.
- Add 2257 compliance statement and age verification as required by law in your jurisdiction.
- Ensure all content complies with applicable laws and platform terms.

---

## 🛠 Tech Stack

- HTML5 / CSS3 / Vanilla JS (no frameworks, no build step)
- [A-Frame 1.3.0](https://aframe.io) — VR/WebXR
- [Google Fonts](https://fonts.google.com) — Cormorant Garamond + Montserrat
- localStorage — state persistence
- GitHub Pages — static hosting
