'use strict';
/* Stella Maris SecOps App - net.js
 * Lapisan transportasi real-time.
 * Prioritas 1: WebSocket ke server relay (multi-user lintas perangkat, Room ID sama).
 * Prioritas 2: BroadcastChannel (dual-tab / satu PC, mode file:// tanpa server).
 */
window.Net = (function () {
  const H = { onMessage: () => {}, onStatus: () => {}, onPeers: () => {} };
  let ws = null, bc = null;
  let mode = 'offline';            // 'ws' | 'bc' | 'offline'
  let room = '';
  let selfId = '';
  let hostId = '';
  let connected = false;
  let selfName = 'Anonim', selfRole = 'dual';
  let reconnectTries = 0;
  let pendingQueue = [];
  let heartbeat = null;

  function wsUrl() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/`;
  }

  function setStatus(s, detail) {
    mode = s;
    H.onStatus({ mode: s, detail: detail || '', room, connected, isHost: selfId && selfId === hostId });
  }

  function openBroadcast() {
    if (bc) return;
    try {
      bc = new BroadcastChannel('smarsec-' + room);
      bc.onmessage = (ev) => {
        const m = ev.data;
        if (!m || m.__from === selfId) return;
        if (m.t === 'peers') { hostId = m.host; H.onPeers(m.peers, m.host); return; }
        H.onMessage(m);
      };
      if (mode === 'offline') setStatus('bc', 'Mode lokal (BroadcastChannel) - satu perangkat');
    } catch (e) {
      setStatus('offline', 'Browser tidak mendukung BroadcastChannel');
    }
  }

  function connect() {
    if (location.protocol === 'file:') {
      openBroadcast();
      // Pada file:// tidak ada host election: pembuat ruang menjadi host.
      hostId = selfId;
      announceBC();
      setStatus('bc', 'Mode lokal (file://) - gunakan Dual View untuk dua kubu');
      return;
    }
    setStatus('offline', 'Menghubungkan ke relay server…');
    try { ws = new WebSocket(wsUrl()); } catch (e) { openBroadcast(); hostId = selfId; announceBC(); setStatus('bc', 'Fallback mode lokal'); return; }

    const timeout = setTimeout(() => {
      if (!connected) { try { ws.close(); } catch (e) {} }
    }, 3500);

    ws.onopen = () => {
      clearTimeout(timeout);
      connected = true; reconnectTries = 0;
      ws.send(JSON.stringify({ t: 'join', room, name: selfName, role: selfRole }));
      setStatus('ws', 'Tersambung ke relay server');
      heartbeat = setInterval(() => { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'ping' })); }, 15000);
      while (pendingQueue.length) ws.send(JSON.stringify(pendingQueue.shift()));
    };
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.t === 'joined') { selfId = m.you; hostId = m.host; H.onPeers(m.peers, m.host); }
      if (m.t === 'peers') { hostId = m.host; H.onPeers(m.peers, m.host); }
      if (m.t === 'beat' || m.t === 'pong') return;
      H.onMessage(m);
    };
    ws.onclose = () => {
      clearInterval(heartbeat);
      connected = false;
      if (!room) return;
      if (reconnectTries < 3) {
        reconnectTries++;
        setStatus('offline', `Koneksi terputus - mencoba ulang (${reconnectTries}/3)…`);
        setTimeout(connect, 900 * reconnectTries);
      } else {
        openBroadcast();
        if (!hostId) { hostId = selfId; announceBC(); }
        setStatus('bc', 'Relay tidak tersedia - fallback mode lokal');
      }
    };
    ws.onerror = () => { try { ws.close(); } catch (e) {} };
  }

  function announceBC() {
    if (!bc) return;
    bc.postMessage({ t: 'peers', room, host: hostId, peers: [{ id: selfId, name: selfName, role: selfRole, host: true }], __from: selfId });
  }

  function send(obj) {
    obj.__from = selfId;
    if (connected && ws && ws.readyState === 1) { ws.send(JSON.stringify(obj)); return true; }
    if (mode === 'ws') { pendingQueue.push(obj); if (pendingQueue.length > 60) pendingQueue.shift(); return false; }
    if (bc) { bc.postMessage(obj); return true; }
    return false;
  }

  return {
    init(handlers) { Object.assign(H, handlers || {}); },
    join(roomId, name, role) {
      room = String(roomId || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24) || 'LOBBY';
      selfName = name || 'Anonim'; selfRole = role || 'dual';
      if (!selfId) selfId = 'l' + Math.random().toString(36).slice(2, 10);
      connect();
      return room;
    },
    send,
    leave() {
      send({ t: 'leave' });
      try { if (ws) ws.close(); } catch (e) {}
      try { if (bc) bc.close(); } catch (e) {}
      ws = null; bc = null; connected = false; room = '';
      clearInterval(heartbeat);
      setStatus('offline', 'Keluar dari ruang');
    },
    get room() { return room; },
    get selfId() { return selfId; },
    get hostId() { return hostId; },
    get isHost() { return !!selfId && selfId === hostId; },
    get mode() { return mode; },
    get connected() { return connected; },
    get selfRole() { return selfRole; },
    setRole(r) { selfRole = r; }
  };
})();
