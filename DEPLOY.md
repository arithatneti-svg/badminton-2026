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

## 🔮 อนาคต: อัปโหลดรูปผ่าน Cloudflare

เมื่ออยู่บน Cloudflare Pages แล้ว เพิ่มระบบอัปโหลดรูปผู้เล่นได้ในระบบนิเวศเดียวกัน:
- **Pages Functions** (โฟลเดอร์ `/functions`) เป็น API endpoint
- ผูกกับ **R2** (object storage) เก็บไฟล์รูป
- ไม่ต้องตั้ง server แยก — deploy ไปพร้อม repo เดียวกัน
