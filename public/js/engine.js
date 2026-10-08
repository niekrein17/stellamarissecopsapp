'use strict';
/* Stella Maris SecOps App - engine.js
 * Mesin simulasi Cyber Range: siklus serangan, mitigasi SOAR, sampling SLA,
 * pembangkit log SIEM, dan perhitungan skor rubrik 4 aspek kompetensi.
 * Hanya HOST yang menjalankan engine; client lain menerima state hasil broadcast.
 */
window.Engine = (function () {
  const D = window.SMData;
  const MAX_LOGS = 320;
  const TRIAGE_WINDOW = 45; // detik batas mengenali sebuah serangan

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function ri(a, b) { return Math.floor(rnd(a, b + 1)); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function uid(p) { return (p || 'x') + Math.random().toString(36).slice(2, 9); }

  function roomCode() {
    const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    let s = '';
    for (let i = 0; i < 3; i++) s += a[Math.floor(Math.random() * a.length)];
    return 'SM-' + s + '-' + ri(10, 99);
  }

  function docNumber() {
    return `421.3/SMITT-SECOPS/${String(ri(1, 999)).padStart(3, '0')}/2026`;
  }

  /* ================= STATE BARU ================= */
  function newState(opts) {
    const o = opts || {};
    const nodes = {};
    D.NODES.forEach(n => { nodes[n.id] = { id: n.id, health: 100, ransom: false, quarantined: false, offlineUntil: 0 }; });
    return {
      v: 3,
      room: o.room || roomCode(),
      phase: 'setup',                       // setup | running | paused | ended
      cfg: {
        kategori: 'Latihan / Drill',
        durasiMenit: 15,
        jumlahAnggota: 3,
        kelas: '10',
        mapel: 'Dasar Keamanan Informasi / TJKT',
        tanggal: new Date().toISOString().slice(0, 10),
        docNumber: docNumber(),
        tujuan: D.TUJUAN_PEMBELAJARAN.join('\n'),
        dateName: '',
        redBot: false,
        benign: true,
        startedEpoch: 0
      },
      teams: {
        blue: { nama: '', anggota: [] },
        red: { nama: '', anggota: [] }
      },
      penguji: Object.assign({}, D.PENGUJI),
      clock: { elapsed: 0, remaining: 15 * 60, total: 15 * 60 },
      nodes,
      logs: [],
      events: [],
      attacks: [],        // riwayat serangan selesai
      active: [],         // serangan berjalan
      mitig: [],          // mitigasi aktif
      red: {
        ip: D.RED_IPS[0], proxy: false, proxyIdx: 0, proxyNode: D.PROXY_POOL[0],
        access: { foothold: false, root: false },
        flags: [], exfilMB: 0, launched: 0, success: 0, failed: 0, blocked: 0,
        techs: [], maxPhase: 0, ransomActive: false
      },
      blue: {
        tp: 0, fp: 0, benignOk: 0, benignFp: 0, missed: 0, judged: 0, alertTotal: 0,
        pbOk: 0, pbWrong: 0, pbRuns: 0, pbTypes: [],
        uptimeSum: 0, samples: 0, sla: 100, mitigated: 0
      },
      guruNote: '',
      scores: null,
      revealed: false,
      special: null,
      pauseStart: null,
      logSeq: 1,
      evtSeq: 1,
      nextBenign: 3,
      nextNoise: 9,
      nextRed: 14
    };
  }

  /* ================= LOG & EVENT ================= */
  function pushLog(st, entry) {
    const node = entry.dst ? D.NODES.find(n => n.ip === entry.dst) : null;
    const log = {
      id: st.logSeq++,
      rel: st.clock.elapsed,
      jam: st.cfg.startedEpoch ? new Date(st.cfg.startedEpoch + st.clock.elapsed * 1000) : new Date(),
      sev: entry.sev, proto: entry.proto, src: entry.src || '-', dst: entry.dst || '-',
      app: entry.app, msg: entry.msg,
      alert: !!entry.alert, attackId: entry.attackId || null,
      nodeId: node ? node.id : null,
      verdict: null
    };
    st.logs.push(log);
    if (log.alert) st.blue.alertTotal++;
    if (st.logs.length > MAX_LOGS) st.logs.splice(0, st.logs.length - MAX_LOGS);
    return log;
  }

  function pushEvent(st, text, kind) {
    st.events.push({ id: st.evtSeq++, rel: st.clock.elapsed, text, kind: kind || 'info' });
    if (st.events.length > 80) st.events.splice(0, st.events.length - 80);
  }

  function nodeOf(st, id) { return st.nodes[id]; }

  function applyDamage(st, nodeId, amount) {
    const n = nodeOf(st, nodeId);
    if (!n) return;
    n.health = clamp(n.health - amount, 0, 100);
  }

  function nodeStatus(st, id) {
    const n = st.nodes[id];
    if (!n) return 'unknown';
    if (n.ransom) return 'ransom';
    if (n.health <= 0) return 'offline';
    if (n.quarantined) return 'quarantine';
    if (n.health < 40) return 'critical';
    if (n.health < 80) return 'degraded';
    return 'online';
  }

  /* ================= MITIGASI ================= */
  function mitMatch(mit, atk) {
    const pb = D.PLAYBOOK_MAP[mit.playbookId];
    if (!pb || !pb.counter.includes(atk.id)) return false;
    if (pb.target === 'ip') {
      if (!mit.ip) return true;
      if (atk.ip && mit.ip !== atk.ip) return false;
      return true;
    }
    if (mit.node && mit.node !== '*' && atk.target && mit.node !== atk.target) return false;
    return true;
  }

  function findMitigation(st, atk) {
    return st.mitig.find(m => m.until > st.clock.elapsed && mitMatch(m, atk)) || null;
  }

  /* ================= AKSI RED ================= */
  function canLaunch(st, atk) {
    if (st.phase !== 'running') return { ok: false, why: 'Sesi simulasi tidak berjalan.' };
    for (const r of atk.butuh) {
      if (r === 'recon' && !st.red.techs.includes('recon')) return { ok: false, why: 'Wajib menyelesaikan Reconnaissance (T1595) lebih dulu.' };
      if (r === 'foothold' && !st.red.access.foothold) return { ok: false, why: 'Butuh Initial Access (foothold) — selesaikan Brute Force / SQLi / XSS.' };
      if (r === 'root' && !st.red.access.root) return { ok: false, why: 'Butuh Privilege Escalation ke root (T1068) lebih dulu.' };
    }
    const tgt = atk.target;
    if (tgt === 'AD-01' && nodeStatus(st, 'AD-01') === 'offline') return { ok: false, why: 'Target AD-01 sedang offline.' };
    if (st.active.some(a => a.attackId === atk.id)) return { ok: false, why: 'Vektor ini sedang berjalan.' };
    return { ok: true };
  }

  function sourceIp(st) {
    if (!st.red.proxy) return st.red.ip;
    st.red.proxyIdx = (st.red.proxyIdx + 1) % D.RED_IPS.length;
    st.red.ip = D.RED_IPS[st.red.proxyIdx];
    return st.red.ip;
  }

  function launchAttack(st, attackId, targetOverride) {
    const atk = D.ATTACK_MAP[attackId];
    if (!atk) return { ok: false, why: 'Vektor tidak dikenal.' };
    const chk = canLaunch(st, atk);
    if (!chk.ok) return chk;

    const target = targetOverride && D.NODES.some(n => n.id === targetOverride) ? targetOverride : atk.target;
    const tNode = D.NODES.find(n => n.id === target) || D.NODES[1];
    const ip = sourceIp(st);

    const preMit = findMitigation(st, { id: atk.id, target, ip });
    let effSuccess = atk.sukses;
    // kesehatan target rendah mempermudah penetrasi lanjutan
    if (tNode && nodeOf(st, tNode.id).health < 50) effSuccess += 0.10;
    if (st.red.access.root && atk.fase >= 4) effSuccess += 0.10;
    effSuccess = clamp(effSuccess, 0.05, 0.97);

    const outcome = Math.random() < effSuccess ? 'sukses' : 'gagal';
    const rec = {
      uid: uid('atk'), attackId: atk.id, tech: atk.tech, tactic: atk.tactic, nama: atk.nama,
      ip, target, targetName: tNode.nama,
      startRel: st.clock.elapsed, durasi: atk.durasi, tick: 0,
      outcome, status: preMit ? 'diblokir' : 'berjalan',
      detected: false, missDeadline: st.clock.elapsed + atk.durasi + TRIAGE_WINDOW,
      mitigatedBy: preMit ? preMit.playbookId : null,
      exfil: atk.exfil, flag: atk.flag, logsEmitted: 0
    };
    st.active.push(rec);
    st.red.launched++;
    st.red.maxPhase = Math.max(st.red.maxPhase, atk.fase);

    const lines = D.logFor(atk, { ip, targetNode: tNode, ts: Math.floor(rnd(1000, 9999)), exfil: atk.exfil });
    rec.logLines = lines;
    emitAttackLog(st, rec, 0);

    if (preMit) {
      pushEvent(st, `🛡️ SOAR otomatis memblok ${atk.nama} dari ${ip} (playbook ${D.PLAYBOOK_MAP[preMit.playbookId].kode}).`, 'mitigasi');
      finishAttack(st, rec, 'diblokir');
    } else {
      pushEvent(st, `⚔️ Red Team meluncurkan ${atk.nama} [${atk.tech}] → ${tNode.nama} (${ip}).`, 'serangan');
    }
    return { ok: true, rec };
  }

  function emitAttackLog(st, rec, idx) {
    const lines = rec.logLines || [];
    if (idx >= lines.length) return;
    const l = lines[idx];
    pushLog(st, { sev: l.sev, proto: l.proto, src: l.src, dst: l.dst, app: l.app, msg: l.msg, alert: true, attackId: rec.attackId });
    rec.logsEmitted = idx + 1;
  }

  function finishAttack(st, rec, status) {
    const atk = D.ATTACK_MAP[rec.attackId];
    rec.status = status;
    st.active = st.active.filter(a => a.uid !== rec.uid);
    st.attacks.push(rec);
    if (st.attacks.length > 120) st.attacks.shift();

    if (status === 'diblokir') {
      st.red.blocked++;
      st.blue.mitigated++;
      pushEvent(st, `✅ Serangan ${atk.nama} berhasil dimitigasi (target ${rec.target}).`, 'mitigasi');
      return;
    }
    if (status === 'gagal') {
      st.red.failed++;
      pushLog(st, { sev: 'WARNING', proto: 'SYS', src: rec.target ? (D.NODES.find(n => n.id === rec.target) || {}).ip : '-', dst: rec.ip, app: 'auditd', msg: `Percobaan ${atk.nama} dari ${rec.ip} GAGAL - exploit tidak kompatibel / patch sudah terpasang`, alert: true, attackId: rec.attackId });
      pushEvent(st, `❌ ${atk.nama} dari Red gagal (exploit tidak bekerja).`, 'info');
      return;
    }

    // sukses
    st.red.success++;
    if (!st.red.techs.includes(rec.attackId)) st.red.techs.push(rec.attackId);
    Object.keys(atk.damage || {}).forEach(nid => applyDamage(st, nid, atk.damage[nid]));
    if (atk.exfil) st.red.exfilMB += atk.exfil;
    if (atk.grants === 'foothold') st.red.access.foothold = true;
    if (atk.grants === 'root') st.red.access.root = true;
    if (atk.ransom) {
      st.red.ransomActive = true;
      if (st.nodes[rec.target]) st.nodes[rec.target].ransom = true;
      if (st.nodes['DB-01']) st.nodes['DB-01'].ransom = true;
    }
    if (atk.flag && !st.red.flags.includes(atk.flag)) {
      st.red.flags.push(atk.flag);
      pushEvent(st, `🚩 CTF FLAG diraih Red: ${atk.flag}`, 'flag');
    }
    pushEvent(st, `💥 ${atk.nama} BERHASIL menembus ${rec.target}${atk.flag ? ' • flag diraih' : ''}${atk.exfil ? ` • ${atk.exfil} MB bocor` : ''}.`, 'kritis');
  }

  /* ================= AKSI BLUE ================= */
  function runPlaybook(st, playbookId, node, ip) {
    if (st.phase !== 'running') return { ok: false, why: 'Sesi tidak berjalan.' };
    const pb = D.PLAYBOOK_MAP[playbookId];
    if (!pb) return { ok: false, why: 'Playbook tidak dikenal.' };

    const tNode = node && node !== '*' ? node : null;
    const now = st.clock.elapsed;
    let correct = false, alasan = '';

    const matching = st.active.filter(a => pb.counter.includes(a.attackId) &&
      (pb.target === 'ip' ? (!ip || ip === a.ip) : (!tNode || tNode === '*' || a.target === tNode)));
    const recent = st.attacks.filter(a => pb.counter.includes(a.attackId) && now - (a.startRel + a.durasi) < 20);

    if (pb.restore) {
      const rn = tNode && st.nodes[tNode] && (st.nodes[tNode].ransom || st.nodes[tNode].health < 60);
      correct = !!rn || st.red.ransomActive;
      alasan = correct ? 'Snapshot restore dipanggil saat host dalam keadaan rusak/terenkripsi.' : 'Tidak ada host yang memerlukan restore — snapshot dijalankan tanpa kebutuhan.';
    } else if (pb.id === 'backdoor') {
      correct = st.red.access.foothold || st.red.access.root || st.red.ransomActive || matching.length > 0;
      alasan = correct ? 'Persistence/backdoor Red terdeteksi dan berhasil dibersihkan.' : 'Tidak ada indikasi backdoor — operasi sapu bersih sia-sia.';
    } else {
      correct = matching.length > 0 || recent.length > 0;
      alasan = correct ? `Playbook cocok dengan vektor ${matching.length ? 'yang sedang berjalan' : 'yang baru saja terjadi'}.` : 'Tidak ada ancaman aktif yang cocok dengan playbook ini (false positive / pemborosan change window).';
    }

    st.blue.pbRuns++;
    const disrupt = pb.disrupt * (tNode ? 1 : 1.5);
    if (correct) {
      st.blue.pbOk++;
      matching.forEach(a => { if (a.status === 'berjalan') { a.status = 'diblokir'; a.mitigatedBy = pb.id; finishAttack(st, a, 'diblokir'); } });
      if (pb.revoke) pb.revoke.forEach(k => { st.red.access[k] = false; });
      if (pb.id === 'backdoor') { st.red.ransomActive = false; Object.keys(st.nodes).forEach(k => st.nodes[k].ransom = false); }
      if (pb.restore && tNode) { st.nodes[tNode].health = 100; st.nodes[tNode].ransom = false; }
      if (pb.restore && !tNode) Object.keys(st.nodes).forEach(k => { st.nodes[k].health = clamp(st.nodes[k].health + 35, 0, 100); st.nodes[k].ransom = false; });
      if (pb.id === 'quarantine' && tNode) st.nodes[tNode].quarantined = true;
      if (!st.blue.pbTypes.includes(pb.id)) st.blue.pbTypes.push(pb.id);
      pushEvent(st, `🛡️ ${pb.kode} • ${pb.nama} dieksekusi → ${tNode || (ip || 'perimeter')}. ${alasan}`, 'mitigasi');
    } else {
      st.blue.pbWrong++;
      if (tNode) applyDamage(st, tNode, disrupt);
      pushEvent(st, `⚠️ ${pb.kode} • ${pb.nama} TIDAK TEPAT SASARAN. ${alasan} Dampak operasional -${disrupt.toFixed(0)} poin kesehatan.`, 'salah');
    }

    st.mitig = st.mitig.filter(m => m.until > now);
    st.mitig.push({
      uid: uid('mit'), playbookId: pb.id, kode: pb.kode, nama: pb.nama,
      node: tNode || '*', ip: ip || null, startRel: now, until: now + pb.ttl, correct
    });
    if (st.mitig.length > 40) st.mitig.shift();

    pushLog(st, {
      sev: correct ? 'INFO' : 'WARNING', proto: 'SYS', src: '10.10.0.25', dst: tNode ? (D.NODES.find(n => n.id === tNode) || {}).ip : '10.10.0.1',
      app: 'soar', msg: `PLAYBOOK ${pb.kode} dijalankan oleh analis SOC :: ${pb.cmd.replace('{NODE}', tNode || 'ALL').replace('{IP}', ip || st.red.ip).replace('{N}', ri(100, 999))} :: status=${correct ? 'MATCH-THREAT' : 'NO-MATCH'}`, alert: false
    });
    return { ok: true, correct, alasan };
  }

  function unquarantine(st, node) {
    if (st.nodes[node]) { st.nodes[node].quarantined = false; pushEvent(st, `🔓 Karantina VLAN pada ${node} dilepas, layanan dikembalikan.`, 'info'); }
    return { ok: true };
  }

  function triage(st, logId, verdict) {
    if (st.phase !== 'running' && st.phase !== 'ended') return { ok: false, why: 'Sesi belum berjalan.' };
    const log = st.logs.find(l => l.id === logId);
    if (!log) return { ok: false, why: 'Log tidak ditemukan.' };
    if (log.verdict) return { ok: false, why: 'Log sudah pernah ditriase.' };
    log.verdict = verdict;
    st.blue.judged++;

    if (log.alert) {
      if (verdict === 'tp') {
        st.blue.tp++;
        const rec = [...st.active, ...st.attacks].find(a => a.attackId === log.attackId && !a.detected);
        if (rec) {
          rec.detected = true;
          const delay = st.clock.elapsed - rec.startRel;
          rec.detectDelay = delay;
          pushEvent(st, `🔎 Insiden terkonfirmasi analis: ${rec.nama} (MTTD ${delay.toFixed(0)} detik).`, 'triase');
        }
      } else {
        st.blue.fp++;
        pushEvent(st, `❗ Salah klasifikasi: ancaman nyata ${log.attackId ? D.ATTACK_MAP[log.attackId].nama : ''} ditandai sebagai trafik wajar.`, 'salah');
      }
    } else {
      if (verdict === 'fp') st.blue.benignOk++;
      else { st.blue.benignFp++; pushEvent(st, `❗ False alarm: trafik wajar dinaikkan menjadi insiden.`, 'salah'); }
    }
    return { ok: true, correct: log.alert ? verdict === 'tp' : verdict === 'fp' };
  }

  /* ================= PEMBANGKIT TRAFIK ================= */
  function fillTemplate(tpl, st) {
    return tpl
      .replace(/\{n\}/g, () => ri(11, 250))
      .replace(/\{nn\}/g, () => String(ri(1, 32)).padStart(2, '0'))
      .replace(/\{p\}/g, () => ri(30000, 65000))
      .replace(/\{ms\}/g, () => ri(12, 480));
  }

  function genBenign(st) {
    const tpl = pick(D.BENIGN);
    const node = pick(D.NODES.filter(n => n.id !== 'INET'));
    pushLog(st, {
      sev: tpl.sev, proto: tpl.proto, src: `10.10.30.${ri(11, 250)}`, dst: node.ip,
      app: tpl.app, msg: fillTemplate(tpl.msg, st), alert: false, benign: true
    });
  }

  function genNoise(st) {
    const tpl = pick(D.NOISE);
    pushLog(st, { sev: tpl.sev, proto: tpl.proto, src: '10.10.0.1', dst: '127.0.0.1', app: tpl.app, msg: tpl.msg, alert: false });
  }

  function redBotThink(st) {
    const feasible = D.ATTACKS.filter(a => canLaunch(st, a).ok);
    if (!feasible.length) return;
    // bobot: utamakan progres rantai serangan
    const scored = feasible.map(a => ({ a, w: (a.fase === st.red.maxPhase + 1 ? 4 : 1) + (a.flag ? 2 : 0) + Math.random() * 2 }));
    scored.sort((x, y) => y.w - x.w);
    launchAttack(st, scored[0].a.id);
  }

  /* ================= SLA ================= */
  function sampleSla(st) {
    const critical = D.NODES.filter(n => n.critical);
    let sum = 0;
    critical.forEach(n => {
      const nn = st.nodes[n.id];
      if (nn.health <= 0) sum += 0;
      else sum += nn.health;
    });
    const avail = sum / critical.length;
    st.blue.uptimeSum += avail;
    st.blue.samples++;
    st.blue.sla = st.blue.uptimeSum / Math.max(1, st.blue.samples);
    return avail;
  }

  /* ================= TICK =================
   * Berbasis wall-clock: bila tab dibackground (timer di-throttle browser),
   * langkah yang tertinggal dikejar sekaligus sehingga countdown tetap akurat.
   */
  function tick(st) {
    if (st.phase !== 'running') return;
    if (!st.cfg.startedEpoch) { stepSecond(st); return; }
    const now = Date.now();
    let guard = 0;
    while (st.phase === 'running' && guard < 600) {
      const nextBoundary = st.cfg.startedEpoch + (st.clock.elapsed + 1) * 1000;
      if (now < nextBoundary) break;
      stepSecond(st);
      guard++;
    }
  }

  function stepSecond(st) {
    if (st.phase !== 'running') return;

    st.clock.elapsed++;
    st.clock.remaining = Math.max(0, st.clock.total - st.clock.elapsed);

    // serangan berjalan
    st.active.slice().forEach(rec => {
      const atk = D.ATTACK_MAP[rec.attackId];
      rec.tick++;
      const mit = findMitigation(st, rec);
      if (mit && rec.status === 'berjalan') {
        rec.mitigatedBy = mit.playbookId;
        finishAttack(st, rec, 'diblokir');
        return;
      }
      // rilis log bertahap
      const step = Math.max(1, Math.floor(rec.durasi / (rec.logLines ? rec.logLines.length : 1)));
      if (rec.tick % step === 0) emitAttackLog(st, rec, rec.logsEmitted);

      if (rec.outcome === 'sukses') {
        Object.keys(atk.damage || {}).forEach(nid => applyDamage(st, nid, (atk.damage[nid] / atk.durasi) * 0.85));
      }
      if (rec.tick >= rec.durasi) finishAttack(st, rec, rec.outcome);
    });

    // deteksi telat -> missed
    st.attacks.forEach(rec => {
      if (!rec.detected && rec.status !== 'missed' && st.clock.elapsed > rec.missDeadline) {
        rec.detected = 'missed';
        st.blue.missed++;
        pushEvent(st, `🕳️ Insiden ${rec.nama} LEWAT tanpa triase analis (> ${TRIAGE_WINDOW}s).`, 'salah');
      }
    });
    st.active.forEach(rec => {
      if (!rec.detected && st.clock.elapsed > rec.missDeadline) {
        rec.detected = 'missed'; st.blue.missed++;
      }
    });

    // masa berlaku mitigasi
    const before = st.mitig.length;
    st.mitig = st.mitig.filter(m => m.until > st.clock.elapsed);
    if (st.mitig.length < before) pushEvent(st, `⌛ ${before - st.mitig.length} kebijakan mitigasi kedaluwarsa.`, 'info');

    // regenerasi kesehatan alami (self-healing kecil)
    Object.keys(st.nodes).forEach(k => {
      const n = st.nodes[k];
      if (n.ransom) return;
      if (n.health > 0 && n.health < 100) n.health = clamp(n.health + (n.quarantined ? 0.9 : 0.35), 0, 100);
      else if (n.health <= 0) n.health = clamp(n.health + 0.2, 0, 100);
    });

    sampleSla(st);

    // trafik
    if (st.cfg.benign) {
      st.nextBenign--;
      if (st.nextBenign <= 0) { genBenign(st); st.nextBenign = ri(2, 5); }
    }
    st.nextNoise--;
    if (st.nextNoise <= 0) { genNoise(st); st.nextNoise = ri(7, 16); }

    if (st.cfg.redBot) {
      st.nextRed--;
      if (st.nextRed <= 0) { redBotThink(st); st.nextRed = ri(9, 20); }
    }

    if (st.clock.remaining <= 0) endSession(st);
  }

  /* ================= SESI ================= */
  function startSession(st) {
    if (st.phase === 'running') return { ok: false, why: 'Sesi sudah berjalan.' };
    st.cfg.startedEpoch = Date.now();
    st.pauseStart = null;
    st.clock.total = st.cfg.durasiMenit * 60;
    st.clock.remaining = st.clock.total;
    st.clock.elapsed = 0;
    st.phase = 'running';
    pushEvent(st, `🟢 Sesi ${st.cfg.kategori} dimulai • durasi ${st.cfg.durasiMenit} menit • ${D.KKM[st.cfg.kelas].label} (KKM ${D.KKM[st.cfg.kelas].kkm}).`, 'mulai');
    pushLog(st, { sev: 'INFO', proto: 'SYS', src: '10.10.0.25', dst: '10.10.0.1', app: 'soc', msg: `SIEM engine ONLINE • 42.118 signature Suricata dimuat • collector syslog UDP/514 aktif`, alert: false });
    pushLog(st, { sev: 'INFO', proto: 'SYS', src: '10.10.0.25', dst: '10.10.0.1', app: 'soar', msg: `SOAR orchestrator READY • 6 playbook dimuat • konektor pfSense & ModSecurity terhubung`, alert: false });
    return { ok: true };
  }

  function endSession(st) {
    if (st.phase === 'ended') return { ok: false };
    st.phase = 'ended';
    st.scores = computeScores(st);
    pushEvent(st, `🏁 Waktu habis. Sesi dikunci • perhitungan nilai akhir selesai (disembunyikan dari murid).`, 'selesai');
    return { ok: true };
  }

  function stopSession(st) {
    st.phase = 'ended';
    st.scores = computeScores(st);
    pushEvent(st, `⏹️ Sesi dihentikan oleh Guru Penguji. Nilai akhir dikunci.`, 'selesai');
    return { ok: true };
  }

  /* ================= PENILAIAN ================= */
  function gradeOf(nilai, kkm) {
    if (nilai >= 90) return { huruf: 'A', ket: 'Sangat Kompeten' };
    if (nilai >= 80) return { huruf: 'B', ket: 'Kompeten' };
    if (nilai >= kkm) return { huruf: 'C', ket: 'Cukup Kompeten' };
    if (nilai >= 60) return { huruf: 'D', ket: 'Belum Tuntas' };
    return { huruf: 'D', ket: 'Belum Tuntas' };
  }

  function computeScores(st) {
    const kkmInfo = D.KKM[st.cfg.kelas] || D.KKM['10'];
    const kkm = kkmInfo.kkm;
    const b = st.blue, r = st.red;
    const launched = r.launched;

    /* --- A1 Deteksi & Analisis Log SIEM (25%) --- */
    const detRate = launched ? clamp(countDetected(st) / launched, 0, 1) : 0;
    const precision = (b.tp + b.benignFp) ? b.tp / (b.tp + b.benignFp) : 0.6;
    const benignAcc = (b.benignOk + b.benignFp) ? b.benignOk / (b.benignOk + b.benignFp) : 0.7;
    const missPenalty = launched ? clamp(b.missed / launched, 0, 1) : 0;
    const A1 = clamp(100 * (0.55 * detRate + 0.25 * precision + 0.20 * benignAcc) - 10 * missPenalty, 0, 100);

    /* --- A2 Mitigasi Firewall & SOAR (30%) --- */
    const pbAcc = b.pbRuns ? b.pbOk / b.pbRuns : 0;
    const blockRate = launched ? clamp((b.mitigated) / launched, 0, 1) : 0;
    const pbCover = b.pbTypes.length / D.PLAYBOOKS.length;
    const A2 = clamp(100 * (0.42 * pbAcc + 0.43 * blockRate + 0.15 * pbCover), 0, 100);

    /* --- A3 Ketersediaan Layanan SLA (25%) --- */
    const A3 = clamp(b.sla, 0, 100);

    /* --- A4 Penetrasi & Vektor Serangan (20%) --- */
    const succRate = launched ? r.success / launched : 0;
    const techCover = r.techs.length / D.TOTAL_TECH;
    const flagRate = r.flags.length / D.TOTAL_FLAGS;
    const exfilRate = clamp(r.exfilMB / D.TARGET_EXFIL, 0, 1);
    const chainRate = r.maxPhase / 5;
    const A4 = clamp(100 * (0.18 * succRate + 0.24 * techCover + 0.24 * flagRate + 0.18 * exfilRate + 0.16 * chainRate), 0, 100);

    let blueRaw = (A1 * 25 + A2 * 30 + A3 * 25) / 80;
    let redRaw = A4;
    let special = null;
    let blueNilai, redNilai;

    if (launched === 0) {
      redNilai = 0;
      blueNilai = kkm;
      special = {
        kode: 'RED-ZERO-ATTACK',
        judul: 'KETENTUAN KHUSUS: RED TEAM 0 SERANGAN',
        pesan: `Tim Red tidak melancarkan satu pun vektor serangan selama sesi ${st.cfg.kategori}. Sesuai ketentuan penilaian, Tim Red otomatis diberi Nilai 0 (Status: Belum Tuntas / D), dan Tim Blue otomatis diberi nilai sebesar KKM jenjang ${kkmInfo.label} yaitu ${kkm} dengan status Tuntas.`,
        redNilai: 0, blueNilai: kkm, kkm
      };
    } else {
      blueNilai = Math.round(clamp(blueRaw, 60, 100));
      redNilai = Math.round(clamp(redRaw, 60, 100));
    }

    const bg = gradeOf(blueNilai, kkm), rg = gradeOf(redNilai, kkm);
    return {
      kkm, kelas: st.cfg.kelas, jenjangLabel: kkmInfo.label,
      aspek: {
        A1: Math.round(A1 * 10) / 10, A2: Math.round(A2 * 10) / 10,
        A3: Math.round(A3 * 10) / 10, A4: Math.round(A4 * 10) / 10
      },
      raw: { blue: Math.round(blueRaw * 100) / 100, red: Math.round(redRaw * 100) / 100 },
      blue: {
        nilai: blueNilai, grade: bg.huruf, ket: bg.ket,
        tuntas: blueNilai >= kkm,
        rincian: {
          detRate: pct(detRate), precision: pct(precision), benignAcc: pct(benignAcc), missed: b.missed,
          tp: b.tp, fp: b.fp, benignOk: b.benignOk, benignFp: b.benignFp,
          pbOk: b.pbOk, pbWrong: b.pbWrong, pbRuns: b.pbRuns, blockRate: pct(blockRate),
          mitigated: b.mitigated, sla: Math.round(A3 * 10) / 10
        }
      },
      red: {
        nilai: redNilai, grade: rg.huruf, ket: rg.ket,
        tuntas: redNilai >= kkm,
        rincian: {
          launched, success: r.success, failed: r.failed, blocked: r.blocked,
          succRate: pct(succRate), techCover: `${r.techs.length}/${D.TOTAL_TECH}`,
          flags: r.flags.length, flagRate: pct(flagRate), exfilMB: Math.round(r.exfilMB),
          exfilRate: pct(exfilRate), chainRate: pct(chainRate), maxPhase: r.maxPhase
        }
      },
      special
    };
  }

  function countDetected(st) {
    return [...st.attacks, ...st.active].filter(a => a.detected === true).length;
  }
  function pct(v) { return Math.round(clamp(v, 0, 1) * 1000) / 10; }

  /* ================= DISPATCH AKSI ================= */
  function applyAction(st, a) {
    if (!a || !a.type) return { ok: false };
    switch (a.type) {
      case 'cfg':
        Object.assign(st.cfg, a.patch || {});
        if (a.patch && a.patch.durasiMenit && st.phase !== 'running') {
          st.clock.total = st.cfg.durasiMenit * 60; st.clock.remaining = st.clock.total;
        }
        return { ok: true };
      case 'teams':
        if (a.patch) { if (a.patch.blue) Object.assign(st.teams.blue, a.patch.blue); if (a.patch.red) Object.assign(st.teams.red, a.patch.red); }
        return { ok: true };
      case 'penguji': Object.assign(st.penguji, a.patch || {}); return { ok: true };
      case 'guruNote': st.guruNote = String(a.text || '').slice(0, 2000); return { ok: true };
      case 'start': return startSession(st);
      case 'pause': st.phase = 'paused'; st.pauseStart = Date.now(); pushEvent(st, '⏸️ Sesi dijeda oleh Guru.', 'info'); return { ok: true };
      case 'resume':
        if (st.pauseStart) { st.cfg.startedEpoch += Date.now() - st.pauseStart; st.pauseStart = null; }
        st.phase = 'running'; pushEvent(st, '▶️ Sesi dilanjutkan.', 'info'); return { ok: true };
      case 'stop': return stopSession(st);
      case 'reveal': st.revealed = !!a.on; pushEvent(st, st.revealed ? '📢 Guru mengumumkan skor ke layar murid.' : '🔒 Guru menyembunyikan kembali skor.', 'info'); return { ok: true };
      case 'attack': return launchAttack(st, a.attackId, a.target);
      case 'redip': st.red.ip = a.ip || st.red.ip; st.red.proxy = false; return { ok: true };
      case 'proxy': st.red.proxy = !!a.on; if (a.on) { st.red.proxyNode = a.node || st.red.proxyNode; } pushEvent(st, a.on ? `🕶️ Red mengaktifkan proxy chain (${st.red.proxyNode}) - IP sumber berotasi tiap serangan.` : '🕶️ Red mematikan proxy chain, menyerang dari IP asli.', 'info'); return { ok: true };
      case 'playbook': return runPlaybook(st, a.playbookId, a.node, a.ip);
      case 'unquarantine': return unquarantine(st, a.node);
      case 'triage': return triage(st, a.logId, a.verdict);
      case 'reset': return { ok: true, reset: true };
      default: return { ok: false, why: 'Aksi tidak dikenal: ' + a.type };
    }
  }

  /* ================= RINGKASAN UNTUK CLIENT ================= */
  function view(st) {
    return {
      phase: st.phase, cfg: st.cfg, teams: st.teams, penguji: st.penguji,
      clock: st.clock, guruNote: st.guruNote, revealed: st.revealed, special: st.special,
      nodeStatus: Object.keys(st.nodes).reduce((o, k) => { o[k] = { health: Math.round(st.nodes[k].health), status: nodeStatus(st, k) }; return o; }, {}),
      red: {
        ip: st.red.ip, proxy: st.red.proxy, proxyNode: st.red.proxyNode,
        access: st.red.access, flags: st.red.flags, exfilMB: Math.round(st.red.exfilMB),
        launched: st.red.launched, success: st.red.success, blocked: st.red.blocked, failed: st.red.failed,
        techs: st.red.techs, maxPhase: st.red.maxPhase, ransomActive: st.red.ransomActive
      },
      blue: Object.assign({}, st.blue, { sla: Math.round(st.blue.sla * 10) / 10 }),
      active: st.active.map(a => ({ uid: a.uid, attackId: a.attackId, nama: a.nama, tech: a.tech, ip: a.ip, target: a.target, targetName: a.targetName, tick: a.tick, durasi: a.durasi, status: a.status, detected: a.detected === true })),
      mitig: st.mitig.map(m => ({ uid: m.uid, playbookId: m.playbookId, kode: m.kode, nama: m.nama, node: m.node, ip: m.ip, sisa: Math.max(0, Math.round(m.until - st.clock.elapsed)), correct: m.correct })),
      attacks: st.attacks.slice(-60).map(a => ({ uid: a.uid, attackId: a.attackId, nama: a.nama, tech: a.tech, tactic: a.tactic, ip: a.ip, target: a.target, startRel: a.startRel, durasi: a.durasi, status: a.status, detected: a.detected, detectDelay: a.detectDelay || null, mitigatedBy: a.mitigatedBy })),
      scores: st.scores
    };
  }

  return {
    newState, tick, step: stepSecond, applyAction, computeScores, view, startSession, endSession, stopSession,
    canLaunch, nodeStatus, roomCode, docNumber, clamp, ri, pick
  };
})();
