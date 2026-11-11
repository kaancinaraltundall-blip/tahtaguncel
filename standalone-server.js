/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Standalone Node.js WebSocket Sunucusu (server.js)
 * ------------------------------------------------
 * Bu dosya frontend'den tamamen bağımsız olarak tek başına çalıştırılabilir:
 *   node standalone-server.js
 * 
 * Varsayılan Port: 1234 (PORT ortam değişkeni ile değiştirilebilir)
 * Tüm Yjs client'ları (y-websocket) bu sunucu üzerinden anında senkronize olur.
 */

import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

const PORT = process.env.PORT || 1234;

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

class YjsRoom {
  constructor(name) {
    this.name = name;
    this.doc = new Y.Doc();
    this.awareness = new awarenessProtocol.Awareness(this.doc);
    this.conns = new Set();

    // Döküman güncellendiğinde tüm bağlı istemcilere (gönderen hariç) yayınla
    this.doc.on('update', (update, origin) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeUpdate(encoder, update);
      const message = encoding.toUint8Array(encoder);

      for (const conn of this.conns) {
        if (conn !== origin && conn.readyState === WebSocket.OPEN) {
          try {
            conn.send(message, { binary: true });
          } catch (err) {
            console.error(`[${this.name}] Güncelleme iletim hatası:`, err);
          }
        }
      }
    });

    // Kullanıcı varlığı (imleç, rol, isim) güncellendiğinde yayınla
    this.awareness.on('update', ({ added, updated, removed }, origin) => {
      const changed = added.concat(updated, removed);
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed)
      );
      const message = encoding.toUint8Array(encoder);

      for (const conn of this.conns) {
        if (conn.readyState === WebSocket.OPEN) {
          try {
            conn.send(message, { binary: true });
          } catch (err) {
            console.error(`[${this.name}] Varlık iletim hatası:`, err);
          }
        }
      }
    });
  }

  addConnection(conn) {
    this.conns.add(conn);

    // 1. İlk senkronizasyon adımını istemciye gönder
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(encoder, this.doc);
    conn.send(encoding.toUint8Array(encoder), { binary: true });

    // 2. Mevcut kullanıcı varlık durumlarını yeni bağlanana bildir
    const states = this.awareness.getStates();
    if (states.size > 0) {
      const awarenessEncoder = encoding.createEncoder();
      encoding.writeVarUint(awarenessEncoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        awarenessEncoder,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, Array.from(states.keys()))
      );
      conn.send(encoding.toUint8Array(awarenessEncoder), { binary: true });
    }
  }

  handleMessage(conn, message) {
    try {
      const uint8 = new Uint8Array(message);
      const decoder = decoding.createDecoder(uint8);
      const messageType = decoding.readVarUint(decoder);

      if (messageType === MESSAGE_SYNC) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        syncProtocol.readSyncMessage(decoder, encoder, this.doc, conn);
        if (encoding.length(encoder) > 1) {
          conn.send(encoding.toUint8Array(encoder), { binary: true });
        }
      } else if (messageType === MESSAGE_AWARENESS) {
        awarenessProtocol.applyAwarenessUpdate(
          this.awareness,
          decoding.readVarUint8Array(decoder),
          conn
        );
      }
    } catch (e) {
      console.error(`[${this.name}] Mesaj ayrıştırma hatası:`, e);
    }
  }

  removeConnection(conn) {
    this.conns.delete(conn);
  }
}

// Oda Yöneticisi (Bellek İçi)
const rooms = new Map();
function getRoom(name) {
  let room = rooms.get(name);
  if (!room) {
    room = new YjsRoom(name);
    rooms.set(name, room);
    console.log(`[Sunucu] Yeni oda açıldı: "${name}"`);
  }
  return room;
}

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'online',
    service: 'EduBoard Yjs WebSocket Server',
    rooms: Array.from(rooms.keys()).map(name => ({
      name,
      connectedPeers: rooms.get(name).conns.size
    }))
  }));
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const roomName = url.pathname.replace(/^\/+/, '') || 'default-room';
  const role = url.searchParams.get('role') || 'misafir';

  console.log(`[Bağlantı] İstemci bağlandı: Oda="${roomName}", Rol="${role}"`);

  const room = getRoom(roomName);
  room.addConnection(ws);

  ws.on('message', (message) => {
    room.handleMessage(ws, message);
  });

  ws.on('close', () => {
    console.log(`[Ayrılma] İstemci ayrıldı: Oda="${roomName}"`);
    room.removeConnection(ws);
  });

  ws.on('error', (err) => {
    console.error(`[Soket Hatası]:`, err.message);
    room.removeConnection(ws);
  });
});

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`📡 Standalone Yjs WebSocket Sunucusu Hazır!`);
  console.log(`🚀 Port: ${PORT}`);
  console.log(`🔗 ws://localhost:${PORT}/[oda-adi]`);
  console.log(`====================================================`);
});
