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
├── shared/
│   └── firebase-config.js  # config + firebase.initializeApp() ใช้ร่วมกันทั้ง 2 แอป
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
│   ├── notifications.js    # GIF pool, ป็อปอัปแจ้งผล, narrative builder, confirm dialog, app init (DOMContentLoaded)
│   └── backup.js           # ⭐ Auto-backup + Restore (snapshot ไป path แยก sportsday_2026_backups)
│
├── umpire/
│   └── umpire.js           # โค้ดทั้งหมดของ umpire.html (dbRef → end)
│
└── backup/                 # 🔒 ต้นฉบับก่อนแยกไฟล์ (ห้ามแก้ — ไว้กู้คืน/อ้างอิง)
    ├── index.original.html
    └── umpire.original.html
```

---

## ▶️ วิธีรัน (local)

ต้องเปิดผ่าน **HTTP server** ไม่ใช่ double-click ไฟล์ (`file://`) เพราะ Firebase + การโหลดไฟล์ย่อยต้องใช้ origin แบบ http/https

```bash
# ใช้ Node (มีติดตั้งอยู่แล้ว)
npx --yes serve .
# หรือถ้ามี Python: python -m http.server 8000
```

แล้วเปิด `http://localhost:PORT/index.html` และ `.../umpire.html`

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

## 🚀 เส้นทางอัปเกรด (เฟสถัดไป)

โครงสร้างนี้จัดวางไว้ให้ขยับเป็นระบบสมัยใหม่ได้ทีละขั้น ไม่ต้องรื้อทีเดียว:

1. **เพิ่ม Vite** — `npm create vite`, ย้ายไฟล์เข้า `src/`, ได้ dev server + hot reload + bundle/minify
2. **เปลี่ยนเป็น ES Modules** — ใส่ `export`/`import` ทีละไฟล์ แล้วเลิกพึ่ง global
3. **เลิก inline `onclick`** — ย้ายไปผูกด้วย `addEventListener` (จำเป็นเมื่อเป็น modules)
4. **แยก config ออกจากโค้ด** — ย้ายค่า Firebase ไป `.env` (`import.meta.env`) แทน hardcode
5. **Cloudflare upload** — เพิ่ม Worker/R2 สำหรับอัปโหลดรูปโปรไฟล์ผู้เล่น (ช่อง `storageBucket` เตรียมไว้แล้ว)

> ต้นฉบับก่อนแยกอยู่ที่ `backup/` — เทียบ/กู้คืนได้ทุกเมื่อ
