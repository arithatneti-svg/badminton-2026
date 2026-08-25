# 🏸 Badminton Sports Day 2026

ระบบ Scoreboard / Match Management แบบเรียลไทม์ (Firebase Realtime Database)
ประกอบด้วย 2 แอปที่ใช้ฐานข้อมูลเดียวกัน (`sportsday_2026_data`):

| แอป | ไฟล์ | ใช้ทำอะไร |
|-----|------|-----------|
| **Scoreboard / Admin** | `index.html` | จอแสดงผลหลัก, สร้างแมตช์, รายงาน, dashboard, โปรไฟล์ผู้เล่น, ระบบ prediction |
| **Umpire Panel** | `umpire.html` | แผงกรรมการบนมือถือ — กดคะแนนสด เขียนลง `ongoingMatches/*/live/*` |

> เดิมทั้งหมดรวมอยู่ในไฟล์เดียว (`index.html` ~10,500 บรรทัด / `umpire.html` ~2,300 บรรทัด)
> ตอนนี้แยกเป็นโครงสร้างโมดูลแบบ **static (ไม่มี build step)** เพื่อให้อ่าน/แก้ง่าย และพร้อมอัปเกรดเป็น Vite/ES Modules ในอนาคต

---

## 📁 โครงสร้างโปรเจกต์

```
Badminton 2026/
├── index.html              # แอปหลัก — เหลือแค่ HTML shell + <link>/<script>
├── umpire.html             # แอปกรรมการ — HTML shell
├── README.md               # ไฟล์นี้
│
├── manifest.webmanifest    # PWA manifest — แอป Scoreboard (ติดตั้งลงจอโฮมได้)
├── umpire.webmanifest      # PWA manifest — แอป Umpire (ติดตั้งแยกอีกไอคอน)
├── sw.js                   # ⭐ Service worker — cache app shell (เปิดเร็ว/ทนเน็ตวูบ)
├── icons/                  # ไอคอน PWA: icon-* (scoreboard), umpire-* (192/512/maskable)
│
├── shared/
│   ├── firebase-config.js  # config + firebase.initializeApp() ใช้ร่วมกันทั้ง 2 แอป
│   └── pwa.js              # ⭐ ลงทะเบียน service worker
│
├── css/                    # สไตล์ของ index.html (แตกจาก <style> ก้อนเดียว)
│   ├── base.css            # tokens/ตัวแปรสี, ธีม (gold/red/blue), reset, body
│   ├── login.css           # หน้า login + role-based visibility
│   ├── nav.css             # navbar + ปุ่มต่าง ๆ
│   ├── scoreboard.css      # containers + แท็บ Scoreboard + UI components
│   ├── match-cards.css     # การ์ดแมตช์ (live/finished) + G1 toast
│   ├── tables-modals.css   # ตาราง/ชาร์ต + โครง modal
│   ├── dashboard.css       # แท็บ Dashboard
│   ├── picker.css          # ตัวเลือกสร้างแมตช์
│   ├── notifications.css    # ป็อปอัปแจ้งผลแมตช์ (slide-in)
│   ├── ongoing-finished.css# แท็บ Ongoing/Finished + row card + score hero
│   ├── prediction.css      # สไตล์ prediction engine
│   ├── climax.css          # การ์ด climax/deuce + live score display
│   ├── fullscreen.css      # bottom nav ตอน fullscreen
│   ├── ranking.css         # performance ranking
│   ├── trophy.css          # พิธีมอบถ้วย (trophy ceremony)
│   ├── responsive.css      # responsive/มือถือ (navbar wrap ฯลฯ)
│   ├── profile.css         # โมดัลโปรไฟล์ผู้เล่น
│   ├── components.css      # toast, season, compare, play-style badges, theme fixes, mobile fixes
│   ├── backup.css          # UI ของ Backup & Restore
│   ├── qr.css              # UI ของ QR modal (ผู้ชม / กรรมการ)
│   ├── tv.css              # TV/Projector mode (จอใหญ่หน้างาน)
│   └── umpire.css          # สไตล์ทั้งหมดของ umpire.html
│
├── js/                     # โค้ดของ index.html (แตกจาก <script> ก้อนเดียว)
│   ├── utils.js            # debounce, escHtml
│   ├── prediction.js       # prediction engine (getMatchPrediction, buildPredictionHTML …)
│   ├── auth.js             # login/logout, ระบบ role (guest/admin/superadmin)
│   ├── core.js             # ⭐ appState, dbRef, DEFAULT_PLAYERS, loadData/saveData, reset, scout gate, realtime listeners
│   ├── ui.js               # switchTab, updateUI, showToast, fullscreen
│   ├── player-profile.js   # โมดัลโปรไฟล์ + ability chart + H2H + career tab
│   ├── season.js           # season wizard/archive + play styles + Players tab
│   ├── compare.js          # เปรียบเทียบผู้เล่น
│   ├── export-import.js    # export/import ข้อมูล
│   ├── match-picker.js     # สร้างแมตช์ (queue) + mock match
│   ├── match-render.js     # timers + render ongoing/finished
│   ├── result-entry.js     # กรอก/แก้ผล + auto-finalize จาก umpire + quick score
│   ├── stats.js            # analyzeSkillGap, buildPlayerStats, player DB render
│   ├── reports.js          # แท็บ Reports (ตาราง, sub-tabs, umpire workload, under/over)
│   ├── pdf-export.js       # export PDF (summary/rounds/player) + CSV
│   ├── dashboard.js        # dashboard charts (raw score, momentum, heatmap …)
│   ├── ranking.js          # performance ranking engine
│   ├── effects.js          # print report, flashScore, fire/confetti, trophy
│   ├── notifications.js    # ป็อปอัปแจ้งผล + reaction (emoji ในตัว), narrative builder, confirm dialog, app init
│   ├── backup.js           # ⭐ Auto-backup + Restore (snapshot ไป path แยก sportsday_2026_backups)
│   ├── qr.js               # ⭐ QR: ผู้ชมดูสด (?view=live) + กรรมการ (umpire.html)
│   ├── tv.js               # ⭐ TV/Projector mode (?view=tv) — วน Battle/Live/Leaderboard
│   └── vendor/
│       └── qrcode.min.js   # QR generator (Kazuhiko Arase, MIT) — vendored, ไม่พึ่ง CDN
│
├── umpire/
│   └── umpire.js           # โค้ดทั้งหมดของ umpire.html (dbRef → end)
│
└── backup/                 # 🔒 ต้นฉบับก่อนแยกไฟล์ (ห้ามแก้ — ไว้กู้คืน/อ้างอิง)
    ├── index.original.html
    └── umpire.original.html
```

---

## ▶️ วิธีรัน / build (local)

ครั้งแรกลง dependency (มีแค่ esbuild): `npm install`

```bash
npm run dev       # เสิร์ฟ source ตรง ๆ (ไฟล์แยก) → http://localhost:5173  ไม่ต้อง build
npm run build     # รวม+ย่อ js/css เป็นก้อนเดียว → dist/
npm run preview   # build แล้วเสิร์ฟ dist/ → http://localhost:4173 (เหมือน production)
```

- **แก้โค้ด** ให้แก้ที่ไฟล์ source (`css/*`, `js/*`) แล้วดูด้วย `npm run dev` — **ห้ามแก้ที่ `dist/`** (ถูก gen ใหม่ทุก build และ gitignore ไว้)
- **Build ทำอะไร**: ต่อไฟล์ตามลำดับโหลด → `dist/assets/app.js` + `app.css` (และ `umpire.*`), ย่อขนาด **โดยไม่เปลี่ยนชื่อ global** (onclick/ตัวแปรร่วมยังทำงานเหมือนเดิม), คัดลอก icons/manifests, สร้าง `sw.js` ที่ชี้ bundle ใหม่
- ต้องเปิดผ่าน HTTP server (ไม่ใช่ `file://`) เพราะ Firebase ต้องใช้ origin http/https

> **หมายเหตุ:** บน localhost จะเห็น `PERMISSION_DENIED` + service worker ลงทะเบียนไม่ได้ ('unknown error fetching script') — ปกติ SW ต้อง HTTPS ทดสอบจริงบน `pages.dev` ได้เลย

> **หมายเหตุ:** ตอนรันบน localhost จะเห็น `PERMISSION_DENIED` ที่ `/sportsday_2026_data` ใน console —
> เป็นเรื่อง **security rules** ของ Firebase (อนุญาตเฉพาะโดเมนที่ deploy) ไม่เกี่ยวกับการแยกไฟล์
> และเกิดกับไฟล์ต้นฉบับเดิมเช่นกัน

## ☁️ วิธี deploy

ทั้งโปรเจกต์เป็น **static files** ล้วน — อัปโหลดทั้งโฟลเดอร์ขึ้นได้เลย (ยกเว้น `backup/` ไม่ต้องขึ้นก็ได้):

- **Cloudflare Pages** — ชี้ build output ที่ root ของโฟลเดอร์นี้ (ไม่มี build command)
- **Firebase Hosting** — `firebase deploy` โดยตั้ง `public` เป็นโฟลเดอร์นี้

---

## ⚙️ กติกาสำคัญของโครงสร้างนี้ (อ่านก่อนแก้โค้ด)

1. **ยังเป็น classic scripts (ไม่ใช่ ES Modules)** — ทุกฟังก์ชัน/ตัวแปรเป็น **global** ร่วมกันทุกไฟล์
   ปุ่มต่าง ๆ ยังเรียกผ่าน `onclick="ชื่อฟังก์ชัน()"` ได้เหมือนเดิม → **ห้ามใส่** `type="module"` ให้ `<script>` เหล่านี้ (จะทำให้ scope แยกและพังทันที)

2. **ลำดับการโหลดสำคัญ** — `<script>` ทุกตัวใส่ `defer` เพื่อ (ก) รักษาลำดับเดิม (ข) ดาวน์โหลดขนานแล้วรันรวดเดียวหลัง parse เสร็จ ป้องกัน race condition ระหว่างไฟล์
   - `shared/firebase-config.js` ต้องมาก่อน `js/*` เสมอ (init Firebase ก่อนใช้งาน)
   - `js/core.js` นิยาม `appState` / `dbRef` — ไฟล์อื่นเรียกใช้ได้เพราะเป็น global

3. **จุดที่แก้พฤติกรรมจริง 1 จุด** — ใน `js/core.js` การ attach `.info/connected` (ตัวบอกสถานะ LIVE/OFFLINE)
   ถูกย้ายไปทำใน `DOMContentLoaded` เพราะ callback ของมัน fire แบบ *synchronous* ทันทีที่ attach
   ถ้าไม่ย้าย มันจะเรียก `showToast()` (อยู่ `js/ui.js`) ตั้งแต่ตอน `core.js` ยังโหลดไม่ถึง ui.js → error
   (ตอนเป็นไฟล์เดียวไม่มีปัญหาเพราะ hoisting อยู่สคริปต์เดียวกัน)

4. **CSS เป็นไฟล์ภายนอกแล้ว** — อาจเห็นจอวูบ (FOUC) เสี้ยววินาทีตอนโหลดครั้งแรกบางเครื่อง
   บน production (HTTP/2/CDN) แทบไม่รู้สึก ถ้าจะกำจัดสนิทให้ทำตอนอัปเป็น Vite (จะ inline/bundle ให้)

5. **มี `<style>` เล็ก ๆ 1 ก้อนยังฝังใน `index.html`** (ส่วนกลางของ body) — ตั้งใจคงไว้เพื่อรักษาลำดับ cascade เดิม

---

## 👀 โหมดการดู (เปิดผ่าน URL / QR — ไม่ต้องล็อกอิน)

| URL | ใคร | ได้อะไร |
|-----|-----|---------|
| `/?view=live` | ผู้ชม | ดูคะแนนสด read-only (เข้าแท็บ Ongoing) |
| `/?view=tv` | จอโปรเจกเตอร์/ทีวี | จอใหญ่วนอัตโนมัติทุก 14 วิ: Team Battle → Live Now → Leaderboard |
| `/umpire.html` | กรรมการ | แผงให้คะแนน |

QR ของ live/กรรมการ + ปุ่ม "เปิดจอ TV" อยู่ในปุ่ม **📱 QR** บน nav (admin)

## 📲 PWA (ติดตั้ง + ออฟไลน์)

ทั้ง 2 แอปเป็น PWA ติดตั้งลงจอโฮมได้ และมี service worker cache app shell:
- **ติดตั้ง**: เปิดบนมือถือ → เมนู "เพิ่มลงในหน้าจอโฮม" (Android Chrome เด้ง prompt เอง) → ได้ไอคอนแอปแยกกัน (Scoreboard = 🏸 ทอง, Umpire = 🎯 เขียว)
- **ทนเน็ตวูบ**: เปิด/รีโหลดได้แม้เน็ตสะดุด (โหลด shell จาก cache) — แต่ **ข้อมูลสด (Firebase) ยังต้องมีเน็ต** (เป็น WebSocket ไม่ได้ cache)
- **อัปเดต**: ใช้ stale-while-revalidate → หลัง deploy ใหม่ ผู้ใช้ที่ติดตั้งไว้จะได้ของใหม่ใน **การเปิดครั้งถัดไป** (โหลดซ้ำ 1 รอบ) ถ้าเปลี่ยนโครงสร้างไฟล์เยอะ ให้บั๊มเวอร์ชัน `CACHE` ใน `sw.js` (เช่น `bdm2026-shell-v2`)
- SW ทำงานเฉพาะบน **HTTPS** (หรือ localhost ในเบราว์เซอร์จริง) — ทดสอบบน `pages.dev` ได้เลย

## 🔀 การเขียนข้อมูล (กันเขียนทับตอนหลายคนใช้พร้อมกัน)

เดิมทุกการบันทึกใช้ `dbRef.set(appState)` = เขียนทั้งต้นไม้ทับ → admin กับกรรมการเขียนชนกันได้
ตอนนี้แยกเป็น:
- **`saveData()`** — เขียนทั้งก้อน (ใช้เฉพาะงานที่เปลี่ยนหลายส่วน เช่น สร้าง/จบแมตช์, reset)
- **`saveKeys([keys])`** ([js/core.js](js/core.js)) — เขียนเฉพาะ key ที่เปลี่ยนด้วย `dbRef.update()` ใช้กับ ชื่อทีม / quick score / เพิ่ม-ลบ-แก้ผู้เล่น / โปรไฟล์ → **ไม่ไปทับ `ongoingMatches`** ที่กรรมการเขียนคะแนนสดอยู่
- **`saveMatch(id)`** ([umpire/umpire.js](umpire/umpire.js)) — กรรมการเขียนเฉพาะคอร์ทของตัวเอง (`ongoingMatches/<idx>`) ไม่ทับข้อมูล admin หรือคอร์ทอื่น

> ยังมีจุดที่ใช้ `set` ทั้งก้อนอยู่ (สร้าง/จบแมตช์, reset) — เป็นงานที่ admin เป็นเจ้าของ ความถี่ต่ำ ความเสี่ยงชนน้อย ค่อยปรับต่อในเฟสหลังได้

## 🚀 เส้นทางอัปเกรด (เฟสถัดไป)

โครงสร้างนี้จัดวางไว้ให้ขยับเป็นระบบสมัยใหม่ได้ทีละขั้น ไม่ต้องรื้อทีเดียว:

1. **เพิ่ม Vite** — `npm create vite`, ย้ายไฟล์เข้า `src/`, ได้ dev server + hot reload + bundle/minify
2. **เปลี่ยนเป็น ES Modules** — ใส่ `export`/`import` ทีละไฟล์ แล้วเลิกพึ่ง global
3. **เลิก inline `onclick`** — ย้ายไปผูกด้วย `addEventListener` (จำเป็นเมื่อเป็น modules)
4. **แยก config ออกจากโค้ด** — ย้ายค่า Firebase ไป `.env` (`import.meta.env`) แทน hardcode
5. **Cloudflare upload** — เพิ่ม Worker/R2 สำหรับอัปโหลดรูปโปรไฟล์ผู้เล่น (ช่อง `storageBucket` เตรียมไว้แล้ว)

> ต้นฉบับก่อนแยกอยู่ที่ `backup/` — เทียบ/กู้คืนได้ทุกเมื่อ
