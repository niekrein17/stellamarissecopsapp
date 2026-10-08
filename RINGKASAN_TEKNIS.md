# Ringkasan Teknis — Stella Maris SecOps App

**Simulator SIEM & SOAR (Cyber Range) dua kubu real-time**
by GAIS + PaulNiek @ SMITT Tobelo 2026
Versi arsip: 2026-10-07

---

## 1. Tujuan & Konsep

Aplikasi latihan/asesmen SecOps berbasis web untuk jenjang SMP/SMA/SMK. Dua kubu bermain
real-time dalam satu ruang:

- **Blue Team** (SOC Analyst & Security Administrator) — bertahan menjaga **SLA uptime 100%**
  melalui triase alert SIEM dan otomasi respons SOAR.
- **Red Team** (Intruder & Ethical Hacker) — menembus sistem mengikuti kerangka
  **MITRE ATT&CK** (kill-chain: recon → foothold → root → ransom/eksfiltrasi).

Dirancang untuk **UTS / UAS / Latihan / Ulangan Harian**, mendukung mode **Dual View**
(split-screen Blue | Red untuk proyektor) dan **multi-user** via Room ID.

**Etika & keamanan:** seluruh target memakai alamat dokumentasi RFC 5737 (203.0.113.x,
198.51.100.x) dan privat RFC 1918 (10.10.x.x, 172.16.x.x). Buku Panduan memuat peringatan
bahwa menyerang sistem nyata melanggar **UU No. 11 Tahun 2008 (ITE)**.

---

## 2. Arsitektur

```
Browser (klien)                         Node.js (server.js)
┌──────────────────────────┐           ┌────────────────────────┐
│ index.html               │  HTTP     │ Static file server     │
│ css/style.css            │◄─────────►│ (zero-dependency)      │
│ js/ (modul, urut muat):  │           │                        │
│  data → net → engine →   │  WS       │ Relay WebSocket        │
│  guide → report → ui →   │◄─────────►│ RFC6455 (hand-rolled)  │
│  admin → app             │ (room)    │ room-based broadcast   │
└──────────────────────────┘           └────────────────────────┘
```

- **Tanpa dependensi** (`node server.js [port]`, default 8080). Tidak ada package.json/npm.
- **Host-authoritative:** hanya HOST yang menjalankan `Engine.tick`. Klien menerima salinan
  state lengkap (`view()`) dan mengirim aksi ke host.
- **Fallback BroadcastChannel** (`smarsec-<room>`) agar tetap jalan di `file://` tanpa relay.
- **Game loop wall-clock** dengan catch-up: mengejar ketertinggalan saat tab dibackground
  (timer browser melambat) lewat event `visibilitychange`/`focus`.

---

## 3. Modul (public/js)

| File | Baris | Tanggung jawab |
|------|------:|----------------|
| `data.js` | 294 | Katalog statis: KKM, kategori, durasi, node topologi, serangan MITRE, playbook SOAR, rubrik, peran, profil default, SUPERADMIN, Tujuan Pembelajaran. |
| `net.js` | 134 | Klien jaringan: WebSocket + fallback BroadcastChannel; join/leave/send; properti `isHost`, `room`, `selfId`. |
| `engine.js` | 670 | Mesin simulasi: `newState`, `tick`, kill-chain, triase, playbook+TTL, `computeScores`, `view()`, aksi. |
| `guide.js` | 192 | Buku Panduan teknis & SOP siswa (HTML). |
| `report.js` | 390 | Lembar Asesmen Guru, Berita Acara, arsip JSON, cetak/PDF. |
| `ui.js` | 647 | Rendering seluruh antarmuka; signature-cache agar select/input tidak ter-reset tiap tick. |
| `admin.js` | 337 | **SUPERADMIN**: profil penyelenggara (localStorage), gerbang sandi, editor, simpan/kunci, reset. |
| `app.js` | 595 | Wiring: loop host, delegasi aksi (`data-act`), terminal Red interaktif, sinkronisasi. |
| `server.js` | 234 | Relay HTTP + WebSocket. |

Pola modul: tiap file `window.X = (function(){ … return {…}; })()`.
UI memakai **delegasi event** lewat atribut `data-act`.

---

## 4. Sistem Penilaian

**Rubrik 4 aspek berbobot:**

| Kode | Aspek | Bobot | Tim |
|------|-------|:-----:|-----|
| A1 | Deteksi & Analisis Log SIEM | 25% | Blue |
| A2 | Mitigasi Firewall & SOAR | 30% | Blue |
| A3 | Ketersediaan Layanan (SLA) | 25% | Blue |
| A4 | Penetrasi & Vektor Serangan | 20% | Red |

- **Nilai Blue** = (A1·25 + A2·30 + A3·25) ÷ 80
- **Nilai Red** = A4
- Rentang skor normal **60–100**, dibandingkan **KKM** (auto-deteksi theo jenjang/kelas).
- **Kasus khusus:** Red 0 serangan → Red = 0/D/Belum Tuntas, Blue = KKM/Tuntas + notifikasi
  di Berita Acara.
- **Kerahasiaan nilai (suspense):** selama simulasi skor disembunyikan (`DIRAHASIAKAN 🔒`),
  dibuka lewat Lembar Asesmen Guru (PIN default **1234**) lalu "Umumkan Skor".

---

## 5. Fitur SUPERADMIN

**Sandi:** `1985123*#*` (konstanta `SMData.SUPERADMIN`).

Panel admin mengelola identitas penyelenggara yang dapat dipakai lintas sekolah/jenjang:
Nama Yayasan, Nama Sekolah, Alamat, Kota, Mata Pelajaran, Guru Mapel (+alias),
Pengawas Ujian, Tujuan Pembelajaran, serta peserta **Blue Team & Red Team (min 2, maks 4/tim)**.

- **Simpan & Kunci** → validasi → persist ke `localStorage` (kunci `stella.superadmin.profile.v1`,
  `locked:true`) → mengisi & mengunci field identitas di layar Setup → data dipakai sesi
  ujian/ulangan/latihan dan tercetak di Berita Acara.
- **Reset ke Default** → mengosongkan seluruh isian, melepas kunci (untuk sekolah/jenjang baru).
  Tujuan Pembelajaran tetap dipertahankan sebagai referensi.
- **Fresh install** (tanpa localStorage) → menampilkan default Stella Maris.

**Dampak pada Berita Acara:** kop dinamis (yayasan/sekolah/alamat), baris Guru Mapel &
Pengawas Ujian, section **B. Tujuan Pembelajaran** (section berikut di-re-letter C–H),
kota tanda tangan dinamis + kotak tanda tangan Pengawas. Arsip JSON memuat
`tujuanPembelajaran`, `alamat`, `kota`, `pengawasUjian`.

---

## 6. Fitur Utama Lain

- **SIEM (Blue Console):** live syslog/Suricata, filter keparahan, pencarian string/IP/protokol,
  antrean triase (TP/FP), MTTD.
- **SOAR (Blue Automation):** playbook siap pakai (blacklist IP/iptables, patch WAF, karantina
  VLAN, rate-limit SYN flood, bersihkan backdoor, restore snapshot) dengan TTL & revoke.
- **Red Terminal:** shell interaktif (`help`, `targets`, `arsenal`, `run <vektor>`, `proxy on/off`,
  `flags`, `exfil`, dll), IP switcher & proxy chain berotasi.
- **Topologi interaktif**, **Papan Insiden & kronologi**, **Dual View**.
- **Cetak/PDF** (`@media print` A4, isolasi `body.print-arsip` / `body.print-guide`) dan
  **Unduh Arsip JSON**.

---

## 7. Menjalankan

```bash
node server.js 8080
# buka http://localhost:8080/
```

Semua peserta memakai **Room ID** sama; perangkat pertama yang "Buat Ruang" menjadi HOST.

---

## 8. Status Verifikasi

Lolos uji end-to-end di browser (tanpa error konsol): gerbang sandi SUPERADMIN, validasi
(min 2 peserta/tim), simpan/kunci, applyToSetup, pembuatan ruang, Berita Acara (kop dinamis,
section A–H, 6 tujuan, pengawas, kota dinamis), arsip JSON valid, reset-to-default, persistensi
localStorage antar-reload, serta default fresh-install.
