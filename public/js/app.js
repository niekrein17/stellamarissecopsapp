'use strict';
/* Stella Maris SecOps App - app.js : wiring, host loop, aksi, terminal interaktif */
window.App = (function () {
  const D = window.SMData;
  const UI = window.UI;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  let st = null;            // state (lengkap di host, salinan di client)
  let peers = [];
  let hostId = '';
  let loopTimer = null;
  let docNum = window.Engine.docNumber();
  const cmdHistory = [];
  let histIdx = -1;
  const targetByAttack = {};

  const isHost = () => window.Net.isHost;

  /* ============ STATE & SYNC ============ */
  function setState(s) {
    const prevPhase = st ? st.phase : null;
    const first = !st;
    st = s;
    if (first && s.phase === 'running') UI.resetTerm();
    render();
    if (s.phase === 'ended' && prevPhase !== 'ended' && !endedAnnounced) announceEnd();
  }

  function broadcast() {
    if (!isHost() || !st) return;
    window.Net.send({ t: 'state', s: st });
  }

  function act(action) {
    if (!st) { UI.toast('Sesi belum siap.', 'err'); return null; }
    if (isHost()) {
      const res = window.Engine.applyAction(st, action);
      if (res && res.reset) { resetSession(); return res; }
      if (res && !res.ok && res.why) UI.toast(res.why, 'warn');
      render(); broadcast();
      return res;
    }
    window.Net.send({ t: 'action', a: action });
    return { ok: true, pending: true };
  }

  function startLoop() {
    if (loopTimer) return;
    loopTimer = setInterval(() => {
      if (!isHost() || !st) return;
      const before = st.clock.elapsed;
      window.Engine.tick(st);
      if (st.clock.elapsed !== before || st.phase === 'ended') { render(); broadcast(); }
      if (st.phase === 'ended' && !endedAnnounced) announceEnd();
    }, 1000);
  }

  let endedAnnounced = false;
  function announceEnd() {
    endedAnnounced = true;
    UI.toast('🏁 Waktu habis — sesi dikunci dan nilai akhir dihitung.', 'ok');
    if (!st.revealed) UI.toast('🔒 Skor masih dirahasiakan dari murid. Buka lewat Konsol Guru (PIN 1234).', 'warn');
    if (isHost() || UI.S.role === 'guru') UI.setTab('guru', UI.S.role, isHost());
  }

  function render() {
    if (!st) return;
    if (st.phase === 'setup') {
      UI.screen('lobby');
      UI.renderLobby(peers, hostId, st, st.room);
    } else {
      if ($('#scr-sim').classList.contains('active') === false) {
        UI.screen('sim');
        UI.buildPlaybooks();
        UI.resetTerm();
        endedAnnounced = st.phase === 'ended';
      }
      UI.renderSim(st, peers, hostId);
    }
  }

  function resetSession() {
    const keep = st ? { room: st.room, cfg: st.cfg, teams: st.teams, penguji: st.penguji } : null;
    st = window.Engine.newState({ room: keep ? keep.room : $('#inRoom').value });
    if (keep) { Object.assign(st.cfg, keep.cfg); Object.assign(st.teams, keep.teams); Object.assign(st.penguji, keep.penguji); }
    st.cfg.docNumber = window.Engine.docNumber();
    st.clock.total = st.cfg.durasiMenit * 60;
    st.clock.remaining = st.clock.total;
    endedAnnounced = false;
    UI.resetTerm();
    UI.screen('lobby');
    render(); broadcast();
    UI.toast('Sesi direset. Pengaturan & identitas tim dipertahankan.', 'ok');
  }

  /* ============ SETUP → ROOM ============ */
  function collectCfg() {
    const n = Number($('#inJumlah').value) || 3;
    return {
      kategori: $('#inKategori').value,
      durasiMenit: Number($('#inDurasi').value) || 15,
      jumlahAnggota: n,
      kelas: $('#inKelas').value,
      mapel: $('#inMapel').value || 'Dasar Keamanan Informasi / TJKT',
      tanggal: $('#inTanggal').value || new Date().toISOString().slice(0, 10),
      docNumber: docNum,
      redBot: $('#inRedBot').checked,
      benign: $('#inBenign').checked
    };
  }
  function collectTeams() {
    return {
      blue: { nama: $('#inBlueTeam').value, anggota: UI.collectMembers('blue') },
      red: { nama: $('#inRedTeam').value, anggota: UI.collectMembers('red') }
    };
  }

  function createRoom() {
    const role = $('#inMyRole').value;
    const name = ($('#inMyName').value || '').trim() || 'Guru Penguji';
    const room = ($('#inRoom').value || '').toUpperCase().trim() || window.Engine.roomCode();
    $('#inRoom').value = room;

    st = window.Engine.newState({ room });
    Object.assign(st.cfg, collectCfg());
    st.teams = collectTeams();
    const prof = window.SuperAdmin ? window.SuperAdmin.pengujiForSession() : {};
    st.penguji = {
      nama: $('#inPenguji').value || prof.nama || D.PENGUJI.nama,
      alias: prof.alias || D.PENGUJI.alias,
      institusi: $('#inInstitusi').value || prof.institusi || D.PENGUJI.institusi,
      yayasan: prof.yayasan || D.PENGUJI.yayasan,
      alamat: prof.alamat || D.PENGUJI.alamat,
      kota: prof.kota || D.PENGUJI.kota,
      pengawas: $('#inPengawas') ? ($('#inPengawas').value || prof.pengawas || '') : (prof.pengawas || ''),
      aplikasi: D.PENGUJI.aplikasi,
      pin: D.PENGUJI.pin
    };
    st.cfg.tujuan = (window.SuperAdmin ? window.SuperAdmin.load().tujuan : '') || D.TUJUAN_PEMBELAJARAN.join('\n');
    st.clock.total = st.cfg.durasiMenit * 60;
    st.clock.remaining = st.clock.total;

    UI.S.role = role; UI.S.isHost = true;
    window.Net.init(netHandlers);
    window.Net.join(room, name, role);
    UI.screen('lobby');
    render();
    startLoop();
    UI.toast(`Ruang <b>${room}</b> dibuat. Bagikan Room ID ini ke peserta.`, 'ok');
  }

  function joinRoom() {
    const role = $('#inMyRole').value;
    const name = ($('#inMyName').value || '').trim() || 'Peserta';
    const room = ($('#inRoom').value || '').toUpperCase().trim();
    if (!room) { UI.toast('Isi Room ID yang dibagikan Guru.', 'err'); return; }
    UI.S.role = role;
    window.Net.init(netHandlers);
    window.Net.join(room, name, role);
    UI.screen('lobby');
    UI.toast(`Mencoba bergabung ke ruang <b>${room}</b>…`, 'ok');
    setTimeout(() => window.Net.send({ t: 'reqstate' }), 250);
    setTimeout(() => window.Net.send({ t: 'reqstate' }), 1200);
  }

  /* ============ NET HANDLERS ============ */
  const netHandlers = {
    onStatus(info) {
      const b = $('#netBadge');
      const txt = { ws: '● relay tersambung', bc: '● mode lokal', offline: '● offline' }[info.mode] || '● offline';
      b.textContent = txt + (info.room ? ' • ' + info.room : '');
      b.className = 'badge ' + (info.mode === 'ws' ? 'badge-on' : info.mode === 'bc' ? 'badge-bc' : 'badge-off');
      UI.S.isHost = info.isHost;
      if (info.mode === 'offline' && !info.detail.includes('ulang')) { /* menunggu */ }
    },
    onPeers(list, host) {
      peers = list || []; hostId = host || '';
      const wasHost = UI.S.isHost;
      UI.S.isHost = window.Net.isHost;
      if (UI.S.isHost && !wasHost) { startLoop(); UI.toast('Anda mengambil alih peran HOST.', 'warn'); }
      if (isHost() && st) broadcast();
      render();
    },
    onMessage(m) {
      if (!m) return;
      if (m.t === 'state') { setState(m.s); return; }
      if (m.t === 'action') {
        if (!isHost() || !st) return;
        const res = window.Engine.applyAction(st, m.a);
        if (res && res.reset) { resetSession(); return; }
        render(); broadcast();
        return;
      }
      if (m.t === 'reqstate') { if (isHost()) broadcast(); return; }
      if (m.t === 'sys') { UI.toast('ℹ️ ' + UI.esc(m.text), ''); return; }
      if (m.t === 'joined') { /* ditangani onPeers */ }
    }
  };

  /* ============ TERMINAL RED ============ */
  function termRun(raw) {
    const line = raw.trim();
    if (!line) return;
    cmdHistory.unshift(line); histIdx = -1;
    UI.termPush(`<span class="t-dim">root@kali</span>:<span class="t-info">~</span><span class="t-dim">#</span> <span class="t-cmd">${UI.esc(line)}</span>`);
    if (!st) { UI.termPush('<span class="t-err">Sesi belum dimulai.</span>', 't-err'); return; }
    const [cmd, ...args] = line.split(/\s+/);
    const a0 = (args[0] || '').toLowerCase();

    switch (cmd.toLowerCase()) {
      case 'help': case '?':
        UI.termPush(`<span class="t-ok">PERINTAH TERSEDIA</span>
  <span class="t-cmd">help</span>                  daftar perintah ini
  <span class="t-cmd">whoami | id | uname</span>   konteks shell penyerang
  <span class="t-cmd">ifconfig | ip a</span>       antarmuka & IP sumber
  <span class="t-cmd">targets</span>               daftar server target + status kesehatan
  <span class="t-cmd">use &lt;NODE&gt;</span>            pilih target fokus (cth: use DB-01)
  <span class="t-cmd">arsenal | ls</span>          8 vektor MITRE ATT&CK + status kesiapan
  <span class="t-cmd">man &lt;vektor&gt;</span>          detail satu vektor (cth: man ransom)
  <span class="t-cmd">scan</span>                  jalan pintas: Reconnaissance (T1595)
  <span class="t-cmd">run &lt;vektor&gt; [target]</span> luncurkan serangan (cth: run sqli WEB-01)
  <span class="t-cmd">ip &lt;alamat&gt;</span>           ganti IP sumber serangan
  <span class="t-cmd">proxy on|off|list</span>     rantai proxy — IP berotasi tiap serangan
  <span class="t-cmd">access | flags | exfil</span> status foothold/root, flag CTF, data bocor
  <span class="t-cmd">sitrep</span>                ringkasan kondisi medan
  <span class="t-cmd">history | clear</span>       riwayat perintah / bersihkan layar`, 't-info');
        break;
      case 'whoami': UI.termPush('root', 't-ok'); break;
      case 'id': UI.termPush('uid=0(root) gid=0(root) groups=0(root),1000(kali) context=unconfined', 't-ok'); break;
      case 'uname': UI.termPush('Linux kali 6.8.0-smitt #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux', 't-info'); break;
      case 'date': UI.termPush(new Date().toString(), 't-info'); break;
      case 'ifconfig': case 'ip':
        if (cmd.toLowerCase() === 'ip' && args.length && a0 !== 'a') {
          if (!D.RED_IPS.includes(args[0])) { UI.termPush(`IP tidak tersedia. Pilih: ${D.RED_IPS.join(', ')}`, 't-err'); break; }
          act({ type: 'redip', ip: args[0] });
          UI.termPush(`IP sumber diubah ke <span class="t-ok">${UI.esc(args[0])}</span> (proxy dimatikan).`, 't-ok');
          break;
        }
        UI.termPush(`eth0: flags=4163<UP,BROADCAST,RUNNING>  mtu 1500
        inet <span class="t-ok">${UI.esc(st.red.ip)}</span>  netmask 255.255.255.0  broadcast ${UI.esc(st.red.ip.replace(/\.\d+$/, '.255'))}
        ether de:ad:be:ef:${UI.esc(String(st.red.launched).padStart(2, '0'))}:13  txqueuelen 1000
        RX packets ${12000 + st.red.launched * 340}  bytes ${9800000 + st.red.exfilMB * 1024}
proxy-chain : <span class="${st.red.proxy ? 't-flag' : 't-dim'}">${st.red.proxy ? 'ON  (' + UI.esc(st.red.proxyNode) + ')' : 'OFF (direct)'}</span>`, 't-info');
        break;
      case 'targets': {
        UI.termPush('<span class="t-ok">DAFTAR TARGET SERVER</span>');
        D.NODES.filter(n => n.id !== 'INET').forEach(n => {
          const ns = UI.ns(st, n.id);
          const mark = UI.S.redTarget === n.id ? '<span class="t-flag">*</span>' : ' ';
          UI.termPush(` ${mark} <span class="t-cmd">${n.id.padEnd(7)}</span> ${UI.esc(n.nama).padEnd(20)} ${UI.esc(n.ip).padEnd(15)} <span class="${ns.health > 79 ? 't-ok' : ns.health > 39 ? 't-warn' : 't-err'}">${String(ns.health).padStart(3)}% ${ns.status.toUpperCase()}</span>`);
        });
        UI.termPush('<span class="t-dim">gunakan: use &lt;NODE&gt;  |  * = target fokus aktif</span>', 't-dim');
        break;
      }
      case 'use': {
        const id = (args[0] || '').toUpperCase();
        if (!D.NODES.some(n => n.id === id)) { UI.termPush(`Target '${UI.esc(args[0] || '')}' tidak dikenal.`, 't-err'); break; }
        UI.S.redTarget = id;
        UI.termPush(`Target fokus diatur ke <span class="t-ok">${id}</span>.`, 't-ok');
        render();
        break;
      }
      case 'arsenal': case 'ls': {
        UI.termPush('<span class="t-ok">MITRE ATT&amp;CK ARSENAL</span>');
        D.ATTACKS.forEach(a => {
          const chk = window.Engine.canLaunch(st, a);
          const done = st.red.techs.includes(a.id);
          UI.termPush(` <span class="${chk.ok ? 't-ok' : 't-dim'}">${chk.ok ? '[SIAP] ' : '[KUNCI]'}</span> <span class="t-cmd">${a.id.padEnd(9)}</span> <span class="t-flag">${a.tech.padEnd(10)}</span> ${UI.esc(a.nama)}${done ? ' <span class="t-ok">✔</span>' : ''}${chk.ok ? '' : ' <span class="t-dim">— ' + UI.esc(chk.why) + '</span>'}`);
        });
        break;
      }
      case 'man': {
        const a = D.ATTACK_MAP[a0];
        if (!a) { UI.termPush(`Vektor '${UI.esc(a0)}' tidak dikenal. Coba: arsenal`, 't-err'); break; }
        UI.termPush(`<span class="t-ok">${a.tech} — ${UI.esc(a.nama)}</span>
  Taktik     : ${UI.esc(a.tactic)}   Fase kill-chain: ${a.fase}/5
  Target     : ${a.target}
  Prasyarat  : ${a.butuh.length ? a.butuh.join(', ') : 'tidak ada'}
  Durasi     : ${a.durasi} detik   Peluang dasar: ${Math.round(a.sukses * 100)}%
  Dampak     : ${Object.keys(a.damage || {}).map(k => k + ' -' + a.damage[k]).join(', ') || 'tidak merusak'}
  Hadiah     : ${a.flag ? '🚩 ' + a.flag : '-'}${a.exfil ? ' • ' + a.exfil + ' MB data' : ''}${a.grants ? ' • akses ' + a.grants : ''}
  Penangkal  : ${a.mit.map(m => D.PLAYBOOK_MAP[m].kode + ' ' + D.PLAYBOOK_MAP[m].nama).join(' | ')}
  <span class="t-dim">${UI.esc(a.ringkas)}</span>`, 't-info');
        break;
      }
      case 'scan': doAttack('recon'); break;
      case 'run': case 'attack': case 'exploit': {
        if (!a0) { UI.termPush('Pemakaian: run &lt;vektor&gt; [target]   cth: run sqli WEB-01', 't-err'); break; }
        doAttack(a0, (args[1] || '').toUpperCase() || null);
        break;
      }
      case 'proxy': {
        if (a0 === 'on') { act({ type: 'proxy', on: true, node: D.PROXY_POOL[Math.floor(Math.random() * D.PROXY_POOL.length)] }); UI.termPush('Proxy chain <span class="t-flag">AKTIF</span> — IP sumber berotasi setiap serangan. Blacklist IP Blue jadi kurang efektif.', 't-warn'); }
        else if (a0 === 'off') { act({ type: 'proxy', on: false }); UI.termPush('Proxy chain <span class="t-ok">NONAKTIF</span> — menyerang dari IP asli (lebih cepat, lebih mudah dilacak).', 't-ok'); }
        else { UI.termPush('Node proxy tersedia:\n  ' + D.PROXY_POOL.map((p, i) => `${i + 1}. ${p}`).join('\n  ') + `\n  aktif: <span class="t-flag">${UI.esc(st.red.proxyNode)}</span>`, 't-info'); }
        render();
        break;
      }
      case 'access':
        UI.termPush(`foothold : ${st.red.access.foothold ? '<span class="t-ok">✔ DIPEROLEH</span>' : '<span class="t-err">✖ belum</span>'}
root     : ${st.red.access.root ? '<span class="t-ok">✔ DIPEROLEH</span>' : '<span class="t-err">✖ belum</span>'}
ransom   : ${st.red.ransomActive ? '<span class="t-flag">✔ aktif</span>' : 'tidak'}
fase     : ${st.red.maxPhase}/5`, 't-info');
        break;
      case 'flags':
        UI.termPush(st.red.flags.length ? st.red.flags.map(f => `<span class="t-flag">🚩 ${UI.esc(f)}</span>`).join('\n') : '<span class="t-dim">Belum ada flag diraih.</span>');
        UI.termPush(`<span class="t-dim">total ${st.red.flags.length}/${D.TOTAL_FLAGS}</span>`, 't-dim');
        break;
      case 'exfil':
        UI.termPush(`Volume data dibocorkan: <span class="t-flag">${Math.round(st.red.exfilMB)} MB</span> dari target acuan ${D.TARGET_EXFIL} MB (${Math.round(st.red.exfilMB / D.TARGET_EXFIL * 100)}%).`, 't-info');
        break;
      case 'sitrep': {
        UI.termPush(`<span class="t-ok">SITUATION REPORT</span>
  Sesi        : ${UI.esc(st.cfg.kategori)} • ${UI.esc(D.KKM[st.cfg.kelas].label)}
  Waktu       : T+${UI.mmss(st.clock.elapsed)} / ${UI.mmss(st.clock.total)} (sisa ${UI.mmss(st.clock.remaining)})
  Status      : ${st.phase.toUpperCase()}
  Diluncurkan : ${st.red.launched}  • sukses ${st.red.success}  • gagal ${st.red.failed}  • diblokir Blue ${st.red.blocked}
  SLA Blue    : ${(st.blue.sla || 0).toFixed(2)}%   (target Blue = 100%)
  Mitigasi    : ${st.mitig.length} kebijakan aktif
  Teknik      : ${st.red.techs.length}/${D.TOTAL_TECH} tercakup`, 't-info');
        break;
      }
      case 'history':
        UI.termPush(cmdHistory.slice(0, 20).reverse().map((c, i) => ` ${String(i + 1).padStart(3)}  ${UI.esc(c)}`).join('\n') || '<span class="t-dim">kosong</span>', 't-info');
        break;
      case 'clear': case 'cls': UI.termClear(); UI.termBanner(st); break;
      case 'nmap': {
        const tgt = (args[0] || '').toUpperCase();
        const n = D.NODES.find(x => x.id === tgt || x.ip === args[0]);
        if (!n) { UI.termPush('Pemakaian: nmap &lt;NODE|IP&gt;', 't-err'); break; }
        UI.termPush(`Starting Nmap 7.95 ( https://nmap.org )
Nmap scan report for ${UI.esc(n.nama.toLowerCase().replace(/\s+/g, '-'))}.smitt.sch.id (${UI.esc(n.ip)})
PORT     STATE  SERVICE        VERSION
22/tcp   open   ssh            OpenSSH 8.9p1
80/tcp   open   http           Apache httpd 2.4.58
443/tcp  open   ssl/http       Apache httpd 2.4.58
3306/tcp ${n.tipe === 'db' ? 'open' : 'filtered'}   mysql          MariaDB 10.11
445/tcp  ${n.tipe === 'ad' ? 'open' : 'closed'}   microsoft-ds   Samba smbd 4.17
Service detection completed. <span class="t-warn">${n.critical ? 'Host bersifat KRITIS untuk SLA.' : 'Host non-kritis.'}</span>`, 't-info');
        break;
      }
      case 'exit': case 'logout':
        UI.termPush('Menutup sesi Red…', 't-dim');
        setTimeout(doLogout, 400);
        break;
      case 'sudo': UI.termPush('root@kali sudah memiliki privilese penuh. Langsung pakai <span class="t-cmd">run</span>.', 't-warn'); break;
      case 'mitre': UI.termPush(`Kerangka: MITRE ATT&CK Enterprise. ${D.TOTAL_TECH} teknik tersedia pada simulator ini. Ketik <span class="t-cmd">arsenal</span>.`, 't-info'); break;
      default:
        UI.termPush(`<span class="t-err">bash: ${UI.esc(cmd)}: perintah tidak ditemukan.</span> Ketik <span class="t-cmd">help</span>.`, 't-err');
    }
  }

  function doAttack(id, targetOverride) {
    const a = D.ATTACK_MAP[String(id || '').toLowerCase()];
    if (!a) { UI.termPush(`Vektor '${UI.esc(id || '')}' tidak dikenal. Ketik <span class="t-cmd">arsenal</span>.`, 't-err'); return; }
    const tgt = targetOverride || targetByAttack[a.id] || a.target;
    const chk = window.Engine.canLaunch(st, a);
    if (!chk.ok && !isHost()) { UI.termPush('<span class="t-err">' + UI.esc(chk.why) + '</span>', 't-err'); return; }
    UI.termPush(`<span class="t-warn">[+] menyiapkan payload ${UI.esc(a.tech)} → ${UI.esc(tgt)}</span>`);
    const res = act({ type: 'attack', attackId: a.id, target: tgt });
    if (res && res.ok === false) UI.termPush('<span class="t-err">[!] ' + UI.esc(res.why) + '</span>', 't-err');
    else UI.termPush(`<span class="t-ok">[+] ${UI.esc(a.nama)} diluncurkan dari ${UI.esc(st.red.ip)}. Pantau hasil pada event feed…</span>`, 't-ok');
  }

  function doLogout() {
    window.Net.leave();
    st = null; peers = []; hostId = '';
    if (loopTimer) { clearInterval(loopTimer); loopTimer = null; }
    endedAnnounced = false;
    UI.resetTerm(); UI.S.pinOk = false;
    $('#pinBody').hidden = true; $('#pinGate').hidden = false;
    UI.screen('setup');
    UI.toast('Anda keluar dari ruang.', 'ok');
  }

  /* ============ PLAYBOOK ============ */
  function runPlaybook(pbId, node, ip) {
    const pb = D.PLAYBOOK_MAP[pbId];
    if (!pb) return;
    const res = act({ type: 'playbook', playbookId: pbId, node: node || null, ip: ip || null });
    if (res && res.ok === false) UI.toast(res.why, 'err');
    else if (isHost() && res) UI.toast(res.correct ? `✅ ${pb.kode} tepat sasaran — ancaman dimitigasi.` : `⚠️ ${pb.kode} tidak tepat sasaran (false positive).`, res.correct ? 'ok' : 'warn');
  }

  function mitigateCurrent(attackId, node, ip) {
    const a = D.ATTACK_MAP[attackId];
    if (!a) return;
    const pbId = a.mit[0];
    const pb = D.PLAYBOOK_MAP[pbId];
    runPlaybook(pbId, pb.target === 'ip' ? null : node, pb.target === 'ip' ? ip : null);
    UI.toast(`🛡️ Menjalankan ${pb.kode} • ${pb.nama} untuk menangkal ${a.tech}.`, 'ok');
  }

  /* ============ AKSI UI (delegasi) ============ */
  function onClick(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act0 = btn.dataset.act;

    switch (act0) {
      case 'gen-room': $('#inRoom').value = window.Engine.roomCode(); break;
      case 'create-room': createRoom(); break;
      case 'join-room': joinRoom(); break;
      case 'back-setup':
        if (isHost() && st && st.phase !== 'setup') { UI.toast('Sesi sudah berjalan. Gunakan Reset pada Konsol Guru.', 'warn'); break; }
        UI.screen('setup'); break;
      case 'logout': doLogout(); break;
      case 'modal-close': UI.closeModal(); break;
      case 'open-superadmin': window.SuperAdmin.open(); break;
      case 'sa-pass-submit': window.SuperAdmin.submitPass(); break;
      case 'sa-save': window.SuperAdmin.save(); break;
      case 'sa-reset': window.SuperAdmin.resetDefault(); break;
      case 'sa-reset-confirm': window.SuperAdmin.resetConfirm(); break;
      case 'sa-cancel-reset': window.SuperAdmin.open(); break;
      case 'open-guide':
        UI.modal('📖 Buku Panduan Teknis &amp; SOP Siswa',
          `<div style="max-height:64vh;overflow:auto;background:#0b1222;padding:14px;border-radius:8px">${window.Guide.html}</div>`,
          `<button class="btn btn-ghost" data-act="modal-close">Tutup</button><button class="btn btn-primary" data-act="print-guide">🖨 Cetak Modul</button>`);
        break;
      case 'print-guide':
        UI.closeModal();
        document.body.classList.add('print-guide');
        setTimeout(() => { window.print(); setTimeout(() => document.body.classList.remove('print-guide'), 400); }, 120);
        break;
      case 'print-arsip':
        if (!st) { UI.toast('Belum ada sesi.', 'err'); break; }
        UI.setTab('arsip', UI.S.role, isHost());
        UI.renderArsip(st);
        document.body.classList.add('print-arsip');
        setTimeout(() => { window.print(); setTimeout(() => document.body.classList.remove('print-arsip'), 400); }, 160);
        break;
      case 'download-json': {
        if (!st) { UI.toast('Belum ada sesi.', 'err'); break; }
        const f = window.Report.downloadJSON(st);
        UI.toast('⬇ Arsip data diunduh: <b>' + UI.esc(f) + '</b>', 'ok');
        break;
      }
      case 'tab': UI.setTab(btn.dataset.tab, UI.S.role, isHost()); if (st) UI.renderSim(st, peers, hostId); break;

      case 'host-start': {
        const r = act({ type: 'start' });
        if (r && r.ok) { UI.toast('🟢 Simulasi dimulai. Countdown berjalan.', 'ok'); }
        break;
      }
      case 'host-pause': act({ type: 'pause' }); break;
      case 'host-resume': act({ type: 'resume' }); break;
      case 'host-stop':
        UI.modal('⏹ Akhiri &amp; Kunci Nilai',
          `<p>Sesi akan dihentikan sekarang dan <b>nilai akhir dihitung serta dikunci</b>.
           Waktu berjalan: <b>${UI.mmss(st ? st.clock.elapsed : 0)}</b> dari <b>${UI.mmss(st ? st.clock.total : 0)}</b>.</p>
           <p class="hint">Skor tetap dirahasiakan dari murid sampai Guru menekan "Umumkan Skor".</p>`,
          `<button class="btn btn-ghost" data-act="modal-close">Batal</button><button class="btn btn-danger" data-act="host-stop-confirm">Ya, Akhiri</button>`);
        break;
      case 'host-stop-confirm': UI.closeModal(); act({ type: 'stop' }); UI.toast('⏹ Sesi diakhiri, nilai dikunci.', 'ok'); break;
      case 'host-reset':
        UI.modal('♻ Reset Sesi Baru', '<p>Seluruh log, serangan, dan metrik akan dihapus. Pengaturan ujian &amp; identitas tim dipertahankan. Lanjutkan?</p>',
          `<button class="btn btn-ghost" data-act="modal-close">Batal</button><button class="btn btn-primary" data-act="host-reset-confirm">Ya, Reset</button>`);
        break;
      case 'host-reset-confirm': UI.closeModal(); act({ type: 'reset' }); break;

      case 'pin-open': {
        const v = ($('#pinInput').value || '').trim();
        if (v === D.PENGUJI.pin || (st && st.penguji && v === String(st.penguji.pin))) {
          UI.S.pinOk = true; $('#pinBody').hidden = false; $('#pinGate').hidden = true; $('#pinInput').value = '';
          if (st) UI.renderAssess(st);
          UI.toast('🔓 Lembar Asesmen Guru terbuka.', 'ok');
        } else { $('#pinErr').textContent = 'PIN salah. Coba lagi. (Default: 1234)'; }
        break;
      }
      case 'pin-lock': UI.S.pinOk = false; $('#pinBody').hidden = true; $('#pinGate').hidden = false; UI.toast('🔒 Lembar asesmen dikunci kembali.', 'ok'); break;
      case 'reveal-scores': {
        const on = !(st && st.revealed);
        act({ type: 'reveal', on });
        UI.toast(on ? '📢 Skor DIUMUMKAN ke layar murid.' : '🔒 Skor disembunyikan kembali.', on ? 'ok' : 'warn');
        break;
      }
      case 'save-note': act({ type: 'guruNote', text: $('#guruNote').value }); UI.toast('💾 Catatan evaluasi tersimpan.', 'ok'); break;

      case 'triage': {
        const r = act({ type: 'triage', logId: Number(btn.dataset.id), verdict: btn.dataset.v });
        if (isHost() && r && r.ok) UI.toast(r.correct ? '✔ Triase tepat.' : '✖ Triase keliru — memengaruhi aspek A1.', r.correct ? 'ok' : 'warn');
        break;
      }
      case 'jump-log': {
        UI.S.sevFilter = 'ALL'; UI.S.search = '';
        $$('#sevFilter .chip').forEach(c => c.classList.toggle('on', c.dataset.sev === 'ALL'));
        $('#siemSearch').value = '';
        if (st) UI.renderLogs(st);
        UI.toast('Filter dibersihkan — baris log ditandai pada tabel SIEM.', 'ok');
        break;
      }
      case 'mitigate-current': mitigateCurrent(btn.dataset.attack, btn.dataset.node, btn.dataset.ip); break;

      case 'playbook': {
        const card = btn.closest('.pb-card');
        const pbId = btn.dataset.pb;
        const pb = D.PLAYBOOK_MAP[pbId];
        let node = null, ip = null;
        if (card) {
          const sel = $('.pb-node', card); const inp = $('.pb-ip', card);
          if (sel) node = sel.value;
          if (inp) ip = (inp.value || '').trim() || null;
        }
        if (pb.target === 'ip' && !ip && st) ip = st.red.ip;
        runPlaybook(pbId, pb.target === 'ip' ? null : node, ip);
        break;
      }
      case 'playbook-node': runPlaybook(btn.dataset.pb, btn.dataset.node, null); break;
      case 'quick-blacklist': {
        const ip = $('#qaIp').value;
        runPlaybook('blacklist', null, ip);
        break;
      }
      case 'quick-unquarantine': act({ type: 'unquarantine', node: $('#qaNode').value }); break;
      case 'quick-unquarantine-node': act({ type: 'unquarantine', node: btn.dataset.node }); break;
      case 'quick-restore-all': runPlaybook('restore', '*', null); break;

      case 'attack': doAttack(btn.dataset.id, targetByAttack[btn.dataset.id] || null); break;
      case 'man': {
        const a = D.ATTACK_MAP[btn.dataset.id];
        if (!a) break;
        UI.modal(`<span style="color:#ff4d6d">${UI.esc(a.tech)}</span> — ${UI.esc(a.nama)}`, `
          <p><b>Taktik:</b> ${UI.esc(a.tactic)} &nbsp;•&nbsp; <b>Fase kill-chain:</b> ${a.fase}/5</p>
          <p>${UI.esc(a.ringkas)}</p>
          <table class="assess-table">
            <tr><th>Target default</th><td>${a.target}</td></tr>
            <tr><th>Prasyarat</th><td>${a.butuh.length ? a.butuh.join(', ') : 'tidak ada'}</td></tr>
            <tr><th>Durasi</th><td>${a.durasi} detik</td></tr>
            <tr><th>Peluang dasar sukses</th><td>${Math.round(a.sukses * 100)}%</td></tr>
            <tr><th>Dampak kerusakan</th><td>${Object.keys(a.damage || {}).map(k => k + ' −' + a.damage[k]).join(', ') || 'tidak merusak'}</td></tr>
            <tr><th>Hadiah</th><td>${a.flag ? '🚩 ' + UI.esc(a.flag) : '-'}${a.exfil ? ' • ' + a.exfil + ' MB data bocor' : ''}${a.grants ? ' • akses ' + a.grants : ''}</td></tr>
            <tr><th>Playbook penangkal</th><td>${a.mit.map(m => D.PLAYBOOK_MAP[m].kode + ' — ' + D.PLAYBOOK_MAP[m].nama).join('<br>')}</td></tr>
          </table>`,
          `<button class="btn btn-ghost" data-act="modal-close">Tutup</button><button class="btn btn-danger" data-act="modal-close">Mengerti</button>`);
        break;
      }
      case 'red-target': UI.S.redTarget = btn.dataset.node; if (st) UI.renderRed(st); UI.termPush && UI.termPush(`<span class="t-dim">[fokus target → ${btn.dataset.node}]</span>`, 't-dim'); break;
      case 'sel-node': UI.S.selNode = btn.dataset.node; if (st) UI.renderTopo(st); break;
      default: break;
    }
  }

  function onChange(e) {
    const t = e.target;
    if (t.id === 'gRedBot') { act({ type: 'cfg', patch: { redBot: t.checked } }); UI.toast(t.checked ? '🤖 RedBot otonom AKTIF.' : '🤖 RedBot otonom nonaktif.', 'ok'); }
    if (t.id === 'gBenign') { act({ type: 'cfg', patch: { benign: t.checked } }); UI.toast(t.checked ? '🚶 Benign traffic AKTIF.' : '🚶 Benign traffic nonaktif.', 'ok'); }
    if (t.id === 'redProxy') { act({ type: 'proxy', on: t.checked, node: D.PROXY_POOL[Math.floor(Math.random() * D.PROXY_POOL.length)] }); }
    if (t.id === 'redIpSel') { act({ type: 'redip', ip: t.value }); }
    if (t.classList.contains('ar-tgt')) { targetByAttack[t.dataset.id] = t.value; }
  }

  function onKeydown(e) {
    if (e.target.id === 'termInput') {
      if (e.key === 'Enter') { const v = e.target.value; e.target.value = ''; termRun(v); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (histIdx < cmdHistory.length - 1) { histIdx++; e.target.value = cmdHistory[histIdx]; } }
      else if (e.key === 'ArrowDown') { e.preventDefault(); if (histIdx > 0) { histIdx--; e.target.value = cmdHistory[histIdx]; } else { histIdx = -1; e.target.value = ''; } }
      else if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); UI.termClear(); }
      return;
    }
    if (e.target.id === 'pinInput' && e.key === 'Enter') { document.querySelector('[data-act="pin-open"]').click(); }
    if (e.key === 'Escape') UI.closeModal();
  }

  /* ============ BOOT ============ */
  function init() {
    UI.init();
    $('#docBox').innerHTML = `No. Dokumen Berita Acara: <b>${UI.esc(docNum)}</b>`;
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    document.addEventListener('keydown', onKeydown);
    window.addEventListener('beforeunload', () => { try { window.Net.leave(); } catch (e) {} });

    // Tab yang dibackground membuat timer browser melambat; kejar ketertinggalan saat terlihat lagi.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      if (isHost() && st) { window.Engine.tick(st); render(); broadcast(); }
    });
    window.addEventListener('focus', () => { if (isHost() && st) { window.Engine.tick(st); render(); broadcast(); } });

    // terminal tetap fokus saat tab Red dibuka
    document.addEventListener('click', (e) => {
      if (UI.S.activeTab === 'red' && !e.target.closest('input,select,textarea,button')) {
        const ti = $('#termInput'); if (ti) ti.focus();
      }
    });

    UI.screen('setup');
    UI.toast('Selamat datang. Isi pengaturan, lalu <b>Buat Ruang</b> atau <b>Gabung Ruang</b>.', 'ok');
  }

  document.addEventListener('DOMContentLoaded', init);

  return { init, get state() { return st; }, act, termRun, docNum, targetOf: (id) => targetByAttack[id] || null };
})();
