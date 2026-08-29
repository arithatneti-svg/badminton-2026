# 🚀 Auto Deploy — Cloudflare Pages

เป้าหมาย: **แก้โค้ด → `git push` → เว็บอัปเดตเองอัตโนมัติ** (ไม่ต้องอัปไฟล์ด้วยมือ)

โปรเจกต์นี้เป็น static ล้วน จึง **ไม่ต้องมี build step** — Cloudflare Pages แค่เสิร์ฟไฟล์ตรง ๆ

---

## ① ตั้งครั้งเดียว (one-time)

### A. สร้าง GitHub repo แล้ว push โค้ดขึ้นไป

Repo ในเครื่องพร้อมแล้ว (มี commit แรกให้เรียบร้อย) เหลือแค่สร้าง remote บน GitHub:

**วิธีที่ 1 — ผ่านเว็บ**
1. ไปที่ https://github.com/new → ตั้งชื่อ repo เช่น `badminton-2026` → **Private** ก็ได้ → **อย่า** ติ๊ก "Add README" (เพราะเรามีแล้ว) → Create
2. กลับมาที่เครื่อง รันคำสั่งนี้ (แทน `<USER>` ด้วย GitHub username ของคุณ):

```bash
git remote add origin https://github.com/<USER>/badminton-2026.git
git push -u origin main
```

**วิธีที่ 2 — ถ้ามี GitHub CLI (`gh`)**

```bash
gh repo create badminton-2026 --private --source=. --push
```

### B. เชื่อม Cloudflare Pages กับ repo

1. เข้า https://dash.cloudflare.com → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. เลือก repo `badminton-2026` (อนุญาตให้ Cloudflare เข้าถึง GitHub ครั้งแรก)
3. ตั้งค่า build ดังนี้ (**สำคัญ — เพราะเป็น static ไม่มี build**):

   | ช่อง | ค่า |
   |------|-----|
   | Framework preset | **None** |
   | Build command | *(เว้นว่าง)* |
   | Build output directory | `/` |
   | Root directory | `/` |

4. กด **Save and Deploy** → รอสักครู่ ได้ URL เช่น `https://badminton-2026.pages.dev`
   - หน้าหลัก = `https://badminton-2026.pages.dev/`
   - หน้ากรรมการ = `https://badminton-2026.pages.dev/umpire.html`

เสร็จแล้ว! ✅

---

## ⚡ (แนะนำ) เปิด build mode — เสิร์ฟไฟล์ที่ bundle+minify แล้ว

โปรเจกต์รองรับ 2 โหมด — **ทั้งคู่ใช้งานได้**:
- **Source mode (ค่าเริ่มต้น)**: เสิร์ฟไฟล์แยกจาก root ตรง ๆ (Build command เว้นว่าง, Output `/`)
- **Build mode**: รวม js/css เป็นก้อนเดียว+ย่อขนาด โหลดเร็วขึ้น

สลับเป็น build mode: Cloudflare Pages → โปรเจกต์ → **Settings → Build → Build configuration → แก้ไข**

| ช่อง | ค่า |
|------|-----|
| Build command | `npm run build` |
| Build output directory | `dist` |

กด Save แล้ว **Retry deployment** (หรือ push ใหม่) → Cloudflare จะ `npm install` + build เอง แล้วเสิร์ฟจาก `dist/`
> ถ้ามีปัญหา สลับกลับ Source mode ได้ทันที (Build command เว้นว่าง, Output `/`) — โค้ด source ยังอยู่ครบ

---

## ② หลังจากนี้ (ทุกครั้งที่แก้โค้ด)

```bash
git add -A
git commit -m "อธิบายสิ่งที่แก้"
git push
```

Cloudflare จะเห็น push แล้ว **deploy ให้เองภายในไม่กี่วินาที**
- push เข้า `main` → อัปเดตเว็บจริง (production)
- push branch อื่น → ได้ **preview URL** แยกไว้ทดสอบก่อน merge

---

## ③ (ทางเลือก) ใช้โดเมนตัวเอง

Cloudflare Pages → โปรเจกต์ → **Custom domains** → Add → ใส่โดเมน (เช่น `badminton.yourdomain.com`) → ทำตามขั้น DNS

---

## ⚠️ หมายเหตุเรื่อง Firebase (สำคัญ)

- **Realtime Database ไม่ล็อกตามโดเมน** — ย้าย host ไปที่ไหน DB ก็ยังต่อได้เหมือนเดิม (client ต่อผ่าน `databaseURL`) ดังนั้นย้ายมา Cloudflare Pages ไม่กระทบการทำงานของ DB
- ค่า Firebase config ใน `shared/firebase-config.js` เป็น **public key โดยธรรมชาติ** (ปลอดภัยที่จะ commit) — ความปลอดภัยจริงอยู่ที่ **Database Rules**
- ถ้าเจอ `PERMISSION_DENIED` ทั้งบน localhost และ production → ไปเช็ค **Realtime Database → Rules** ใน Firebase Console (ไม่ใช่ปัญหาของ hosting)

---

## 📷 อัปโหลดรูป gallery ผ่าน R2 (เปิดใช้)

โค้ดพร้อมแล้วในโฟลเดอร์ `/functions` — รูป gallery ที่อัปใหม่จะถูกเก็บใน **R2** แทน base64 ใน RTDB (เลิกติด cap 60 รูป, โหลดเร็วขึ้น, DB ไม่บวม) มีทั้ง endpoint อัปโหลด/ลบ (`/api/photo`) และ endpoint เสิร์ฟรูป (`/img/*`) deploy ไปพร้อม repo เดียวกัน ไม่ต้องตั้ง server แยก

> **ยังไม่ต้อง provision ก็ได้** — ถ้ายังไม่ได้ผูก R2 โค้ดจะ fallback ไปเก็บ base64 แบบเดิมอัตโนมัติ แอปทำงานปกติ พอทำ 3 ขั้นล่างเสร็จ รูปใหม่จะเข้า R2 เอง (รูปเก่าที่เป็น base64 ยังแสดงได้ตามเดิม)

### ① สร้าง R2 bucket
Cloudflare dash → **R2** → **Create bucket** → ตั้งชื่อ เช่น `badminton-photos` → Create
> ไม่ต้องเปิด Public access — รูปเสิร์ฟผ่าน `/img/*` (same-origin) ให้อยู่แล้ว

### ② ผูก bucket + ตั้งค่า env เข้ากับ Pages
Pages → โปรเจกต์ → **Settings → Functions** (หรือ **Bindings**):

| สิ่งที่เพิ่ม | ค่า |
|------|-----|
| **R2 bucket binding** | Variable name = `PHOTOS` → เลือก bucket `badminton-photos` |
| **Environment variable** | `PHOTO_UPLOAD_KEY` = `bdm2026-r2-9f3a2c7e` |

> ⚠️ ค่า `PHOTO_UPLOAD_KEY` ต้อง **ตรงกับ** ค่าในโค้ด `js/gallery.js` (const `PHOTO_UPLOAD_KEY`) เป๊ะ ถ้าจะเปลี่ยนเป็นค่าอื่น ต้องแก้ทั้งสองที่ให้เหมือนกัน
> นี่เป็น auth ระดับ obscurity (client ถือ key เดียวกัน) — ระดับเดียวกับ passcode ปัจจุบัน กัน scanner สุ่มยิงได้ ยังไม่ใช่ auth จริง อัปเกรดเป็น Firebase Auth ทีหลังได้

### ③ Re-deploy
push โค้ด หรือ **Retry deployment** → เสร็จแล้วลองอัปรูปใน gallery: toast จะขึ้น **☁️** เมื่อรูปเข้า R2 สำเร็จ

> ทดสอบก่อน merge ได้: push branch อื่น → Cloudflare ให้ **preview URL** (แต่ binding/env ของ Pages ใช้ร่วมกับ production — ตั้งค่าตาม ② ก่อน preview ถึงจะเห็นผล)
