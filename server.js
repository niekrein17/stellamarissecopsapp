'use strict';
/*
 * Stella Maris SecOps App - Relay Server
 * Zero-dependency: HTTP static server + hand-rolled RFC6455 WebSocket.
 * Run: node server.js  [port]
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.argv[2] || process.env.PORT || 8080);
const ROOT = path.join(__dirname, 'public');
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_FRAME = 8 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.map': 'application/json; charset=utf-8'
};

/* ---------------- static ---------------- */
function serveStatic(req, res) {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('404 Not Found'); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size, 'Cache-Control': 'no-store'
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

/* ---------------- rooms ---------------- */
const rooms = new Map();

function getRoom(id) {
  let r = rooms.get(id);
  if (!r) { r = { id, clients: new Map(), host: null }; rooms.set(id, r); }
  return r;
}

function peerList(room) {
  const out = [];
  for (const [id, c] of room.clients) out.push({ id, name: c.name, role: c.role, host: id === room.host });
  return out;
}

function broadcastPeers(room) {
  sendToRoom(room, { t: 'peers', room: room.id, host: room.host, peers: peerList(room) });
}

function sendToRoom(room, obj, exceptId) {
  const data = JSON.stringify(obj);
  for (const [id, c] of room.clients) {
    if (id === exceptId) continue;
    if (c.state === 'OPEN') wsSend(c, data);
  }
}

/* ---------------- websocket framing ---------------- */
function wsSend(client, text) {
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) { header = Buffer.alloc(2); header[1] = len; }
  else if (len < 65536) { header = Buffer.alloc(4); header[1] = 126; header.writeUInt16BE(len, 2); }
  else { header = Buffer.alloc(10); header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2); }
  header[0] = 0x81;
  try { client.socket.write(Buffer.concat([header, payload])); } catch (e) { /* socket gone */ }
}

function attachParser(client) {
  let buf = Buffer.alloc(0);
  client.socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 2) return;
      const b0 = buf[0], b1 = buf[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let off = 2;
      if (len === 126) { if (buf.length < off + 2) return; len = buf.readUInt16BE(off); off += 2; }
      else if (len === 127) {
        if (buf.length < off + 8) return;
        const big = buf.readBigUInt64BE(off); off += 8;
        if (big > BigInt(MAX_FRAME)) { client.socket.destroy(); return; }
        len = Number(big);
      }
      if (len > MAX_FRAME) { client.socket.destroy(); return; }
      let maskKey = null;
      if (masked) { if (buf.length < off + 4) return; maskKey = buf.subarray(off, off + 4); off += 4; }
      if (buf.length < off + len) return;
      let payload = buf.subarray(off, off + len);
      if (maskKey) {
        const out = Buffer.alloc(payload.length);
        for (let i = 0; i < payload.length; i++) out[i] = payload[i] ^ maskKey[i & 3];
        payload = out;
      }
      buf = buf.subarray(off + len);

      if (opcode === 0x8) { try { client.socket.end(); } catch (e) {} return; }
      if (opcode === 0x9) {
        const pong = Buffer.alloc(2 + payload.length);
        pong[0] = 0x8a; pong[1] = payload.length; payload.copy(pong, 2);
        try { client.socket.write(pong); } catch (e) {}
        continue;
      }
      if (opcode === 0xa) continue;
      if (opcode === 0x0) { client.frag = Buffer.concat([client.frag || Buffer.alloc(0), payload]); if (fin) { handleText(client, client.frag.toString('utf8')); client.frag = null; } continue; }
      if (opcode === 0x1) { if (!fin) { client.frag = Buffer.from(payload); continue; } handleText(client, payload.toString('utf8')); }
    }
  });
}

/* ---------------- message handling ---------------- */
function handleText(client, raw) {
  let msg;
  try { msg = JSON.parse(raw); } catch (e) { return; }
  if (!msg || typeof msg !== 'object') return;

  switch (msg.t) {
    case 'join': {
      const roomId = String(msg.room || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24) || 'LOBBY';
      const room = getRoom(roomId);
      client.room = room;
      client.name = String(msg.name || 'Anonim').slice(0, 40);
      client.role = ['guru', 'blue', 'red', 'dual'].includes(msg.role) ? msg.role : 'dual';
      room.clients.set(client.id, client);
      if (!room.host || !room.clients.has(room.host)) room.host = client.id;
      wsSend(client, JSON.stringify({ t: 'joined', room: roomId, you: client.id, host: room.host, peers: peerList(room) }));
      sendToRoom(room, { t: 'sys', text: `${client.name} [${client.role}] bergabung ke ruang ${roomId}.` }, client.id);
      broadcastPeers(room);
      break;
    }
    case 'leave': {
      dropClient(client);
      break;
    }
    case 'state':
    case 'action':
    case 'chat': {
      if (!client.room) return;
      msg.from = client.id;
      msg.fromName = client.name;
      msg.fromRole = client.role;
      const target = msg.to && msg.to !== '*' ? msg.to : null;
      if (target) {
        const c = client.room.clients.get(target);
        if (c && c.state === 'OPEN') wsSend(c, JSON.stringify(msg));
      } else {
        sendToRoom(client.room, msg, client.id);
      }
      break;
    }
    case 'ping': wsSend(client, JSON.stringify({ t: 'pong', ts: Date.now() })); break;
    default: break;
  }
}

function dropClient(client) {
  const room = client.room;
  if (!room) return;
  room.clients.delete(client.id);
  client.room = null;
  if (room.host === client.id) {
    const next = room.clients.keys().next();
    room.host = next.done ? null : next.value;
  }
  if (room.clients.size === 0) rooms.delete(room.id);
  else {
    sendToRoom(room, { t: 'sys', text: `${client.name} keluar dari ruang.` });
    broadcastPeers(room);
  }
}

/* ---------------- http server ---------------- */
const server = http.createServer((req, res) => {
  if (req.url === '/healthz') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: true, rooms: rooms.size, ts: Date.now() })); }
  serveStatic(req, res);
});

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key || String(req.headers.upgrade || '').toLowerCase() !== 'websocket') { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );
  socket.setNoDelay(true);
  const client = {
    id: crypto.randomBytes(6).toString('hex'),
    socket, name: 'Anonim', role: 'dual', room: null, state: 'OPEN', frag: null
  };
  attachParser(client);
  socket.on('close', () => { client.state = 'CLOSED'; dropClient(client); });
  socket.on('error', () => { client.state = 'CLOSED'; dropClient(client); try { socket.destroy(); } catch (e) {} });
});

setInterval(() => {
  for (const room of rooms.values()) sendToRoom(room, { t: 'beat', ts: Date.now() });
}, 20000);

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[ERROR] Port ${PORT} sudah dipakai proses lain.`);
    console.error('        Kemungkinan server Stella Maris sudah berjalan, atau tutup aplikasi lain');
    console.error(`        yang memakai port ${PORT}. Coba: node server.js 8090\n`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  console.log('=========================================================');
  console.log(' Stella Maris SecOps App  -  Cyber Range Simulator');
  console.log(' simulator SIEM dan SOAR by GAIS+PaulNiek @SMITT Tobelo 2026');
  console.log('---------------------------------------------------------');
  console.log(` HTTP + WebSocket aktif di : http://localhost:${PORT}`);
  console.log(` Akses dari LAN siswa      : http://<IP-GURU>:${PORT}`);
  console.log(' Tekan Ctrl+C untuk menghentikan server.');
  console.log('=========================================================');
});
