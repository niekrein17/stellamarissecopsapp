'use strict';
/* Stella Maris SecOps App - guide.js : Buku Panduan Teknis & SOP Siswa
 * Identitas penyelenggara (yayasan, sekolah, mapel, guru, pengawas) diambil dari
 * profil SUPERADMIN saat render, sehingga kop & data panduan ikut berubah setelah
 * data dikunci/disimpan. HTML dibangun ulang setiap kali diakses (getter `html`).
 */
window.Guide = (function () {
  const D = window.SMData;

  function esc(s) {
    if (window.Report && window.Report.esc) return window.Report.esc(s);
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* identitas aktif: profil SuperAdmin (bila ada) → fallback default */
  function ident() {
    const p = (window.SuperAdmin && window.SuperAdmin.load) ? window.SuperAdmin.load() : null;
    return {
      yayasan: (p && p.namaYayasan) || D.PENGUJI.yayasan,
      sekolah: (p && p.namaSekolah) || D.PENGUJI.institusi,
      alamat: (p && p.alamat) || D.PENGUJI.alamat,
      kota: (p && p.kota) || D.PENGUJI.kota,
      mapel: (p && p.namaMapel) || 'Dasar Keamanan Informasi / TJKT',
      guru: (p && p.namaGuru) || D.PENGUJI.nama,
      alias: (p && p.aliasGuru) || D.PENGUJI.alias,
      pengawas: (p && p.pengawasUjian) || '',
      aplikasi: D.PENGUJI.aplikasi
    };
  }

  function attackTable() {
    return `<table><thead><tr><th>Fase</th><th>Taktik MITRE</th><th>Teknik</th><th>Vektor Serangan</th><th>Target</th><th>Playbook Penangkal</th></tr></thead><tbody>` +
      D.ATTACKS.map(a => `<tr><td class="c">${a.fase}</td><td>${a.tactic}</td><td><code>${a.tech}</code></td><td><b>${a.nama}</b><br><span class="t-dim">${a.ringkas}</span></td><td><code>${a.target}</code></td><td>${a.mit.map(m => `<code>${D.PLAYBOOK_MAP[m].kode}</code>`).join(' ')}</td></tr>`).join('') +
      `</tbody></table>`;
  }

  function playbookTable() {
    return `<table><thead><tr><th>Kode</th><th>Playbook SOAR</th><th>Menangkal</th><th>Berlaku</th><th>Disrupsi</th><th>Perintah</th></tr></thead><tbody>` +
      D.PLAYBOOKS.map(p => `<tr><td><code>${p.kode}</code></td><td><b>${p.nama}</b><br><span class="t-dim">${p.desc}</span></td><td>${p.counter.map(c => `<code>${c}</code>`).join(' ')}</td><td>${p.ttl}s</td><td>-${p.disrupt}</td><td><code>${p.cmd}</code></td></tr>`).join('') +
      `</tbody></table>`;
  }

  function kkmTable() {
    return `<table><thead><tr><th>Jenjang</th><th>Kelas</th><th>KKM</th></tr></thead><tbody>` +
      Object.keys(D.KKM).map(k => `<tr><td>${D.KKM[k].jenjang}</td><td>Kelas ${k}</td><td class="c"><b>${D.KKM[k].kkm}</b></td></tr>`).join('') +
      `</tbody></table>`;
  }

  function rubrikTable() {
    return `<table><thead><tr><th>Kode</th><th>Aspek Kompetensi</th><th>Bobot</th><th>Dinilai pada Tim</th><th>Indikator</th></tr></thead><tbody>` +
      D.RUBRIK.map(r => {
        const ind = {
          A1: 'Kecepatan & ketepatan triase alert (MTTD), presisi membedakan ancaman nyata vs trafik wajar, kelengkapan menandai log CRITICAL/ALERT.',
          A2: 'Ketepatan memilih playbook sesuai vektor, rasio serangan yang berhasil diblokir, cakupan pemakaian 6 playbook, hukuman false-positive.',
          A3: 'Rata-rata ketersediaan layanan kritis (WEB, DNS, DB, AD, Firewall) selama sesi berlangsung.',
          A4: 'Rasio serangan sukses, cakupan 8 teknik MITRE, jumlah CTF flag diraih, volume data dibocorkan, kedalaman rantai kill-chain.'
        }[r.kode];
        return `<tr><td><code>${r.kode}</code></td><td><b>${r.nama}</b></td><td class="c">${r.bobot}%</td><td>${r.tim === 'blue' ? '🛡️ Blue' : '⚔️ Red'}</td><td>${ind}</td></tr>`;
      }).join('') + `</tbody></table>`;
  }

  function identityTable(id) {
    const row = (k, v) => `<tr><th>${k}</th><td>: ${v || '—'}</td></tr>`;
    return `<table class="guide-ident"><tbody>
      ${row('Nama Yayasan', esc(id.yayasan))}
      ${row('Nama Sekolah', esc(id.sekolah))}
      ${row('Alamat', esc(id.alamat) + (id.kota ? ' • ' + esc(id.kota) : ''))}
      ${row('Mata Pelajaran', esc(id.mapel))}
      ${row('Guru Pengampu / Penguji', esc(id.guru) + (id.alias ? ' (' + esc(id.alias) + ')' : ''))}
      ${row('Pengawas Ujian', esc(id.pengawas))}
    </tbody></table>`;
  }

  function render() {
    const id = ident();
    return `
<div class="guide" id="guidePrint">
  <div class="ba-kop" style="border-color:#2a3d5f">
    <div class="y">${esc(id.yayasan)}</div>
    <div class="n">${esc(id.sekolah)}</div>
    <div class="a">Buku Panduan Teknis &amp; SOP Siswa</div>
    <div class="al">${esc(id.aplikasi)} — Cyber Range Simulator (SIEM &amp; SOAR)</div>
    <div class="al">${esc(id.alamat)}${id.kota ? ' • ' + esc(id.kota) : ''}</div>
  </div>

  <h2>Identitas Penyelenggara</h2>
  ${identityTable(id)}

  <h2>1. Pendahuluan</h2>
  <p><b>${esc(id.aplikasi)}</b> adalah cyber range simulator untuk praktik Security Operations Center (SOC) di lingkungan sekolah.
  Aplikasi menggabungkan dua kemampuan industri: <b>SIEM</b> (Security Information and Event Management) untuk mengumpulkan, menyaring,
  dan menganalisis log keamanan secara real-time, serta <b>SOAR</b> (Security Orchestration, Automation and Response) untuk mengeksekusi
  playbook mitigasi secara terotomasi maupun manual.</p>
  <p>Simulasi mempertemukan dua kubu pada satu Room ID yang sama melalui koneksi WebSocket:</p>
  <ul>
    <li><b>🛡️ Blue Team</b> — SOC Analyst &amp; Security Administrator. Tugas: memantau log, menganalisis ancaman, melakukan investigasi
        insiden, dan mengeksekusi mitigasi (SOAR &amp; Firewall) demi menjaga <b>uptime server 100%</b>.</li>
    <li><b>⚔️ Red Team</b> — Intruder &amp; Ethical Hacker. Tugas: melancarkan vektor serangan bertahap mengikuti kerangka
        <b>MITRE ATT&amp;CK</b>, dari Reconnaissance hingga Data Exfiltration.</li>
  </ul>
  <div class="callout">Gunakan mode <b>Dual View (split-screen)</b> bila satu PC/proyektor harus menampilkan kedua kubu sekaligus.
  Mode ini sangat berguna untuk pembahasan kelas setelah sesi berakhir.</div>

  <h2>2. SOP Pelaksanaan Ujian / Latihan</h2>
  <ol>
    <li><b>Persiapan (Guru)</b> — jalankan <code>node server.js</code> pada PC guru, catat alamat <code>http://&lt;IP-GURU&gt;:8080</code>, lalu bagikan ke siswa.</li>
    <li><b>Pembuatan Ruang</b> — Guru memilih peran <i>Guru Penguji</i>, mengisi kategori sesi (UTS / UAS / Latihan / Ulangan Harian),
        durasi (5–30 menit), jumlah anggota per tim (2/3/4), jenjang kelas, identitas kedua tim, lalu menekan <b>Buat Ruang (jadi Host)</b>.</li>
    <li><b>Bergabung</b> — siswa membuka alamat yang sama, mengisi nama, memilih peran (Blue / Red), memasukkan <b>Room ID</b> identik,
        lalu menekan <b>Gabung Ruang</b>.</li>
    <li><b>Briefing (2 menit)</b> — Guru menyampaikan aturan main, target SLA, dan mengingatkan bahwa skor <u>dirahasiakan</u> selama sesi.</li>
    <li><b>Pelaksanaan</b> — Guru menekan <b>Mulai Simulasi</b>. Countdown berjalan otomatis; saat waktu habis sesi terkunci dan nilai dihitung.</li>
    <li><b>Evaluasi</b> — Guru membuka <i>Lembar Asesmen</i> dengan PIN (default <code>${D.PENGUJI.pin}</code>), meninjau rubrik, mengisi catatan evaluasi,
        kemudian menekan <b>Umumkan Skor ke Murid</b> bila ingin menampilkannya ke proyektor.</li>
    <li><b>Arsip</b> — Cetak <i>Berita Acara Asesmen Sumatif Semester</i> (Print / Save as PDF) dan unduh arsip data JSON untuk administrasi sekolah.</li>
  </ol>

  <h2>3. Topologi Infrastruktur yang Dilindungi</h2>
  <table><thead><tr><th>ID</th><th>Node</th><th>IP</th><th>Kritis</th><th>Fungsi</th></tr></thead><tbody>
  ${D.NODES.map(n => `<tr><td><code>${n.id}</code></td><td><b>${n.nama}</b></td><td><code>${n.ip}</code></td><td class="c">${n.critical ? '✔' : '—'}</td><td>${n.desc}</td></tr>`).join('')}
  </tbody></table>
  <p>Status kesehatan node: <span class="st-online">ONLINE (≥80)</span> • <span class="st-degraded">DEGRADED (40–79)</span> •
     <span class="st-critical">CRITICAL (1–39)</span> • <span class="st-offline">OFFLINE (0)</span> •
     <span class="st-ransom">RANSOM (terenkripsi)</span> • <span class="st-quarantine">QUARANTINE (diisolasi)</span>.</p>

  <h2>4. Arsenal Red Team — Kerangka MITRE ATT&amp;CK</h2>
  ${attackTable()}
  <div class="callout red"><b>Kill Chain berjenjang.</b> Vektor fase tinggi terkunci sampai prasyaratnya dipenuhi:
  <code>recon</code> → <code>brute/sqli/xss</code> (initial access / foothold) → <code>privesc</code> (root) → <code>ransom</code> / <code>exfil</code>.
  Red tidak bisa langsung menyalakan ransomware tanpa menanamkan akses lebih dulu — persis seperti penyerang sungguhan.</div>

  <h4>Cheatsheet Red Terminal</h4>
  <pre>help                      daftar perintah
whoami ; id ; uname -a    konteks shell penyerang
targets                   daftar server target beserta status
use WEB-01                pilih target aktif
arsenal                   tampilkan 8 vektor MITRE + status kesiapan
man sqli                  penjelasan rinci satu vektor
scan                      alias cepat: jalankan Reconnaissance
run sqli ; run brute      luncurkan vektor
ip 203.0.113.66           ganti IP sumber serangan
proxy on ; proxy off      rantai proxy (IP berotasi tiap serangan)
access ; flags ; exfil    status foothold/root, CTF flag, volume bocor
history ; clear           riwayat perintah / bersihkan layar</pre>

  <h2>5. Playbook Blue Team — SOAR &amp; Firewall</h2>
  ${playbookTable()}
  <div class="callout blue"><b>Aturan ketepatan.</b> Menjalankan playbook yang <u>cocok</u> dengan vektor aktif menaikkan aspek A2.
  Menjalankan playbook tanpa ancaman yang cocok dihitung <b>false positive</b>: menurunkan A2 dan memberi dampak disrupsi layanan
  (kesehatan node berkurang). Playbook dengan target node bersifat spesifik; tanpa target node berlaku global namun 1,5× lebih disruptif.</div>

  <h4>SOP Triase Alert (SIEM)</h4>
  <ol>
    <li>Filter <b>ALERT+CRITICAL</b> untuk memprioritaskan kejadian berat.</li>
    <li>Baca pesan log: perhatikan <code>src IP</code>, <code>dst</code>, <code>proto</code>, dan signature (mis. <i>ET SCAN</i>, <i>Rule 942100</i>).</li>
    <li>Bandingkan dengan pola trafik wajar. Gagal login dari <code>10.10.30.x</code> sekali-kali biasanya salah ketik guru — bukan brute force.</li>
    <li>Tandai <b>TP</b> untuk ancaman nyata, <b>FP</b> untuk trafik wajar. Alert CRITICAL yang tidak ditriase dalam
        ${'45'} detik dihitung <b>missed</b> dan mengurangi nilai A1.</li>
    <li>Setelah ancaman dikonfirmasi, segera jalankan playbook penangkal dari tab <b>Blue Automation</b>.</li>
  </ol>

  <h4>Cheatsheet analisis log</h4>
  <pre>Pola ancaman nyata (tandai TP)
  ET SCAN / Potential SSH Scan ............ Reconnaissance T1595
  message repeated 3xx times: Failed ...... Brute Force T1110
  Rule 942100 UNION SELECT ................ SQL Injection T1190
  Rule 941110 XSS Filter .................. XSS T1189
  Possible SYN flooding on port ........... SYN Flood T1498
  uid berubah 33 -&gt; 0 (root) ............... Privilege Escalation T1068
  Win.Ransomware / *.smittenc ............. Ransomware T1486
  ET DNS Query ... TXT / tunneling ........ Exfiltration T1048

Pola trafik wajar (tandai FP)
  Accepted publickey for guru from 10.10.30.x
  GET /dashboard HTTP/1.1 200
  Backup harian rsync ke NAS 10.10.40.9 selesai
  Started Daily apt download activities
  SERVFAIL untuk printer.lab.smitt.sch.id</pre>

  <h2>6. Sistem Penilaian</h2>
  <h3>6.1 Deteksi KKM otomatis</h3>
  ${kkmTable()}
  <h3>6.2 Matriks rubrik capaian 4 aspek kompetensi</h3>
  ${rubrikTable()}
  <p>Nilai <b>Blue</b> = (A1×25% + A2×30% + A3×25%) ÷ 80% — dinormalisasi karena aspek A4 milik Red.
     Nilai <b>Red</b> = A4 (bobot 20% dinormalisasi terhadap capaian tim Red sendiri).</p>
  <h3>6.3 Rentang skor</h3>
  <ul>
    <li>Skor normal dijepit pada rentang <b>60 – 100</b> poin.</li>
    <li>Gradasi: <b>A</b> ≥ 90 (Sangat Kompeten) • <b>B</b> ≥ 80 (Kompeten) • <b>C</b> ≥ KKM (Cukup Kompeten) • <b>D</b> &lt; KKM (Belum Tuntas).</li>
  </ul>
  <div class="callout"><b>KASUS KHUSUS — KETENTUAN RED 0 SERANGAN.</b><br>
  Bila Tim Red tidak melancarkan satu pun serangan (total serangan = 0), maka:
  <ul>
    <li>Tim <b>Red</b> otomatis diberi <b>Nilai 0</b> — Status: <b>Belum Tuntas / D</b>.</li>
    <li>Tim <b>Blue</b> otomatis diberi <b>nilai sebesar KKM</b> jenjang yang terdeteksi (Kelas 7/10 = 75, Kelas 8/11 = 78, Kelas 9/12 = 80) — Status: <b>Tuntas</b>.</li>
  </ul>
  Notifikasi kasus khusus ini dicetak otomatis pada Berita Acara.</div>

  <h3>6.4 Kerahasiaan nilai (suspense effect)</h3>
  <p>Selama simulasi berjalan, bilah metrik atas menampilkan <span class="lock-chip">DIRAHASIAKAN 🔒</span> untuk skor Blue dan Red.
  Skor hanya dapat diakses Guru Penguji melalui <i>Lembar Asesmen</i> yang terkunci PIN (default <code>${D.PENGUJI.pin}</code>).
  Tombol <b>Umumkan Skor ke Murid</b> tersedia bila guru ingin membuka skor ke layar proyektor setelah evaluasi selesai.</p>

  <h2>7. Background Simulator</h2>
  <ul>
    <li><b>🤖 RedBot Otonom</b> — mesin melancarkan serangan otomatis setiap 9–20 detik dengan memprioritaskan progres kill-chain.
        Cocok untuk menguji kecepatan respon Blue atau untuk sesi latihan yang gurunya berperan sebagai Red.</li>
    <li><b>🚶 Benign Traffic</b> — menghasilkan trafik wajar siswa/guru (DNS query, login guru, backup rsync, update antivirus)
        beserta <i>look-alike alert</i> yang menjebak. Menguji kejelian analis membedakan ancaman nyata dari false positive.</li>
  </ul>

  <h2>8. Etika &amp; Batasan Penggunaan</h2>
  <div class="callout red">Seluruh teknik pada simulator ini <b>hanya</b> untuk keperluan pembelajaran di lingkungan laboratorium sekolah.
  Seluruh IP target memakai ruang alamat dokumentasi RFC 5737 (<code>203.0.113.0/24</code>, <code>198.51.100.0/24</code>) dan RFC 1918 —
  tidak ada sistem nyata yang diserang. Menerapkan teknik ini ke sistem tanpa izin tertulis merupakan pelanggaran
  UU No. 11 Tahun 2008 tentang ITE (pasal 30 &amp; 32) dengan ancaman pidana. Jadilah <b>ethical hacker</b>: uji hanya di lab, lapor temuan, jangan merusak.</div>

  <h2>9. Troubleshooting</h2>
  <table><thead><tr><th>Gejala</th><th>Penyebab</th><th>Solusi</th></tr></thead><tbody>
  <tr><td>Badge <code>offline</code> terus menyala</td><td>Server relay belum jalan</td><td>Jalankan <code>node server.js</code> di PC guru, pastikan port 8080 tidak diblokir firewall.</td></tr>
  <tr><td>Siswa tidak bisa bergabung</td><td>Beda jaringan / IP salah</td><td>Pastikan satu LAN/WiFi, gunakan <code>http://&lt;IP-GURU&gt;:8080</code>, izinkan Node.js pada Windows Firewall.</td></tr>
  <tr><td>Badge <code>lokal</code></td><td>Dibuka lewat <code>file://</code> tanpa server</td><td>Mode fallback BroadcastChannel — hanya sinkron antar-tab pada satu browser. Gunakan Dual View.</td></tr>
  <tr><td>Log tidak bergerak</td><td>Host belum menekan Mulai</td><td>Hanya Host yang menjalankan mesin simulasi. Cek tab Konsol Guru.</td></tr>
  <tr><td>Arsenal Red terkunci semua</td><td>Kill-chain belum dimulai</td><td>Jalankan <code>scan</code> (Reconnaissance T1595) lebih dulu.</td></tr>
  <tr><td>Skor tidak muncul di ribbon</td><td>Memang dirahasiakan</td><td>Buka Lembar Asesmen dengan PIN guru lalu tekan Umumkan Skor.</td></tr>
  </tbody></table>

  <div class="ba-foot" style="border-color:#2a3d5f;color:#8fa3c0">
    ${esc(id.aplikasi)} • ${esc(id.sekolah)} • Disusun oleh ${esc(id.guru)}${id.alias ? ' (' + esc(id.alias) + ')' : ''} bersama GAIS • Tahun 2026
  </div>
</div>`;
  }

  return { get html() { return render(); }, render, ident };
})();
