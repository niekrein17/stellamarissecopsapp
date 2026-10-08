'use strict';
/* Stella Maris SecOps App - ui.js : seluruh rendering antarmuka */
window.UI = (function () {
  const D = window.SMData;
  const R = window.Report;
  const E = () => window.Engine;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  const S = {
    sevFilter: 'ALL', search: '', autoScroll: true,
    selNode: null, redTarget: 'WEB-01', activeTab: null,
    pinOk: false, role: 'dual', isHost: false
  };

  /* signature cache: mencegah re-render elemen berisi <select>/<input> tiap tick */
  const sigCache = {};
  function sig(key, value, renderFn) {
    if (sigCache[key] === value) return false;
    sigCache[key] = value;
    renderFn();
    return true;
  }
  function clearSig() { for (const k in sigCache) delete sigCache[k]; }

  let termStarted = false, termSeenEvent = 0;

  /* ================= UTIL ================= */
  function esc(s) { return R.esc(s); }
  function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }

  function toast(msg, kind) {
    const w = $('#toastWrap'); if (!w) return;
    const t = el(`<div class="toast ${kind || ''}">${msg}</div>`);
    w.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = '.3s'; setTimeout(() => t.remove(), 320); }, 3400);
  }

  function modal(title, bodyHtml, footHtml) {
    $('#modalTitle').innerHTML = title;
    $('#modalBody').innerHTML = bodyHtml;
    $('#modalFoot').innerHTML = footHtml || `<button class="btn" data-act="modal-close">Tutup</button>`;
    $('#modal').hidden = false;
  }
  function closeModal() { $('#modal').hidden = true; }

  function screen(name) {
    $$('.screen').forEach(s => s.classList.remove('active'));
    const t = $('#scr-' + name); if (t) t.classList.add('active');
    $('#btnLogout').hidden = (name === 'setup');
  }

  function mmss(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    return String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
  }

  function ns(st, id) {
    const n = st.nodes && st.nodes[id];
    return { health: n ? Math.round(n.health) : 100, status: n ? E().nodeStatus(st, id) : 'online' };
  }

  function labelRole(r) {
    return { guru: '👨‍🏫 GURU', blue: '🛡️ BLUE', red: '⚔️ RED', dual: '🖥️ DUAL VIEW' }[r] || r;
  }

  /* ================= SETUP ================= */
  function populateSetup() {
    $('#inKategori').innerHTML = D.KATEGORI.map(k => `<option${k === 'Latihan / Drill' ? ' selected' : ''}>${esc(k)}</option>`).join('');
    $('#inDurasi').innerHTML = D.DURASI.map(d => `<option value="${d}"${d === 15 ? ' selected' : ''}>${d} menit</option>`).join('');
    $('#inJumlah').innerHTML = D.JUMLAH_ANGGOTA.map(j => `<option value="${j}"${j === 3 ? ' selected' : ''}>${j} orang per tim</option>`).join('');
    $('#inKelas').innerHTML = Object.keys(D.KKM).map(k => `<option value="${k}">${esc(D.KKM[k].label)} — KKM ${D.KKM[k].kkm}</option>`).join('');
    $('#inKelas').value = '10';
    $('#inPenguji').value = D.PENGUJI.nama;
    $('#inInstitusi').value = D.PENGUJI.institusi;
    $('#inTanggal').value = new Date().toISOString().slice(0, 10);
    $('#heroInst').textContent = D.PENGUJI.institusi;
    $('#heroPenguji').textContent = `${D.PENGUJI.nama} (${D.PENGUJI.alias})`;
    $('#inRoom').value = E().roomCode();
    refreshKkm();
    if (window.SuperAdmin) window.SuperAdmin.applyToSetup(); else buildMembers();
  }

  function refreshKkm() {
    const k = $('#inKelas').value; const info = D.KKM[k];
    $('#kkmBox').innerHTML = `KKM terdeteksi otomatis: <b>${info.kkm}</b> &nbsp;•&nbsp; ${esc(info.label)} &nbsp;•&nbsp; dinyatakan Tuntas bila nilai ≥ ${info.kkm}`;
  }

  function buildMembers(preset) {
    const n = Number($('#inJumlah').value) || 3;
    ['blue', 'red'].forEach(team => {
      const host = $('#' + team + 'Members');
      let old;
      if (preset && Array.isArray(preset[team + 'Members'])) {
        old = preset[team + 'Members'].map(m => ({ nama: (m && m.nama) || '', nisn: (m && m.nisn) || '' }));
      } else {
        old = $$('.member-row', host).map(r => ({
          nama: ($('.m-nama', r) || {}).value || '', nisn: ($('.m-nisn', r) || {}).value || ''
        }));
      }
      const peran = team === 'blue' ? D.PERAN_BLUE : D.PERAN_RED;
      let h = '';
      for (let i = 0; i < n; i++) {
        h += `<div class="member-row">
          <div class="idx">${i + 1}</div>
          <input class="m-nama" type="text" placeholder="Nama lengkap anggota ${i + 1}" maxlength="60" value="${esc(old[i] ? old[i].nama : '')}">
          <input class="m-nisn" type="text" placeholder="NISN / NIS" maxlength="20" value="${esc(old[i] ? old[i].nisn : '')}">
          <div class="peran">↳ Peran: ${esc(peran[i % peran.length])}</div>
        </div>`;
      }
      host.innerHTML = h;
    });
  }

  function collectMembers(team) {
    const peran = team === 'blue' ? D.PERAN_BLUE : D.PERAN_RED;
    return $$('#' + team + 'Members .member-row').map((r, i) => ({
      nama: (($('.m-nama', r) || {}).value || '').trim(),
      nisn: (($('.m-nisn', r) || {}).value || '').trim(),
      peran: peran[i % peran.length]
    }));
  }

  /* ================= LOBBY ================= */
  function renderLobby(peers, host, state, room) {
    $('#lobbyRoom').textContent = room || (state && state.room) || '-';
    $('#peerList').innerHTML = (peers && peers.length)
      ? peers.map(p => `<div class="peer"><span class="dot"></span><span class="nm">${esc(p.name)}</span>
          ${p.id === host ? '<span class="host-tag">HOST</span>' : ''}
          <span class="rl rl-${p.role}">${labelRole(p.role)}</span></div>`).join('')
      : `<div class="peer"><span class="dot" style="background:#f6c445;box-shadow:none"></span><span class="nm">Menunggu peserta lain…</span></div>`;

    if (state) {
      const kk = D.KKM[state.cfg.kelas];
      $('#lobbySummary').textContent =
`Kategori       : ${state.cfg.kategori}
Durasi         : ${state.cfg.durasiMenit} menit (countdown otomatis)
Jenjang/Kelas  : ${kk.label}  →  KKM ${kk.kkm}
Anggota / tim  : ${state.cfg.jumlahAnggota} siswa
Mata Pelajaran : ${state.cfg.mapel}
Tim Blue       : ${state.teams.blue.nama || '(belum diisi)'} [${state.teams.blue.anggota.filter(a => a.nama).length} identitas]
Tim Red        : ${state.teams.red.nama || '(belum diisi)'} [${state.teams.red.anggota.filter(a => a.nama).length} identitas]
Simulator      : RedBot ${state.cfg.redBot ? 'AKTIF' : 'nonaktif'} • Benign Traffic ${state.cfg.benign ? 'AKTIF' : 'nonaktif'}
No. Dokumen    : ${state.cfg.docNumber}
Guru Penguji   : ${state.penguji.nama} — ${state.penguji.institusi}`;
    }
    const isH = window.Net.isHost;
    $('#lobbyActions').style.display = isH ? 'flex' : 'none';
    $('#lobbyHint').innerHTML = isH
      ? 'Anda adalah <b>Host</b> — mesin simulasi berjalan di perangkat ini. Tekan <b>Mulai Simulasi</b> setelah seluruh peserta bergabung.'
      : 'Menunggu Host memulai simulasi. Layar berpindah otomatis ketika sesi dimulai.';
  }

  /* ================= TABS ================= */
  const TABS = {
    guru: { id: 'guru', t: '👨‍🏫 Konsol Guru', cls: 't-guru' },
    siem: { id: 'siem', t: '🛡️ Blue Console (SIEM)', cls: 't-blue' },
    soar: { id: 'soar', t: '⚙️ Blue Automation (SOAR)', cls: 't-blue' },
    red: { id: 'red', t: '⚔️ Red Terminal', cls: 't-red' },
    dual: { id: 'dual', t: '🖥️ Dual View (Split Screen)', cls: '' },
    topo: { id: 'topo', t: '🗺️ Topologi', cls: '' },
    insiden: { id: 'insiden', t: '📋 Papan Insiden', cls: '' },
    arsip: { id: 'arsip', t: '📜 Berita Acara', cls: 't-guru' },
    panduan: { id: 'panduan', t: '📖 Panduan', cls: '' }
  };

  function tabList(role, isHost) {
    let list;
    if (role === 'guru') list = ['guru', 'siem', 'soar', 'red', 'topo', 'insiden', 'arsip', 'panduan'];
    else if (role === 'blue') list = ['siem', 'soar', 'topo', 'insiden', 'panduan'];
    else if (role === 'red') list = ['red', 'topo', 'insiden', 'panduan'];
    else list = ['dual', 'soar', 'topo', 'insiden', 'panduan'];
    if (isHost && role !== 'guru') list = ['guru', 'arsip'].concat(list);
    return Array.from(new Set(list));
  }

  function buildTabs(role, isHost) {
    const list = tabList(role, isHost);
    const bar = $('#tabbar');
    const key = list.join('|') + '#' + S.activeTab;
    sig('tabs', key, () => {
      bar.innerHTML = list.map(k => {
        const t = TABS[k];
        return `<button class="tab ${t.cls} ${S.activeTab === k ? 'on' : ''}" data-act="tab" data-tab="${k}">${t.t}</button>`;
      }).join('');
    });
    return list;
  }

  function setTab(tab, role, isHost) {
    const list = tabList(role, isHost);
    if (!list.includes(tab)) tab = list[0];
    S.activeTab = tab;
    buildTabs(role, isHost);
    $$('#tabbar .tab').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    const sim = $('#scr-sim');
    sim.classList.remove('dual');
    $$('#panels .panel').forEach(p => p.classList.remove('active', 'dual-on'));
    if (tab === 'dual') {
      sim.classList.add('dual');
      $('#p-siem').classList.add('dual-on');
      $('#p-red').classList.add('dual-on');
    } else {
      const p = $('#p-' + tab); if (p) p.classList.add('active');
    }
    if (tab === 'red' || tab === 'dual') setTimeout(() => { const t = $('#termInput'); if (t && window.innerWidth > 900) t.focus(); }, 60);
  }

  /* ================= RIBBON ================= */
  function renderRibbon(st) {
    $('#ribRoom').textContent = st.room;
    $('#ribKat').textContent = st.cfg.kategori;
    const kk = D.KKM[st.cfg.kelas];
    $('#ribKelas').innerHTML = `${esc(kk.label)} • KKM <b>${kk.kkm}</b>`;
    $('#ribTimer').textContent = mmss(st.clock.remaining);
    const tb = $('#ribTimerBox');
    tb.classList.toggle('warn', st.phase === 'running' && st.clock.remaining <= 120 && st.clock.remaining > 30);
    tb.classList.toggle('danger', st.clock.remaining <= 30 && st.phase === 'running');

    const sla = st.blue.sla || 0;
    $('#ribSla').textContent = sla.toFixed(1) + '%';
    const sb = $('#ribSla').closest('.rib');
    sb.classList.toggle('low', sla < 95 && sla >= 80);
    sb.classList.toggle('crit', sla < 80);

    $('#ribThreat').textContent = st.active.length;
    $('#ribFlag').textContent = `${st.red.flags.length}/${D.TOTAL_FLAGS}`;

    const bEl = $('#ribBlue'), rEl = $('#ribRed');
    const showScore = st.revealed && st.scores;
    if (showScore) {
      bEl.textContent = st.scores.blue.nilai + ' (' + st.scores.blue.grade + ')';
      rEl.textContent = st.scores.red.nilai + ' (' + st.scores.red.grade + ')';
      bEl.classList.remove('secret'); rEl.classList.remove('secret');
    } else {
      bEl.textContent = 'DIRAHASIAKAN 🔒'; rEl.textContent = 'DIRAHASIAKAN 🔒';
      bEl.classList.add('secret'); rEl.classList.add('secret');
    }
    const pe = $('#ribPhase');
    pe.textContent = { setup: 'MENUNGGU', running: '🔴 LIVE', paused: '⏸ DIJEDA', ended: '🏁 SELESAI' }[st.phase] || st.phase;
    pe.style.color = st.phase === 'running' ? '#ff4d6d' : st.phase === 'ended' ? '#3ddc84' : '#f6c445';
  }

  /* ================= SIEM ================= */
  function matchSev(l) {
    if (S.sevFilter === 'ALL') return true;
    if (S.sevFilter === 'ALERT+') return l.sev === 'ALERT' || l.sev === 'CRITICAL';
    if (S.sevFilter === 'UNJUDGED') return l.alert && !l.verdict;
    return l.sev === S.sevFilter;
  }
  function matchSearch(l) {
    const q = S.search.trim().toLowerCase();
    if (!q) return true;
    return (l.msg + ' ' + l.src + ' ' + l.dst + ' ' + l.proto + ' ' + l.app + ' ' + l.sev).toLowerCase().includes(q);
  }
  function hi(text) {
    const q = S.search.trim();
    const safe = esc(text);
    if (!q) return safe;
    const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
    return safe.replace(re, '<span class="hl">$1</span>');
  }

  function renderLogs(st) {
    const body = $('#logBody'); if (!body) return;
    const rows = st.logs.filter(l => matchSev(l) && matchSearch(l)).slice(-260).reverse();
    body.innerHTML = rows.map(l => {
      const t = l.jam ? new Date(l.jam) : null;
      const wkt = t && !isNaN(t) ? t.toTimeString().slice(0, 8) : '--:--:--';
      let tri;
      if (l.verdict) tri = `<span class="vd vd-${l.verdict}">${l.verdict.toUpperCase()}</span>`;
      else if (l.alert) tri = `<div class="vd-none"><button data-act="triage" data-id="${l.id}" data-v="tp">TP</button><button data-act="triage" data-id="${l.id}" data-v="fp">FP</button></div>`;
      else tri = `<div class="vd-none"><button data-act="triage" data-id="${l.id}" data-v="fp">FP</button></div>`;
      return `<tr class="lv-${l.sev}" data-logid="${l.id}">
        <td>${wkt}<br><span style="color:#5d7192">T+${mmss(l.rel)}</span></td>
        <td><span class="sev sev-${l.sev}">${l.sev}</span></td>
        <td>${esc(l.proto)}</td><td>${esc(l.src)}</td><td>${esc(l.dst)}</td><td>${esc(l.app)}</td>
        <td class="msg">${hi(l.msg)}</td><td>${tri}</td></tr>`;
    }).join('') || `<tr><td colspan="8" style="text-align:center;color:#5d7192;padding:26px">Belum ada log yang cocok dengan filter.</td></tr>`;

    const wrap = $('.log-wrap');
    if (wrap && S.autoScroll) wrap.scrollTop = 0;

    const c = { INFO: 0, WARNING: 0, ALERT: 0, CRITICAL: 0 };
    st.logs.forEach(l => { if (c[l.sev] != null) c[l.sev]++; });
    const unjudged = st.logs.filter(l => l.alert && !l.verdict).length;
    $('#siemStats').innerHTML =
      `<span class="stat">INFO <b>${c.INFO}</b></span><span class="stat">WARN <b>${c.WARNING}</b></span>
       <span class="stat">ALERT <b>${c.ALERT}</b></span><span class="stat">CRIT <b style="color:#ff4d6d">${c.CRITICAL}</b></span>
       <span class="stat">BELUM TRIASE <b style="color:#f6c445">${unjudged}</b></span>
       <span class="stat">TP <b style="color:#3ddc84">${st.blue.tp}</b></span>
       <span class="stat">MISSED <b style="color:#ff4d6d">${st.blue.missed}</b></span>`;

    renderTriageQueue(st);
  }

  function renderTriageQueue(st) {
    const q = st.logs.filter(l => l.alert && !l.verdict).slice(-30).reverse();
    $('#triageQueue').innerHTML = q.length ? q.map(l => `
      <div class="tq-item lv-${l.sev}">
        <div class="row" style="justify-content:space-between">
          <span class="sev sev-${l.sev}">${l.sev}</span>
          <span style="font-family:var(--mono);font-size:10px;color:#5d7192">${esc(l.src)} → ${esc(l.dst)} • ${esc(l.proto)} • T+${mmss(l.rel)}</span>
        </div>
        <div class="tq-msg">${esc(l.msg)}</div>
        <div class="row">
          <button class="btn btn-mini btn-accent" data-act="triage" data-id="${l.id}" data-v="tp">✔ Ancaman (TP)</button>
          <button class="btn btn-mini" data-act="triage" data-id="${l.id}" data-v="fp">✖ Wajar (FP)</button>
        </div>
      </div>`).join('') : `<p class="hint">Tidak ada alert menunggu triase. 👍</p>`;

    $('#activeThreats').innerHTML = st.active.length ? st.active.map(a => `
      <div class="threat">
        <div class="row" style="justify-content:space-between">
          <span class="tn">${esc(a.nama)}</span><span class="pill pill-berjalan">${esc(a.status.toUpperCase())}</span>
        </div>
        <div class="meta">${esc(a.tech)} • ${esc(a.ip)} → ${esc(a.targetName || a.target)} • ${a.tick}/${a.durasi}s
          ${a.detected ? ' • <span style="color:#3ddc84">TERDETEKSI</span>' : ' • <span style="color:#f6c445">BELUM DITRIASE</span>'}</div>
        <div class="bar"><i style="width:${Math.min(100, (a.tick / a.durasi) * 100)}%"></i></div>
        <div class="row" style="margin-top:5px">
          <button class="btn btn-mini btn-blue" data-act="mitigate-current" data-attack="${esc(a.attackId)}" data-node="${esc(a.target)}" data-ip="${esc(a.ip)}">🛡 Mitigasi Sekarang</button>
        </div>
      </div>`).join('') : `<p class="hint">Tidak ada serangan yang sedang berjalan.</p>`;
  }

  /* ================= SOAR ================= */
  function buildPlaybooks() {
    const nodeOpts = `<option value="*">SELURUH NODE (global)</option>` +
      D.NODES.filter(n => n.id !== 'INET').map(n => `<option value="${n.id}">${n.id} — ${esc(n.nama)}</option>`).join('');
    $('#pbGrid').innerHTML = D.PLAYBOOKS.map(p => `
      <div class="pb-card">
        <div class="kode">${p.kode}</div>
        <h5>${esc(p.nama)}</h5>
        <p>${esc(p.desc)}</p>
        <div class="cmdline">${esc(p.cmd)}</div>
        <div class="counters">${p.counter.map(c => `<span>${esc((D.ATTACK_MAP[c] || {}).tech || c)}</span>`).join('')}</div>
        <div class="pb-foot">
          ${p.target === 'ip'
            ? `<input type="text" class="pb-ip" placeholder="IP target (kosong = IP Red aktif)" style="margin:0;flex:1;padding:5px 7px;font-size:11.5px">`
            : `<select class="pb-node">${nodeOpts}</select>`}
          <button class="btn btn-mini btn-blue" data-act="playbook" data-pb="${p.id}">▶ Jalankan</button>
        </div>
        <div class="hint" style="margin:0">Berlaku ${p.ttl}s • disrupsi layanan −${p.disrupt}</div>
      </div>`).join('');
    $('#qaNode').innerHTML = D.NODES.filter(n => n.id !== 'INET').map(n => `<option value="${n.id}">${n.id} — ${esc(n.nama)}</option>`).join('');
    clearSig();
  }

  function renderSoar(st) {
    sig('qaIp', D.RED_IPS.join(',') + '|' + st.red.ip, () => {
      $('#qaIp').innerHTML = Array.from(new Set([st.red.ip].concat(D.RED_IPS))).map(ip =>
        `<option value="${ip}"${ip === st.red.ip ? ' selected' : ''}>${ip}${ip === st.red.ip ? '  (Red aktif)' : ''}</option>`).join('');
    });

    $('#soarStats').innerHTML =
      `<span class="stat">SLA <b style="color:#3ddc84">${(st.blue.sla || 0).toFixed(1)}%</b></span>
       <span class="stat">PB TEPAT <b style="color:#3ddc84">${st.blue.pbOk}</b></span>
       <span class="stat">PB SALAH <b style="color:#f6c445">${st.blue.pbWrong}</b></span>
       <span class="stat">DIBLOKIR <b>${st.blue.mitigated}</b></span>
       <span class="stat">KEBIJAKAN AKTIF <b style="color:#3ba7ff">${st.mitig.length}</b></span>`;

    $('#mitigList').innerHTML = st.mitig.length ? st.mitig.slice().reverse().map(m => {
      const quar = m.node !== '*' && m.node !== null && st.nodes[m.node] && ns(st, m.node).status === 'quarantine';
      return `<div class="mitig ${m.correct ? '' : 'wrong'}">
        <div class="mn">${esc(m.kode)} • ${esc(m.nama)}</div>
        <div class="mm">scope: ${m.node === '*' ? 'GLOBAL' : esc(m.node || 'perimeter')}${m.ip ? ' • ip ' + esc(m.ip) : ''} • sisa ${m.sisa}s • ${m.correct ? 'MATCH-THREAT' : 'NO-MATCH'}</div>
        ${quar ? `<button class="btn btn-mini" data-act="quick-unquarantine-node" data-node="${esc(m.node)}" style="margin-top:4px">🔓 Lepas karantina</button>` : ''}
      </div>`;
    }).join('') : `<p class="hint">Belum ada kebijakan mitigasi aktif.</p>`;

    $('#pbHistory').innerHTML = st.attacks.length ? st.attacks.slice(-14).reverse().map(a => {
      const ok = a.status === 'diblokir';
      return `<div class="pbh ${ok ? 'ok' : 'no'}">T+${mmss(a.startRel)} • ${esc(a.nama)} → <b>${ok ? 'DIBLOKIR' + (a.mitigatedBy ? ' (' + esc(D.PLAYBOOK_MAP[a.mitigatedBy].kode) + ')' : '') : esc(a.status.toUpperCase())}</b></div>`;
    }).join('') : `<p class="hint">Belum ada riwayat eksekusi.</p>`;
  }

  /* ================= RED ================= */
  function renderRed(st) {
    $('#redStats').innerHTML =
      `<span class="stat">SERANGAN <b style="color:#ff4d6d">${st.red.launched}</b></span>
       <span class="stat">SUKSES <b style="color:#3ddc84">${st.red.success}</b></span>
       <span class="stat">DIBLOKIR <b style="color:#f6c445">${st.red.blocked}</b></span>
       <span class="stat">FLAG <b style="color:#a78bfa">${st.red.flags.length}/${D.TOTAL_FLAGS}</b></span>
       <span class="stat">BOCOR <b>${st.red.exfilMB} MB</b></span>`;

    sig('redIp', D.RED_IPS.join(','), () => {
      $('#redIpSel').innerHTML = D.RED_IPS.map(ip => `<option value="${ip}">${ip}</option>`).join('');
    });
    $('#redIpSel').value = st.red.ip;
    const px = $('#redProxy'); if (px && px.checked !== !!st.red.proxy) px.checked = !!st.red.proxy;
    $('#proxyNode').textContent = 'node: ' + (st.red.proxy ? st.red.proxyNode : '— (direct)') + ' • IP aktif: ' + st.red.ip;

    sig('targets', D.NODES.map(n => n.id + (ns(st, n.id).health >> 2) + ns(st, n.id).status).join('|') + '|' + S.redTarget, () => {
      $('#redTargets').innerHTML = D.NODES.filter(n => n.id !== 'INET').map(n => {
        const s = ns(st, n.id);
        return `<div class="tg ${S.redTarget === n.id ? 'on' : ''}" data-act="red-target" data-node="${n.id}" title="${esc(n.desc)}">
          <span class="tip">${n.id}</span><span class="tnm">${esc(n.nama)}</span>
          <span class="tip st-${s.status}">${s.health}% ${s.status.toUpperCase()}</span></div>`;
      }).join('');
    });

    const sigArsenal = D.ATTACKS.map(a => {
      const running = st.active.some(x => x.attackId === a.id);
      const ready = !running && st.phase === 'running' && E().canLaunch(st, a).ok;
      return a.id + (running ? 'R' : ready ? 'Y' : 'N') + (st.red.techs.includes(a.id) ? 'D' : '');
    }).join('|') + '|' + st.phase + '|' + JSON.stringify(Object.keys(st.nodes).map(k => st.nodes[k].health > 0));

    sig('arsenal', sigArsenal, () => {
      const nodeOpts = (def) => D.NODES.filter(n => n.id !== 'INET').map(n => `<option value="${n.id}"${n.id === def ? ' selected' : ''}>${n.id}</option>`).join('');
      $('#arsenal').innerHTML = D.ATTACKS.map(a => {
        const running = st.active.some(x => x.attackId === a.id);
        const ready = !running && st.phase === 'running' && E().canLaunch(st, a).ok;
        const lock = a.butuh.map(r => r === 'recon' ? 'butuh RECON' : r === 'foothold' ? 'butuh FOOTHOLD' : 'butuh ROOT').join(', ');
        const done = st.red.techs.includes(a.id);
        const chosen = window.App && window.App.targetOf ? window.App.targetOf(a.id) : a.target;
        return `<div class="ar ${running ? 'running' : (ready ? 'ready' : 'locked')}">
          <div class="ar-h"><span class="ar-t">${esc(a.tech)}</span><span class="ar-n">${esc(a.nama)}</span>${done ? '<span class="pill pill-sukses">✔</span>' : ''}</div>
          <div class="ar-d">${esc(a.ringkas)}</div>
          <div class="ar-f">
            <span class="tag">${esc(a.tactic)}</span><span class="tag">fase ${a.fase}</span>
            ${a.flag ? '<span class="tag">🚩 flag</span>' : ''}${a.exfil ? `<span class="tag">${a.exfil} MB</span>` : ''}
            ${a.grants ? `<span class="tag">+${esc(a.grants)}</span>` : ''}
            ${running ? '<span class="tag" style="color:#ff8c42">⏳ BERJALAN…</span>' : ''}
          </div>
          <div class="ar-f" style="margin-top:6px">
            <select class="ar-tgt" data-id="${a.id}" title="Target server">${nodeOpts(chosen || a.target)}</select>
            <button class="btn btn-mini btn-red" data-act="attack" data-id="${a.id}" ${ready ? '' : 'disabled'}>${running ? '⏳ berjalan' : '🚀 Luncurkan'}</button>
            <button class="btn btn-mini btn-ghost" data-act="man" data-id="${a.id}">man</button>
          </div>
          ${!ready && !running ? `<div class="hint" style="margin:4px 0 0">🔒 ${esc(lock) || 'menunggu sesi berjalan'}</div>` : ''}
        </div>`;
      }).join('');
    });

    $('#redLoot').innerHTML = `
      <div class="lt">foothold : <b>${st.red.access.foothold ? '✔ DIPEROLEH' : '✖ belum'}</b></div>
      <div class="lt">root : <b>${st.red.access.root ? '✔ DIPEROLEH' : '✖ belum'}</b></div>
      <div class="lt">ransomware : <b>${st.red.ransomActive ? '✔ AKTIF' : '✖ tidak'}</b></div>
      <div class="lt">fase kill-chain : <b>${st.red.maxPhase} / 5</b></div>
      <div class="lt">data bocor : <b>${st.red.exfilMB} MB</b> / ${D.TARGET_EXFIL} MB</div>
      ${st.red.flags.map(f => `<div class="lt">🚩 <b>${esc(f)}</b></div>`).join('') || '<div class="lt">🚩 belum ada flag diraih</div>'}`;
  }

  /* ================= TERMINAL ================= */
  function termPush(html, cls) {
    const out = $('#termOut'); if (!out) return;
    const line = document.createElement('div');
    line.className = 't-line ' + (cls || '');
    line.innerHTML = html;
    out.appendChild(line);
    while (out.childElementCount > 800) out.removeChild(out.firstChild);
    out.scrollTop = out.scrollHeight;
  }
  function termClear() { const o = $('#termOut'); if (o) o.innerHTML = ''; }

  function termBanner(st) {
    termClear();
    termPush(`<span class="t-ascii">
 ███████╗███╗   ███╗ █████╗ ██████╗ ██╗      █████╗
 ██╔════╝████╗ ████║██╔══██╗██╔══██╗██║     ██╔══██╗
 ███████╗██╔████╔██║███████║██████╔╝██║     ███████║
 ╚════██║██║╚██╔╝██║██╔══██║██╔══██╗██║     ██╔══██║
 ███████║██║ ╚═╝ ██║██║  ██║██║  ██║███████╗██║  ██║
 ╚══════╝╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝</span>`);
    termPush(`<span class="t-dim">Kali Linux 2026.1 rolling • Red Team Operation Console • ${esc(D.PENGUJI.aplikasi)}</span>`);
    if (st) termPush(`<span class="t-dim">Sesi: ${esc(st.cfg.kategori)} • Room ${esc(st.room)} • lingkungan target: SMITT Tobelo</span>`);
    termPush(`<span class="t-warn">PERINGATAN: hanya untuk laboratorium sekolah. Menyerang sistem nyata melanggar UU No.11/2008 (ITE) pasal 30 &amp; 32.</span>`);
    termPush(`<span class="t-info">Ketik <span class="t-ok">help</span> untuk daftar perintah, atau gunakan panel Arsenal di sisi kanan.</span>`);
    termPush('');
  }

  function termSync(st) {
    if (!termStarted) { termStarted = true; termBanner(st); }
    (st.events || []).forEach(e => {
      if (e.id <= termSeenEvent) return;
      termSeenEvent = e.id;
      const cls = { serangan: 't-err', kritis: 't-err', mitigasi: 't-warn', flag: 't-flag', salah: 't-warn', triase: 't-info', selesai: 't-ok', mulai: 't-ok' }[e.kind] || 't-dim';
      termPush(`<span class="t-dim">[T+${mmss(e.rel)}]</span> <span class="${cls}">${esc(e.text)}</span>`);
    });
  }

  /* ================= TOPOLOGI ================= */
  const ICON = { cloud: '🌐', firewall: '🛡️', web: '🖥️', dns: '🧭', db: '🗄️', ad: '🗂️', client: '💻' };
  const STCOLOR = { online: '#3ddc84', degraded: '#f6c445', critical: '#ff8c42', offline: '#ff4d6d', ransom: '#ff2d78', quarantine: '#a78bfa', unknown: '#5d7192' };

  function renderTopo(st) {
    const box = $('#topoSvg'); if (!box) return;
    const pos = {}; D.NODES.forEach(n => { pos[n.id] = n; });
    const hot = new Set(st.active.map(a => a.target));

    const links = D.LINKS.map(([a, b]) => {
      const p1 = pos[a], p2 = pos[b];
      const h = hot.has(a) || hot.has(b);
      return `<line class="tlink ${h ? 'hot' : ''}" x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}"/>`;
    }).join('');

    const nodes = D.NODES.map(n => {
      const s = ns(st, n.id);
      const col = STCOLOR[s.status] || STCOLOR.unknown;
      return `<g class="tnode${S.selNode === n.id ? ' sel' : ''}" data-act="sel-node" data-node="${n.id}" transform="translate(${n.x},${n.y})">
        <circle r="30" fill="#0c1424" stroke="${col}" stroke-width="2.5"/>
        <circle r="38" fill="none" stroke="${col}" stroke-width="1" opacity="${s.status === 'online' ? 0.16 : 0.55}"/>
        <text y="8" text-anchor="middle" font-size="22">${ICON[n.tipe] || '📦'}</text>
        <text class="tlabel" y="54">${esc(n.id)}</text>
        <text class="tsub" y="67">${esc(n.nama)}</text>
        <text class="tsub" y="80" fill="${col}">${s.health}% • ${s.status.toUpperCase()}</text>
        <rect x="-26" y="86" width="52" height="5" rx="2.5" fill="#131e33"/>
        <rect x="-26" y="86" width="${(52 * s.health / 100).toFixed(1)}" height="5" rx="2.5" fill="${col}"/>
      </g>`;
    }).join('');

    box.innerHTML = `<svg viewBox="0 0 880 450" xmlns="http://www.w3.org/2000/svg">${links}${nodes}</svg>`;

    $('#healthBars').innerHTML = D.NODES.filter(n => n.id !== 'INET').map(n => {
      const s = ns(st, n.id);
      return `<div class="hbar"><div class="hb-h"><span>${esc(n.id)} • ${esc(n.nama)}</span><span class="st-${s.status}">${s.health}% ${s.status.toUpperCase()}</span></div>
        <div class="hb-t"><i style="width:${s.health}%;background:${STCOLOR[s.status]}"></i></div></div>`;
    }).join('');

    if (S.selNode) {
      const n = D.NODES.find(x => x.id === S.selNode);
      const s = ns(st, n.id);
      const threats = st.active.filter(a => a.target === n.id);
      const mits = st.mitig.filter(m => m.node === n.id || m.node === '*');
      $('#nodeDetail').innerHTML = `
        <div class="nd-row"><span>Nama node</span><b>${esc(n.nama)}</b></div>
        <div class="nd-row"><span>Alamat IP</span><b>${esc(n.ip)}</b></div>
        <div class="nd-row"><span>Fungsi</span><b style="text-align:right;max-width:190px">${esc(n.desc)}</b></div>
        <div class="nd-row"><span>Kritis untuk SLA</span><b>${n.critical ? 'YA' : 'tidak'}</b></div>
        <div class="nd-row"><span>Kesehatan</span><b class="st-${s.status}">${s.health}% • ${s.status.toUpperCase()}</b></div>
        <div class="nd-row"><span>Serangan berjalan</span><b style="text-align:right;max-width:190px">${threats.length ? esc(threats.map(t => t.nama).join(', ')) : 'tidak ada'}</b></div>
        <div class="nd-row"><span>Kebijakan mitigasi</span><b>${mits.length}</b></div>
        <div class="row" style="margin-top:8px;flex-wrap:wrap">
          <button class="btn btn-mini btn-blue" data-act="playbook-node" data-pb="quarantine" data-node="${n.id}">🧪 Karantina</button>
          <button class="btn btn-mini btn-blue" data-act="playbook-node" data-pb="restore" data-node="${n.id}">♻ Restore</button>
          <button class="btn btn-mini btn-blue" data-act="playbook-node" data-pb="waf" data-node="${n.id}">🧱 WAF</button>
          <button class="btn btn-mini btn-blue" data-act="playbook-node" data-pb="backdoor" data-node="${n.id}">🧹 Backdoor Killer</button>
        </div>`;
    } else {
      $('#nodeDetail').innerHTML = `<p class="hint">Klik salah satu node pada peta untuk melihat detail dan aksi cepat mitigasi.</p>`;
    }
  }

  /* ================= INSIDEN ================= */
  function renderInsiden(st) {
    const tb = $('#attackTable tbody'); if (!tb) return;
    const rows = st.attacks.slice().reverse();
    tb.innerHTML = rows.length ? rows.map((a, i) => `
      <tr>
        <td>${rows.length - i}</td>
        <td style="font-family:var(--mono)">T+${mmss(a.startRel)}</td>
        <td><span style="color:#a78bfa;font-family:var(--mono);font-size:10.5px">${esc(a.tech)}</span><br><span style="color:#8fa3c0">${esc(a.tactic)}</span></td>
        <td>${esc(a.nama)}</td>
        <td style="font-family:var(--mono);font-size:11px">${esc(a.ip)}</td>
        <td>${esc(a.target)}</td>
        <td><span class="pill pill-${esc(a.status)}">${esc(a.status.toUpperCase())}</span></td>
        <td>${a.detected === true ? `<span style="color:#3ddc84">${a.detectDelay != null ? a.detectDelay.toFixed(0) + 's' : '✔'}</span>` : a.detected === 'missed' ? '<span style="color:#ff4d6d">TERLEWAT</span>' : '<span style="color:#f6c445">menunggu</span>'}</td>
        <td>${a.mitigatedBy ? `<span class="pill pill-diblokir">${esc(D.PLAYBOOK_MAP[a.mitigatedBy].kode)}</span>` : '-'}</td>
      </tr>`).join('')
      : `<tr><td colspan="9" style="text-align:center;color:#5d7192;padding:22px">Belum ada serangan tercatat.</td></tr>`;

    $('#eventFeed').innerHTML = st.events.length ? st.events.slice().reverse().map(e =>
      `<div class="ev k-${esc(e.kind)}"><span class="ev-t">T+${mmss(e.rel)}</span>${esc(e.text)}</div>`).join('')
      : `<p class="hint">Belum ada event.</p>`;
  }

  /* ================= GURU ================= */
  function renderGuru(st, prs, host) {
    const gc = $('#guruClock');
    if (gc) gc.innerHTML =
      `Status: <b>${esc(st.phase.toUpperCase())}</b> • Berjalan: <b>${mmss(st.clock.elapsed)}</b> • Sisa: <b>${mmss(st.clock.remaining)}</b> / ${mmss(st.clock.total)}<br>
       SLA: <b>${(st.blue.sla || 0).toFixed(2)}%</b> • Serangan: <b>${st.red.launched}</b> • Diblokir: <b>${st.blue.mitigated}</b> • Flag: <b>${st.red.flags.length}</b> • Bocor: <b>${Math.round(st.red.exfilMB)} MB</b><br>
       Host: <b>${esc(host || '-')}</b> • Peserta: <b>${prs ? prs.length : 0}</b>`;

    const rb = $('#gRedBot'), bn = $('#gBenign');
    if (rb && rb.checked !== !!st.cfg.redBot) rb.checked = !!st.cfg.redBot;
    if (bn && bn.checked !== !!st.cfg.benign) bn.checked = !!st.cfg.benign;
    const gn = $('#guruNote');
    if (gn && document.activeElement !== gn) gn.value = st.guruNote || '';

    const gp = $('#guruPeers');
    if (gp && prs) gp.innerHTML = prs.map(p => `<div class="peer"><span class="dot"></span><span class="nm">${esc(p.name)}</span>
      ${p.id === host ? '<span class="host-tag">HOST</span>' : ''}<span class="rl rl-${p.role}">${labelRole(p.role)}</span></div>`).join('') || '<p class="hint">Belum ada peserta.</p>';
  }

  function renderAssess(st) {
    if (!S.pinOk) return;
    const body = $('#assessContent'); if (!body) return;
    body.innerHTML = R.assessSheet(st);
    const kk = D.KKM[st.cfg.kelas];
    $('#assessMeta').textContent = `${st.cfg.kategori} • ${kk.label} • KKM ${kk.kkm} • ${st.cfg.durasiMenit} menit • Room ${st.room}`;
    const br = $('#btnReveal');
    br.textContent = st.revealed ? '🔒 Sembunyikan Skor dari Murid' : '📢 Umumkan Skor ke Murid';
    br.className = 'btn ' + (st.revealed ? 'btn-ghost' : 'btn-primary');
  }

  function renderArsip(st) {
    const b = $('#beritaAcara'); if (b) b.innerHTML = R.beritaAcara(st);
  }

  /* ================= MASTER ================= */
  function renderSim(state, prs, host) {
    if (!state) return;
    renderRibbon(state);
    const tab = S.activeTab || (S.role === 'guru' ? 'guru' : S.role === 'blue' ? 'siem' : S.role === 'red' ? 'red' : 'dual');
    setTab(tab, S.role, S.isHost);
    const dual = S.activeTab === 'dual';

    if (S.activeTab === 'siem' || dual) renderLogs(state);
    if (S.activeTab === 'soar') renderSoar(state);
    if (S.activeTab === 'red' || dual) { renderRed(state); termSync(state); }
    if (S.activeTab === 'topo') renderTopo(state);
    if (S.activeTab === 'insiden') renderInsiden(state);
    if (S.activeTab === 'guru') { renderGuru(state, prs, host); renderAssess(state); }
    if (S.activeTab === 'arsip') renderArsip(state);
    if (S.activeTab !== 'guru' && (S.isHost || S.role === 'guru')) renderGuru(state, prs, host);
  }

  /* ================= INIT ================= */
  function init() {
    $('#guideBody').innerHTML = window.Guide.html;
    populateSetup();
    $('#inJumlah').addEventListener('change', () => buildMembers());
    $('#inKelas').addEventListener('change', refreshKkm);
    $('#sevFilter').addEventListener('click', (e) => {
      const b = e.target.closest('.chip'); if (!b) return;
      $$('#sevFilter .chip').forEach(c => c.classList.remove('on'));
      b.classList.add('on'); S.sevFilter = b.dataset.sev;
      if (window.App.state) renderLogs(window.App.state);
    });
    let sT;
    $('#siemSearch').addEventListener('input', (e) => {
      clearTimeout(sT); const v = e.target.value;
      sT = setTimeout(() => { S.search = v; if (window.App.state) renderLogs(window.App.state); }, 150);
    });
    $('#siemAuto').addEventListener('change', (e) => { S.autoScroll = e.target.checked; });
  }

  return {
    init, $, $$, esc, screen, toast, modal, closeModal, setTab, buildTabs, tabList,
    populateSetup, buildMembers, collectMembers, refreshKkm,
    renderLobby, renderSim, renderLogs, renderSoar, renderRed, renderTopo, renderGuru,
    renderAssess, renderArsip, buildPlaybooks, termPush, termClear, termBanner, termSync,
    mmss, labelRole, ns, S, clearSig,
    resetTerm() { termStarted = false; termSeenEvent = 0; clearSig(); }
  };
})();
