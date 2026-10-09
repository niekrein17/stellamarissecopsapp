'use strict';
/* Stella Maris SecOps App - admin.js
 * SUPERADMIN: identitas sekolah/yayasan, mapel, guru, pengawas, peserta tim.
 * Data disimpan di localStorage, dikunci saat SAVE, dipakai untuk sesi & berita acara.
 */
window.SuperAdmin = (function () {
  const D = window.SMData;
  const UI = window.UI;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  const KEY = 'stella.superadmin.profile.v1';
  const MIN_MEMBER = 2, MAX_MEMBER = 4;

  let unlocked = false;   // gerbang password per-sesi browser
  let draft = null;       // salinan kerja saat panel terbuka

  /* ================= PROFIL ================= */
  function blank() {
    return {
      namaYayasan: '', namaSekolah: '', alamat: '', kota: '',
      namaMapel: '', namaGuru: '', aliasGuru: '', pengawasUjian: '',
      tujuan: '', jumlahAnggota: MIN_MEMBER,
      blueTeamName: '', blueMembers: [], redTeamName: '', redMembers: [],
      locked: false
    };
  }

  function normMember(m) {
    return { nama: (m && m.nama ? String(m.nama) : ''), nisn: (m && m.nisn ? String(m.nisn) : '') };
  }

  function normalize(p) {
    const b = blank();
    if (!p || typeof p !== 'object') return b;
    const out = Object.assign(b, p);
    out.jumlahAnggota = Math.min(MAX_MEMBER, Math.max(MIN_MEMBER, Number(out.jumlahAnggota) || MIN_MEMBER));
    out.blueMembers = (Array.isArray(out.blueMembers) ? out.blueMembers : []).slice(0, MAX_MEMBER).map(normMember);
    out.redMembers = (Array.isArray(out.redMembers) ? out.redMembers : []).slice(0, MAX_MEMBER).map(normMember);
    ['namaYayasan', 'namaSekolah', 'alamat', 'kota', 'namaMapel', 'namaGuru', 'aliasGuru', 'pengawasUjian', 'tujuan', 'blueTeamName', 'redTeamName']
      .forEach(k => { out[k] = out[k] == null ? '' : String(out[k]); });
    out.locked = !!out.locked;
    return out;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return normalize(Object.assign({}, D.PROFILE_DEFAULT)); // install baru → default Stella Maris
      return normalize(JSON.parse(raw));
    } catch (e) { return normalize(Object.assign({}, D.PROFILE_DEFAULT)); }
  }

  function persist(p) {
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) {}
  }

  /* ================= VALIDASI ================= */
  function filledMembers(list) { return (list || []).filter(m => (m.nama || '').trim()).length; }

  function validate(p) {
    const err = [];
    if (!(p.namaSekolah || '').trim()) err.push('Nama Sekolah wajib diisi.');
    if (!(p.namaMapel || '').trim()) err.push('Nama Mata Pelajaran wajib diisi.');
    if (!(p.namaGuru || '').trim()) err.push('Nama Guru Mata Pelajaran wajib diisi.');
    if (filledMembers(p.blueMembers) < MIN_MEMBER) err.push(`Blue Team minimal ${MIN_MEMBER} peserta (nama terisi).`);
    if (filledMembers(p.redMembers) < MIN_MEMBER) err.push(`Red Team minimal ${MIN_MEMBER} peserta (nama terisi).`);
    return err;
  }

  /* ================= TERAPKAN KE LAYAR SETUP ================= */
  function setVal(sel, v) { const e = $(sel); if (e) e.value = v == null ? '' : v; }
  function setTxt(sel, v) { const e = $(sel); if (e) e.textContent = v == null ? '' : v; }

  function applyToSetup() {
    const p = load();
    setVal('#inInstitusi', p.namaSekolah);
    setVal('#inMapel', p.namaMapel);
    setVal('#inPenguji', p.namaGuru);
    setVal('#inPengawas', p.pengawasUjian);
    setVal('#inBlueTeam', p.blueTeamName);
    setVal('#inRedTeam', p.redTeamName);
    const jml = $('#inJumlah'); if (jml) jml.value = String(p.jumlahAnggota);
    setTxt('#heroInst', p.namaSekolah);
    setTxt('#heroPenguji', `${p.namaGuru}${p.aliasGuru ? ' (' + p.aliasGuru + ')' : ''}`);

    UI.buildMembers({ blueMembers: p.blueMembers, redMembers: p.redMembers });

    // kunci field identitas bila profil sudah dikunci
    const lockIds = ['#inInstitusi', '#inMapel', '#inPenguji', '#inPengawas', '#inBlueTeam', '#inRedTeam', '#inJumlah'];
    lockIds.forEach(id => { const e = $(id); if (e) { e.disabled = p.locked; e.classList.toggle('sa-locked', p.locked); } });
    $$('#blueMembers input, #redMembers input').forEach(e => { e.disabled = p.locked; e.classList.toggle('sa-locked', p.locked); });

    renderBanner(p);
    if (UI.renderGuide) UI.renderGuide();
    return p;
  }

  function renderBanner(p) {
    const b = $('#saBanner'); if (!b) return;
    if (p.locked) {
      b.hidden = false;
      b.className = 'sa-banner sa-banner-lock';
      b.innerHTML = `🔒 <b>Data sekolah TERKUNCI</b> — dipakai untuk sesi ujian/ulangan/latihan.
        <span class="sa-banner-detail">${UI.esc(p.namaSekolah || '-')} • ${UI.esc(p.namaMapel || '-')} • Guru: ${UI.esc(p.namaGuru || '-')}
        • Blue ${filledMembers(p.blueMembers)} &amp; Red ${filledMembers(p.redMembers)} peserta.</span>
        <button class="btn btn-mini" data-act="open-superadmin">✎ Ubah (SuperAdmin)</button>`;
    } else {
      b.hidden = false;
      b.className = 'sa-banner sa-banner-warn';
      b.innerHTML = `⚠️ <b>Data sekolah belum dikunci.</b> Buka <b>SuperAdmin</b> untuk mengisi &amp; mengunci identitas sekolah, mapel, guru, pengawas, dan peserta.
        <button class="btn btn-mini btn-accent" data-act="open-superadmin">🔐 Buka SuperAdmin</button>`;
    }
  }

  /* ================= PANEL EDITOR (di dalam modal) ================= */
  function memberRowsHtml(list, n, team) {
    let h = '';
    for (let i = 0; i < n; i++) {
      const m = list[i] || { nama: '', nisn: '' };
      h += `<div class="sa-member">
        <span class="sa-midx">${i + 1}</span>
        <input type="text" class="sa-mnama" data-team="${team}" data-i="${i}" placeholder="Nama lengkap peserta ${i + 1}" maxlength="60" value="${UI.esc(m.nama)}">
        <input type="text" class="sa-mnisn" data-team="${team}" data-i="${i}" placeholder="NISN / NIS" maxlength="20" value="${UI.esc(m.nisn)}">
      </div>`;
    }
    return h;
  }

  function gateHtml() {
    return `<div class="sa-gate">
      <p class="hint">Area <b>SuperAdmin</b> dilindungi kata sandi. Masukkan sandi untuk mengelola identitas sekolah, mata pelajaran, guru, pengawas ujian, dan peserta.</p>
      <div class="row">
        <input id="saPass" type="password" placeholder="Kata sandi SuperAdmin" autocomplete="off" style="max-width:280px">
        <button class="btn btn-primary" data-act="sa-pass-submit">🔓 Buka</button>
      </div>
      <div id="saPassErr" class="err"></div>
    </div>`;
  }

  function editorHtml() {
    const p = draft;
    const n = p.jumlahAnggota;
    const jmlOpts = [];
    for (let i = MIN_MEMBER; i <= MAX_MEMBER; i++) jmlOpts.push(`<option value="${i}"${i === n ? ' selected' : ''}>${i} peserta per tim</option>`);
    return `
    <div class="sa-panel">
      <div class="sa-note">Isi identitas penyelenggara. Setelah <b>Simpan &amp; Kunci</b>, data ini dipakai otomatis untuk sesi ujian/ulangan/latihan dan tercetak pada Berita Acara. Gunakan <b>Reset ke Default</b> untuk mengosongkan seluruh isian saat berpindah sekolah/jenjang.</div>

      <div class="sa-grid">
        <label>Nama Yayasan
          <input id="saYayasan" type="text" maxlength="120" value="${UI.esc(p.namaYayasan)}" placeholder="cth: Yayasan Pendidikan Katolik">
        </label>
        <label>Nama Sekolah
          <input id="saSekolah" type="text" maxlength="120" value="${UI.esc(p.namaSekolah)}" placeholder="cth: SMK Katolik Stella Maris Tobelo">
        </label>
        <label class="sa-wide">Alamat Sekolah
          <input id="saAlamat" type="text" maxlength="160" value="${UI.esc(p.alamat)}" placeholder="cth: Jl. Pendidikan No. 1, Tobelo">
        </label>
        <label>Kota (untuk tanda tangan Berita Acara)
          <input id="saKota" type="text" maxlength="60" value="${UI.esc(p.kota)}" placeholder="cth: Tobelo">
        </label>
        <label>Nama Mata Pelajaran
          <input id="saMapel" type="text" maxlength="120" value="${UI.esc(p.namaMapel)}" placeholder="cth: Dasar Keamanan Informasi / TJKT">
        </label>
        <label>Nama Guru Mata Pelajaran
          <input id="saGuru" type="text" maxlength="120" value="${UI.esc(p.namaGuru)}" placeholder="cth: Paulus Renggo, S.Kom.">
        </label>
        <label>Alias / Panggilan Guru
          <input id="saAlias" type="text" maxlength="60" value="${UI.esc(p.aliasGuru)}" placeholder="cth: PaulNiek">
        </label>
        <label>Pengawas Ujian
          <input id="saPengawas" type="text" maxlength="120" value="${UI.esc(p.pengawasUjian)}" placeholder="cth: Nama Pengawas, S.Pd.">
        </label>
      </div>

      <h4 class="sa-h">🎯 Tujuan Pembelajaran</h4>
      <textarea id="saTujuan" rows="6" placeholder="Satu tujuan per baris…">${UI.esc(p.tujuan)}</textarea>

      <div class="sa-jml">
        <label>Jumlah peserta per tim (min ${MIN_MEMBER}, maks ${MAX_MEMBER})
          <select id="saJumlah">${jmlOpts.join('')}</select>
        </label>
      </div>

      <div class="sa-teams">
        <div class="sa-team sa-team-blue">
          <h4 class="sa-h">🛡️ Blue Team (SOC)</h4>
          <label>Nama Kelompok <input id="saBlueName" type="text" maxlength="60" value="${UI.esc(p.blueTeamName)}" placeholder="cth: BLUE SENTINEL"></label>
          <div id="saBlueMembers">${memberRowsHtml(p.blueMembers, n, 'blue')}</div>
        </div>
        <div class="sa-team sa-team-red">
          <h4 class="sa-h">⚔️ Red Team (Intruder)</h4>
          <label>Nama Kelompok <input id="saRedName" type="text" maxlength="60" value="${UI.esc(p.redTeamName)}" placeholder="cth: RED PHANTOM"></label>
          <div id="saRedMembers">${memberRowsHtml(p.redMembers, n, 'red')}</div>
        </div>
      </div>

      <div id="saSaveErr" class="err"></div>
      ${p.locked ? '<div class="sa-locked-note">🔒 Profil saat ini berstatus TERKUNCI. Menyimpan ulang akan memperbarui dan tetap mengunci data.</div>' : ''}
    </div>`;
  }

  function footHtml() {
    return `<button class="btn btn-ghost" data-act="modal-close">Tutup</button>
      <button class="btn btn-danger" data-act="sa-reset">♻ Reset ke Default</button>
      <button class="btn btn-primary" data-act="sa-save">💾 Simpan &amp; Kunci</button>`;
  }

  function openPanel() {
    draft = load();
    UI.modal('🔐 SuperAdmin — Konfigurasi Penyelenggara', editorHtml(), footHtml());
    wirePanel();
  }

  function openGate() {
    UI.modal('🔐 SuperAdmin', gateHtml(), `<button class="btn btn-ghost" data-act="modal-close">Tutup</button>`);
    setTimeout(() => { const e = $('#saPass'); if (e) e.focus(); }, 40);
  }

  function open() {
    if (unlocked) openPanel(); else openGate();
  }

  function submitPass() {
    const v = ($('#saPass') || {}).value || '';
    if (v === D.SUPERADMIN.password) {
      unlocked = true; openPanel();
      UI.toast('🔓 SuperAdmin terbuka.', 'ok');
    } else {
      const e = $('#saPassErr'); if (e) e.textContent = 'Kata sandi salah. Coba lagi.';
      const inp = $('#saPass'); if (inp) { inp.value = ''; inp.focus(); }
    }
  }

  /* kumpulkan nilai form editor → draft */
  function readForm() {
    const g = (id) => { const e = $('#' + id); return e ? e.value : ''; };
    draft.namaYayasan = g('saYayasan').trim();
    draft.namaSekolah = g('saSekolah').trim();
    draft.alamat = g('saAlamat').trim();
    draft.kota = g('saKota').trim();
    draft.namaMapel = g('saMapel').trim();
    draft.namaGuru = g('saGuru').trim();
    draft.aliasGuru = g('saAlias').trim();
    draft.pengawasUjian = g('saPengawas').trim();
    draft.tujuan = g('saTujuan');
    draft.blueTeamName = g('saBlueName').trim();
    draft.redTeamName = g('saRedName').trim();
    draft.jumlahAnggota = Math.min(MAX_MEMBER, Math.max(MIN_MEMBER, Number(g('saJumlah')) || MIN_MEMBER));
    draft.blueMembers = collectFormMembers('blue');
    draft.redMembers = collectFormMembers('red');
  }

  function collectFormMembers(team) {
    const out = [];
    $$('.sa-member').forEach(row => {
      const nm = $('.sa-mnama', row), nn = $('.sa-mnisn', row);
      if (!nm || nm.dataset.team !== team) return;
      out[Number(nm.dataset.i)] = { nama: (nm.value || '').trim(), nisn: (nn ? nn.value.trim() : '') };
    });
    return out.filter(Boolean).slice(0, MAX_MEMBER);
  }

  /* ganti jumlah baris peserta tanpa kehilangan isian */
  function rebuildMembers() {
    const cur = { blue: collectFormMembers('blue'), red: collectFormMembers('red') };
    const n = draft.jumlahAnggota;
    const bh = $('#saBlueMembers'), rh = $('#saRedMembers');
    if (bh) bh.innerHTML = memberRowsHtml(cur.blue, n, 'blue');
    if (rh) rh.innerHTML = memberRowsHtml(cur.red, n, 'red');
  }

  function wirePanel() {
    const jml = $('#saJumlah');
    if (jml) jml.addEventListener('change', () => {
      draft.jumlahAnggota = Math.min(MAX_MEMBER, Math.max(MIN_MEMBER, Number(jml.value) || MIN_MEMBER));
      rebuildMembers();
    });
    const pass = $('#saPass');
    if (pass) pass.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submitPass(); } });
  }

  function save() {
    readForm();
    const err = validate(draft);
    if (err.length) {
      const box = $('#saSaveErr');
      if (box) box.innerHTML = 'Perbaiki sebelum menyimpan:<br>• ' + err.map(UI.esc).join('<br>• ');
      return;
    }
    draft.locked = true;
    persist(draft);
    UI.closeModal();
    applyToSetup();
    UI.toast('💾 Data SuperAdmin <b>tersimpan &amp; terkunci</b>. Identitas ini dipakai untuk sesi berikutnya.', 'ok');
  }

  function resetDefault() {
    UI.modal('♻ Reset ke Default',
      `<p>Seluruh isian SuperAdmin (identitas sekolah/yayasan, mapel, guru, pengawas, peserta) akan <b>dikosongkan</b> dan kunci dilepas,
       sehingga Anda dapat memasukkan data sekolah/jenjang yang baru. Tindakan ini tidak dapat dibatalkan.</p>`,
      `<button class="btn btn-ghost" data-act="sa-cancel-reset">Batal</button>
       <button class="btn btn-danger" data-act="sa-reset-confirm">Ya, Kosongkan Semua</button>`);
  }

  function resetConfirm() {
    const p = blank();
    p.tujuan = D.TUJUAN_PEMBELAJARAN.join('\n'); // tujuan pembelajaran tetap tersedia sebagai referensi
    persist(p);
    draft = p;
    UI.closeModal();
    applyToSetup();
    UI.toast('♻ Aplikasi direset ke default — seluruh isian identitas dikosongkan. Silakan buka SuperAdmin untuk input data baru.', 'warn');
  }

  /* profil penguji untuk state sesi (dipakai app.js createRoom) */
  function pengujiForSession() {
    const p = load();
    return {
      nama: p.namaGuru || D.PENGUJI.nama,
      alias: p.aliasGuru || D.PENGUJI.alias,
      institusi: p.namaSekolah || D.PENGUJI.institusi,
      yayasan: p.namaYayasan || D.PENGUJI.yayasan,
      alamat: p.alamat || D.PENGUJI.alamat,
      kota: p.kota || D.PENGUJI.kota,
      pengawas: p.pengawasUjian || '',
      aplikasi: D.PENGUJI.aplikasi,
      pin: D.PENGUJI.pin
    };
  }

  return {
    load, save, persist, applyToSetup, open, submitPass, resetDefault, resetConfirm,
    pengujiForSession, isUnlocked: () => unlocked,
    validate, filledMembers, MIN_MEMBER, MAX_MEMBER
  };
})();
