# ELEKTRA — Referensi Standar Kelistrikan (PUIL/SNI · IEC · NEC/NFPA)

PWA mobile untuk konsultasi standar kelistrikan. Gratis total: frontend statis + Vercel serverless + Gemini API free tier.

## Struktur
```
elektra/
├── index.html      ← seluruh aplikasi (frontend)
├── api/
│   └── ask.js      ← proxy aman ke Gemini (API key TIDAK di kode)
└── README.md
```

## Cara Deploy (±5 menit)

1. **Buat repo GitHub** baru (misal `elektra`), push ketiga file ini.
2. Buka **vercel.com → Add New → Project → import repo** tersebut.
   - Framework Preset: **Other**. Tidak perlu build command. Langsung Deploy.
3. Setelah deploy, buka **Settings → Environment Variables**, tambahkan:
   - Name: `GEMINI_API_KEY`
   - Value: API key kamu dari Google AI Studio
   - Environment: Production (centang semua juga boleh)
4. **Redeploy** (Deployments → ⋯ → Redeploy) supaya env variable terbaca.
5. Buka URL Vercel-nya di HP → menu browser → **Add to Home Screen**.

> ⚠️ PENTING: karena API key sempat terkirim lewat chat, sebaiknya **regenerate key** dulu
> di https://aistudio.google.com (hapus key lama, buat baru), lalu pakai key baru di langkah 3.
> Jangan pernah menulis key di dalam file kode / commit ke GitHub.

## Fitur

- **Mobile-first PWA** — bottom tab bar, smooth, tanpa framework berat (hanya Fuse.js ~5KB)
- **Dual theme** — dark/light, mengikuti sistem, tersimpan di localStorage
- **Dual bahasa** — ID/EN untuk UI dan jawaban AI
- **Jawaban cepat 2 lapis**:
  1. Knowledge base lokal (Fuse.js) → jawaban **instan & offline** untuk topik umum
  2. Gemini 2.5 Flash (free tier) → fallback untuk kueri bebas, output JSON terstruktur
- **3 kartu standar** — PUIL/SNI, IEC, NEC/NFPA + kesimpulan praktis, tombol copy per kartu
- **Riwayat** — localStorage, ID format `ELEC-YYYYMMDD-NNNN`, tap untuk buka ulang
- **Mode Admin (PIN, default `1234` — segera ganti)**:
  - Statistik pemakaian (total kueri, lokal vs AI, rata-rata respons)
  - Kelola knowledge base (tambah/hapus topik)
  - Ganti PIN, ekspor data JSON, hapus riwayat

## Hemat Kuota Free Tier

- Topik yang sering ditanya → masukkan ke knowledge base via Admin, jadi tidak memakai kuota Gemini sama sekali.
- Respons Gemini di-cache 1 jam di edge Vercel untuk kueri identik.
- Ganti `MODEL` di `api/ask.js` ke `gemini-2.5-flash-lite` jika ingin lebih cepat + kuota harian lebih besar.
