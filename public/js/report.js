'use strict';
/* Stella Maris SecOps App - report.js
 * Lembar Asesmen Guru, Berita Acara Asesmen Sumatif Semester, arsip JSON, cetak.
 */
window.Report = (function () {
  const D = window.SMData;

  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  function tglPanjang(iso) {
    if (!iso) return '-';
    const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
    if (isNaN(d)) return iso;
    return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
  }
  function jam(d) {
    if (!d) return '--:--:--';
    const x = (d instanceof Date) ? d : new Date(d);
    if (isNaN(x)) return '--:--:--';
    return x.toTimeString().slice(0, 8);
  }
  function mmss(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    return String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function anggotaRows(list, n, peranDefault) {
    const out = [];
    for (let i = 0; i < Math.max(n || 0, (list || []).length); i++) {
      const a = (list || [])[i] || { nama: '', nisn: '' };
      out.push({
        no: i + 1,
        nama: a.nama || `— (belum diisi) —`,
        nisn: a.nisn || '-',
        peran: a.peran || peranDefault[i % peranDefault.length]
      });
    }
    if (!out.length) out.push({ no: 1, nama: '— (belum diisi) —', nisn: '-', peran: peranDefault[0] });
    return out;
  }

  function statusCell(tuntas, nilai) {
    return tuntas
      ? `<span style="color:#0a6b2d;font-weight:700">TUNTAS</span>`
      : `<span style="color:#a4161a;font-weight:700">BELUM TUNTAS</span>`;
  }

  /* ============ LEMBAR ASESMEN GURU ============ */
  function assessSheet(st) {
    const s = st.scores;
    if (!s) {
      return `<div class="ba-note">Sesi belum berakhir. Nilai akhir dihitung otomatis ketika countdown habis atau Guru menekan
      <b>Akhiri &amp; Kunci Nilai</b>. Anda tetap dapat memantau metrik proses di bawah ini.</div>` + liveMetrics(st);
    }
    const rub = D.RUBRIK;
    const blueBobot = 80;
    return `
    <div class="assess-head">
      <div><b style="font-size:15px">Hasil Penilaian Akhir</b>
      <div class="hint">${esc(st.cfg.kategori)} • ${esc(st.cfg.docNumber)} • KKM ${s.kkm} (${esc(s.jenjangLabel)})</div></div>
    </div>
    <table class="assess-table">
      <thead><tr><th>Tim</th><th>Kelompok</th><th>Nilai Akhir</th><th>Grade</th><th>Keterangan</th><th>Status KKM</th></tr></thead>
      <tbody>
        <tr>
          <td>🛡️ Blue Team</td><td>${esc(st.teams.blue.nama) || '-'}</td>
          <td class="num"><span class="nilai-besar ${s.blue.tuntas ? 'tuntas' : 'tidak-tuntas'}">${s.blue.nilai}</span></td>
          <td class="num">${s.blue.grade}</td><td>${esc(s.blue.ket)}</td>
          <td>${s.blue.tuntas ? '<span class="tuntas">TUNTAS</span>' : '<span class="tidak-tuntas">BELUM TUNTAS</span>'}</td>
        </tr>
        <tr>
          <td>⚔️ Red Team</td><td>${esc(st.teams.red.nama) || '-'}</td>
          <td class="num"><span class="nilai-besar ${s.red.tuntas ? 'tuntas' : 'tidak-tuntas'}">${s.red.nilai}</span></td>
          <td class="num">${s.red.grade}</td><td>${esc(s.red.ket)}</td>
          <td>${s.red.tuntas ? '<span class="tuntas">TUNTAS</span>' : '<span class="tidak-tuntas">BELUM TUNTAS</span>'}</td>
        </tr>
      </tbody>
    </table>

    ${s.special ? `<div class="ba-note warn" style="border-color:#b58900;background:rgba(246,196,69,.1)">
      <b>⚠️ ${esc(s.special.judul)}</b><br>${esc(s.special.pesan)}</div>` : ''}

    <h4 class="sec-title">Matriks Rubrik Capaian 4 Aspek Kompetensi</h4>
    <table class="assess-table">
      <thead><tr><th>Kode</th><th>Aspek</th><th>Bobot</th><th>Tim</th><th>Capaian (0-100)</th><th>Kontribusi</th></tr></thead>
      <tbody>
        ${rub.map(r => {
          const cap = s.aspek[r.kode];
          const pembagi = r.tim === 'blue' ? blueBobot : 100;
          const kontri = (cap * r.bobot / pembagi);
          return `<tr><td>${r.kode}</td><td>${esc(r.nama)}</td><td class="num">${r.bobot}%</td>
            <td>${r.tim === 'blue' ? '🛡️ Blue' : '⚔️ Red'}</td>
            <td class="num">${cap.toFixed(1)}</td><td class="num">${kontri.toFixed(2)}</td></tr>`;
        }).join('')}
        <tr><td colspan="5" style="text-align:right"><b>Total Blue (A1·25 + A2·30 + A3·25) ÷ 80</b></td><td class="num"><b>${s.raw.blue.toFixed(2)} → ${s.blue.nilai}</b></td></tr>
        <tr><td colspan="5" style="text-align:right"><b>Total Red (A4)</b></td><td class="num"><b>${s.raw.red.toFixed(2)} → ${s.red.nilai}</b></td></tr>
      </tbody>
    </table>

    <h4 class="sec-title">Rincian Metrik Proses — 🛡️ Blue Team</h4>
    <table class="assess-table"><tbody>
      <tr><td>Ancaman dikenali / total serangan</td><td class="num">${st.red.launched - st.blue.missed} / ${st.red.launched}</td>
          <td>Insiden terlewat (missed)</td><td class="num">${st.blue.missed}</td></tr>
      <tr><td>Triase benar (TP)</td><td class="num">${st.blue.tp}</td>
          <td>Salah klasifikasi ancaman (ditandai FP)</td><td class="num">${st.blue.fp}</td></tr>
      <tr><td>Trafik wajar benar ditandai FP</td><td class="num">${st.blue.benignOk}</td>
          <td>False alarm (trafik wajar ditandai TP)</td><td class="num">${st.blue.benignFp}</td></tr>
      <tr><td>Playbook tepat sasaran</td><td class="num">${st.blue.pbOk}</td>
          <td>Playbook salah sasaran</td><td class="num">${st.blue.pbWrong}</td></tr>
      <tr><td>Serangan berhasil diblokir</td><td class="num">${st.blue.mitigated}</td>
          <td>SLA Uptime layanan kritis</td><td class="num">${st.blue.sla.toFixed(2)}%</td></tr>
    </tbody></table>

    <h4 class="sec-title">Rincian Metrik Proses — ⚔️ Red Team</h4>
    <table class="assess-table"><tbody>
      <tr><td>Total serangan diluncurkan</td><td class="num">${s.red.rincian.launched}</td>
          <td>Sukses / Gagal / Diblokir</td><td class="num">${s.red.rincian.success} / ${s.red.rincian.failed} / ${s.red.rincian.blocked}</td></tr>
      <tr><td>Cakupan teknik MITRE</td><td class="num">${s.red.rincian.techCover}</td>
          <td>Fase kill-chain tertinggi</td><td class="num">${s.red.rincian.maxPhase} / 5</td></tr>
      <tr><td>CTF Flag diraih</td><td class="num">${s.red.rincian.flags} / ${D.TOTAL_FLAGS}</td>
          <td>Volume data dibocorkan</td><td class="num">${s.red.rincian.exfilMB} MB</td></tr>
    </tbody></table>
    ${st.red.flags && st.red.flags.length ? `<p class="hint">Flag: ${st.red.flags.map(f => '<code>' + esc(f) + '</code>').join(' • ')}</p>` : ''}
    `;
  }

  function liveMetrics(st) {
    return `<table class="assess-table"><tbody>
      <tr><td>Status sesi</td><td class="num">${esc(st.phase.toUpperCase())}</td>
          <td>Waktu berjalan / sisa</td><td class="num">${mmss(st.clock.elapsed)} / ${mmss(st.clock.remaining)}</td></tr>
      <tr><td>SLA Uptime saat ini</td><td class="num">${(st.blue.sla || 0).toFixed(2)}%</td>
          <td>Serangan diluncurkan Red</td><td class="num">${st.red.launched}</td></tr>
      <tr><td>Serangan diblokir Blue</td><td class="num">${st.blue.mitigated}</td>
          <td>CTF Flag diraih</td><td class="num">${st.red.flags.length}</td></tr>
      <tr><td>Data bocor</td><td class="num">${Math.round(st.red.exfilMB)} MB</td>
          <td>Playbook tepat / salah</td><td class="num">${st.blue.pbOk} / ${st.blue.pbWrong}</td></tr>
    </tbody></table>
    <div class="ba-note" style="border-color:#2b6cb0;background:rgba(59,167,255,.08)">
      <b>🔒 Skor masih dirahasiakan.</b> Nilai akhir belum dapat ditampilkan karena sesi belum dikunci.
      Indikator di atas adalah metrik proses, bukan nilai.</div>`;
  }

  /* ============ BERITA ACARA ============ */
  function beritaAcara(st) {
    const s = st.scores;
    const kkmInfo = D.KKM[st.cfg.kelas] || D.KKM['10'];
    const n = st.cfg.jumlahAnggota || 3;
    const blue = anggotaRows(st.teams.blue.anggota, n, D.PERAN_BLUE);
    const red = anggotaRows(st.teams.red.anggota, n, D.PERAN_RED);
    const mulai = st.cfg.startedEpoch ? jam(st.cfg.startedEpoch) : '-';
    const selesai = st.cfg.startedEpoch ? jam(st.cfg.startedEpoch + (st.clock.elapsed * 1000)) : '-';
    const khusus = s && s.special;

    const nilaiBlue = s ? s.blue.nilai : '—';
    const nilaiRed = s ? s.red.nilai : '—';
    const kota = st.penguji.kota || D.PENGUJI.kota || 'Tobelo';
    const alamat = st.penguji.alamat || D.PENGUJI.alamat;
    const tujuanList = (st.cfg.tujuan || D.TUJUAN_PEMBELAJARAN.join('\n'))
      .split('\n').map(x => x.trim()).filter(Boolean);

    return `
<div class="ba-kop">
  <div class="ba-logo">✝️🛡️</div>
  <div class="y">${esc(st.penguji.yayasan || D.PENGUJI.yayasan)}</div>
  <div class="n">${esc(st.penguji.institusi || D.PENGUJI.institusi)}</div>
  <div class="a">${esc(D.PENGUJI.aplikasi)}</div>
  <div class="al">simulator SIEM dan SOAR by GAIS+PaulNiek @SMITT Tobelo 2026</div>
  <div class="al">${esc(alamat)}</div>
</div>

<div class="ba-judul">
  <h2>Berita Acara Asesmen Sumatif Semester</h2>
  <div class="nomor">Nomor: <b>${esc(st.cfg.docNumber)}</b></div>
  <div class="nomor" style="font-size:11px">Praktik Cyber Range — Security Operations Center (SIEM &amp; SOAR)</div>
</div>

<p style="text-align:justify;margin-top:14px">
Pada hari ini, <b>${esc(tglPanjang(st.cfg.dateName || st.cfg.tanggal))}</b>, bertempat di Laboratorium Komputer
${esc(st.penguji.institusi || D.PENGUJI.institusi)}, telah dilaksanakan asesmen sumatif berbasis praktik
<b>${esc(st.cfg.kategori)}</b> menggunakan aplikasi <i>Stella Maris SecOps App</i> dengan ketentuan sebagai berikut:
</p>

<h3>A. Metadata Pelaksanaan Asesmen</h3>
<table class="ba-meta">
  <tr><td class="k">Mata Pelajaran</td><td>: ${esc(st.cfg.mapel)}</td></tr>
  <tr><td class="k">Kategori Sesi</td><td>: ${esc(st.cfg.kategori)}</td></tr>
  <tr><td class="k">Tanggal Pelaksanaan</td><td>: ${esc(tglPanjang(st.cfg.tanggal))}</td></tr>
  <tr><td class="k">Waktu</td><td>: ${esc(mulai)} – ${esc(selesai)} WIT (durasi ${st.cfg.durasiMenit} menit)</td></tr>
  <tr><td class="k">Jenjang / Kelas</td><td>: ${esc(kkmInfo.label)}</td></tr>
  <tr><td class="k">KKM Berlaku</td><td>: <b>${kkmInfo.kkm}</b></td></tr>
  <tr><td class="k">Room ID Sesi</td><td>: ${esc(st.room)}</td></tr>
  <tr><td class="k">Jumlah Anggota / Tim</td><td>: ${n} siswa</td></tr>
  <tr><td class="k">Mode Simulator</td><td>: RedBot Otonom ${st.cfg.redBot ? 'AKTIF' : 'NONAKTIF'} • Benign Traffic ${st.cfg.benign ? 'AKTIF' : 'NONAKTIF'}</td></tr>
  <tr><td class="k">Guru Mata Pelajaran / Penguji</td><td>: ${esc(st.penguji.nama)}${st.penguji.alias ? ' (' + esc(st.penguji.alias) + ')' : ''}</td></tr>
  <tr><td class="k">Pengawas Ujian</td><td>: ${esc(st.penguji.pengawas || '-')}</td></tr>
</table>

<h3>B. Tujuan Pembelajaran</h3>
<div class="ba-note" style="text-align:justify">
Setelah mengikuti praktik <i>Cyber Range — Security Operations Center (SIEM &amp; SOAR)</i> ini, peserta didik diharapkan mampu:
<ol class="ba-tujuan">
  ${tujuanList.length ? tujuanList.map(t => `<li>${esc(t)}</li>`).join('') : '<li>—</li>'}
</ol>
</div>

<h3>C. Susunan Peserta — 🛡️ Tim Blue (SOC Analyst &amp; Security Administrator)</h3>
<table class="ba-tbl">
  <thead><tr><th style="width:6%">No</th><th style="width:34%">Nama Kelompok / Nama Lengkap</th><th style="width:16%">NISN / NIS</th><th style="width:26%">Peran dalam Tim</th><th style="width:9%">Nilai</th><th style="width:9%">Status</th></tr></thead>
  <tbody>
    ${blue.map((a, i) => `<tr>
      <td class="c">${a.no}</td>
      <td>${i === 0 ? `<b>Kelompok: ${esc(st.teams.blue.nama || '-')}</b><br>` : ''}${esc(a.nama)}</td>
      <td class="c">${esc(a.nisn)}</td><td>${esc(a.peran)}</td>
      <td class="c">${s ? `<b>${nilaiBlue}</b>` : '—'}</td>
      <td class="c">${s ? (s.blue.tuntas ? 'TUNTAS' : 'BELUM TUNTAS') : '—'}</td></tr>`).join('')}
  </tbody>
</table>

<h3>D. Susunan Peserta — ⚔️ Tim Red (Intruder &amp; Ethical Hacker)</h3>
<table class="ba-tbl">
  <thead><tr><th style="width:6%">No</th><th style="width:34%">Nama Kelompok / Nama Lengkap</th><th style="width:16%">NISN / NIS</th><th style="width:26%">Peran dalam Tim</th><th style="width:9%">Nilai</th><th style="width:9%">Status</th></tr></thead>
  <tbody>
    ${red.map((a, i) => `<tr>
      <td class="c">${a.no}</td>
      <td>${i === 0 ? `<b>Kelompok: ${esc(st.teams.red.nama || '-')}</b><br>` : ''}${esc(a.nama)}</td>
      <td class="c">${esc(a.nisn)}</td><td>${esc(a.peran)}</td>
      <td class="c">${s ? `<b>${nilaiRed}</b>` : '—'}</td>
      <td class="c">${s ? (s.red.tuntas ? 'TUNTAS' : 'BELUM TUNTAS') : '—'}</td></tr>`).join('')}
  </tbody>
</table>

${khusus ? `
<h3>E. Notifikasi Kasus Khusus</h3>
<div class="ba-note special">
  <b>${esc(khusus.judul)}</b><br>
  ${esc(khusus.pesan)}
</div>` : `
<h3>E. Notifikasi Kasus Khusus</h3>
<div class="ba-note">Tidak terdeteksi kasus khusus. Kedua tim menjalankan perannya secara normal selama sesi berlangsung
(total serangan Red: ${s ? s.red.rincian.launched : 0} vektor).</div>`}

<h3>F. Matriks Rubrik Capaian 4 Aspek Kompetensi</h3>
<table class="ba-tbl">
  <thead><tr><th style="width:7%">Kode</th><th style="width:36%">Aspek Kompetensi</th><th style="width:10%">Bobot</th><th style="width:11%">Tim</th><th style="width:13%">Capaian</th><th style="width:13%">Kontribusi</th></tr></thead>
  <tbody>
    ${D.RUBRIK.map(r => {
      const cap = s ? s.aspek[r.kode] : null;
      const pembagi = r.tim === 'blue' ? 80 : 100;
      const kontri = s ? (cap * r.bobot / pembagi) : null;
      return `<tr><td class="c">${r.kode}</td><td>${esc(r.nama)}</td><td class="c">${r.bobot}%</td>
        <td class="c">${r.tim === 'blue' ? 'Blue' : 'Red'}</td>
        <td class="n">${s ? cap.toFixed(1) : '—'}</td><td class="n">${s ? kontri.toFixed(2) : '—'}</td></tr>`;
    }).join('')}
    ${s ? `<tr><td colspan="5" style="text-align:right"><b>NILAI AKHIR TIM BLUE</b> (normalisasi bobot 80%)</td><td class="n"><b>${nilaiBlue}</b> (${s.blue.grade})</td></tr>
    <tr><td colspan="5" style="text-align:right"><b>NILAI AKHIR TIM RED</b> (aspek A4)</td><td class="n"><b>${nilaiRed}</b> (${s.red.grade})</td></tr>` : ''}
  </tbody>
</table>
${s ? `<p style="font-size:11.5px">Keterangan grade: <b>A</b> ≥ 90 Sangat Kompeten • <b>B</b> ≥ 80 Kompeten • <b>C</b> ≥ KKM Cukup Kompeten • <b>D</b> &lt; KKM Belum Tuntas.
Rentang skor normal 60 – 100. Status ketuntasan: Blue <b>${s.blue.tuntas ? 'TUNTAS' : 'BELUM TUNTAS'}</b>, Red <b>${s.red.tuntas ? 'TUNTAS' : 'BELUM TUNTAS'}</b> (KKM ${s.kkm}).</p>` : ''}

<h3>G. Rekapitulasi Kinerja Sesi</h3>
<table class="ba-tbl">
  <thead><tr><th style="width:50%">Indikator 🛡️ Blue Team</th><th style="width:50%">Indikator ⚔️ Red Team</th></tr></thead>
  <tbody>
    <tr><td>SLA Uptime layanan kritis: <b>${st.blue.sla.toFixed(2)}%</b></td>
        <td>Total vektor serangan diluncurkan: <b>${st.red.launched}</b></td></tr>
    <tr><td>Insiden terdeteksi / terlewat: <b>${s ? (s.red.rincian.launched - st.blue.missed) : 0} / ${st.blue.missed}</b></td>
        <td>Serangan sukses: <b>${st.red.success}</b> • gagal: <b>${st.red.failed}</b> • diblokir: <b>${st.red.blocked}</b></td></tr>
    <tr><td>Playbook tepat / salah sasaran: <b>${st.blue.pbOk} / ${st.blue.pbWrong}</b></td>
        <td>Cakupan teknik MITRE ATT&amp;CK: <b>${st.red.techs.length} / ${D.TOTAL_TECH}</b></td></tr>
    <tr><td>Triase benar (TP) / false alarm: <b>${st.blue.tp} / ${st.blue.benignFp}</b></td>
        <td>CTF Flag diraih: <b>${st.red.flags.length} / ${D.TOTAL_FLAGS}</b> • Data bocor: <b>${Math.round(st.red.exfilMB)} MB</b></td></tr>
  </tbody>
</table>

<h3>H. Catatan Evaluasi Guru Pengampu</h3>
<div class="ba-note" style="min-height:74px;white-space:pre-wrap">${esc(st.guruNote || '(belum diisi)')}</div>

<div class="ba-ttd">
  <div class="box">
    ${esc(kota)}, ${esc(tglPanjang(st.cfg.tanggal))}<br>
    Ketua Tim Murid,<br>
    <div class="space"></div>
    <div class="nm">${esc(blue[0].nama !== '— (belum diisi) —' ? blue[0].nama : '....................................')}</div>
    <div>NISN. ${esc(blue[0].nisn !== '-' ? blue[0].nisn : '................................')}</div>
  </div>
  <div class="box">
    ${esc(kota)}, ${esc(tglPanjang(st.cfg.tanggal))}<br>
    Guru Mata Pelajaran / Penguji,<br>
    <div class="space"></div>
    <div class="nm">${esc(st.penguji.nama || D.PENGUJI.nama)}</div>
    <div>NIP/NUPTK. ................................</div>
  </div>
  <div class="box">
    ${esc(kota)}, ${esc(tglPanjang(st.cfg.tanggal))}<br>
    Pengawas Ujian,<br>
    <div class="space"></div>
    <div class="nm">${esc(st.penguji.pengawas || '....................................')}</div>
    <div>NIP/NUPTK. ................................</div>
  </div>
</div>

<div class="ba-foot">
  Dokumen ini dihasilkan otomatis oleh <b>${esc(D.PENGUJI.aplikasi)}</b> • ${esc(st.penguji.institusi || D.PENGUJI.institusi)}<br>
  Nomor dokumen ${esc(st.cfg.docNumber)} • Room ID ${esc(st.room)} • Dicetak/diunduh pada ${esc(tglPanjang(new Date().toISOString().slice(0, 10)))} ${jam(new Date())} WIT<br>
  Arsip elektronik (JSON) tersedia melalui tombol "Unduh Arsip Data" dan merupakan bagian tidak terpisahkan dari berita acara ini.
</div>`;
  }

  /* ============ ARSIP JSON ============ */
  function buildArchive(st) {
    const s = st.scores;
    return {
      dokumen: {
        aplikasi: D.PENGUJI.aplikasi,
        judul: 'Berita Acara Asesmen Sumatif Semester - Cyber Range Simulator (SIEM & SOAR)',
        nomor: st.cfg.docNumber,
        institusi: st.penguji.institusi || D.PENGUJI.institusi,
        yayasan: st.penguji.yayasan || D.PENGUJI.yayasan,
        alamat: st.penguji.alamat || D.PENGUJI.alamat,
        kota: st.penguji.kota || D.PENGUJI.kota,
        guruPenguji: { nama: st.penguji.nama, alias: st.penguji.alias },
        pengawasUjian: st.penguji.pengawas || '',
        roomId: st.room,
        dicetakPada: new Date().toISOString()
      },
      tujuanPembelajaran: (st.cfg.tujuan || D.TUJUAN_PEMBELAJARAN.join('\n')).split('\n').map(x => x.trim()).filter(Boolean),
      metadata: {
        kategori: st.cfg.kategori, mataPelajaran: st.cfg.mapel, tanggal: st.cfg.tanggal,
        kelas: st.cfg.kelas, jenjang: (D.KKM[st.cfg.kelas] || {}).jenjang, kkm: (D.KKM[st.cfg.kelas] || {}).kkm,
        durasiMenit: st.cfg.durasiMenit, jumlahAnggotaPerTim: st.cfg.jumlahAnggota,
        redBotOtonom: st.cfg.redBot, benignTraffic: st.cfg.benign,
        dimulaiEpoch: st.cfg.startedEpoch || null, fase: st.phase
      },
      waktu: { berjalanDetik: st.clock.elapsed, sisaDetik: st.clock.remaining, totalDetik: st.clock.total },
      tim: {
        blue: { namaKelompok: st.teams.blue.nama, anggota: anggotaRows(st.teams.blue.anggota, st.cfg.jumlahAnggota, D.PERAN_BLUE) },
        red: { namaKelompok: st.teams.red.nama, anggota: anggotaRows(st.teams.red.anggota, st.cfg.jumlahAnggota, D.PERAN_RED) }
      },
      penilaian: s ? {
        kkm: s.kkm,
        aspek: s.aspek,
        rubrik: D.RUBRIK.map(r => ({ kode: r.kode, nama: r.nama, bobot: r.bobot, tim: r.tim, capaian: s.aspek[r.kode], kontribusi: +(s.aspek[r.kode] * r.bobot / (r.tim === 'blue' ? 80 : 100)).toFixed(2) })),
        blue: s.blue, red: s.red, kasusKhusus: s.special
      } : null,
      kinerja: {
        blue: {
          slaUptimePersen: +st.blue.sla.toFixed(2), insidenTerdeteksi: st.red.launched - st.blue.missed,
          insidenTerlewat: st.blue.missed, triaseBenar: st.blue.tp, salahKlasifikasi: st.blue.fp,
          trafikWajarBenar: st.blue.benignOk, falseAlarm: st.blue.benignFp,
          playbookTepat: st.blue.pbOk, playbookSalah: st.blue.pbWrong, seranganDiblokir: st.blue.mitigated,
          jenisPlaybookDipakai: st.blue.pbTypes
        },
        red: {
          totalSerangan: st.red.launched, sukses: st.red.success, gagal: st.red.failed, diblokir: st.red.blocked,
          teknikTercakup: st.red.techs, faseTertinggi: st.red.maxPhase,
          flagDiraih: st.red.flags, dataBocorMB: Math.round(st.red.exfilMB),
          akses: st.red.access, ipSumberTerakhir: st.red.ip, proxyAktif: st.red.proxy
        }
      },
      kronologiSerangan: st.attacks.map((a, i) => ({
        no: i + 1, teknik: a.tech, taktik: a.tactic, vektor: a.nama, ipSumber: a.ip, target: a.target,
        mulaiDetik: a.startRel, durasiDetik: a.durasi, hasil: a.status,
        terdeteksi: a.detected === true, mttdDetik: a.detectDelay != null ? +a.detectDelay.toFixed(1) : null,
        dimitigasiOleh: a.mitigatedBy || null
      })),
      kondisiNodeAkhir: Object.keys(st.nodes).map(k => ({ id: k, nama: (D.NODES.find(n => n.id === k) || {}).nama, health: Math.round(st.nodes[k].health), ransom: st.nodes[k].ransom, quarantined: st.nodes[k].quarantined })),
      logSiem: st.logs.map(l => ({ detik: l.rel, severity: l.sev, proto: l.proto, src: l.src, dst: l.dst, app: l.app, pesan: l.msg, alert: l.alert, verdict: l.verdict })),
      eventFeed: st.events.map(e => ({ detik: e.rel, jenis: e.kind, teks: e.text })),
      catatanGuru: st.guruNote || ''
    };
  }

  function downloadJSON(st) {
    const data = buildArchive(st);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BeritaAcara_${st.cfg.docNumber.replace(/[\/\\]/g, '-')}_${st.room}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return a.download;
  }

  return { beritaAcara, assessSheet, downloadJSON, buildArchive, esc, mmss, tglPanjang, jam };
})();
