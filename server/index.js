const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');
const { RoomManager } = require('./GameRoom');

const PORT = parseInt(process.env.PORT || '3000', 10);
const ROOT = path.join(__dirname, '..');
const roomManager = new RoomManager();

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(ROOT));

app.get('/api/health', (_req, res) => {
    res.json({ ok: true, rooms: roomManager.rooms.size });
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

function send(ws, payload) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
    }
}

wss.on('connection', (ws) => {
    ws.roomCode = null;
    ws.role = null;
    ws.playerId = null;

    ws.on('message', (raw) => {
        let msg;
        try {
            msg = JSON.parse(raw.toString());
        } catch {
            send(ws, { type: 'ERROR', code: 'invalid_json' });
            return;
        }

        if (msg.type === 'HOST_CREATE') {
            const room = roomManager.getOrCreate(null);
            room.addConnection(ws);
            const result = room.setHost(ws, msg.name);
            if (!result.ok) {
                send(ws, { type: 'ERROR', code: result.error });
                return;
            }
            ws.roomCode = room.code;
            send(ws, { type: 'JOINED', roomCode: room.code, role: 'host' });
            room.broadcastState();
            return;
        }

        if (msg.type === 'JOIN') {
            const roomCode = (msg.roomCode || '').toUpperCase().trim();
            if (!roomCode) {
                send(ws, { type: 'ERROR', code: 'missing_room' });
                return;
            }

            let room = roomManager.get(roomCode);
            if (!room) {
                if (msg.role === 'host') {
                    room = roomManager.getOrCreate(roomCode);
                } else {
                    send(ws, { type: 'ERROR', code: 'room_not_found' });
                    return;
                }
            }

            room.addConnection(ws);

            if (msg.role === 'host') {
                const result = room.setHost(ws, msg.name);
                if (!result.ok) {
                    send(ws, { type: 'ERROR', code: result.error });
                    room.removeConnection(ws);
                    return;
                }
            } else if (msg.role === 'player') {
                const result = room.addPlayer(ws, msg.name);
                if (!result.ok) {
                    send(ws, { type: 'ERROR', code: result.error });
                    room.removeConnection(ws);
                    return;
                }
            } else {
                send(ws, { type: 'ERROR', code: 'invalid_role' });
                room.removeConnection(ws);
                return;
            }

            ws.roomCode = room.code;
            send(ws, {
                type: 'JOINED',
                roomCode: room.code,
                role: msg.role,
                playerId: ws.playerId || null
            });
            room.broadcastState();
            return;
        }

        const room = ws.roomCode ? roomManager.get(ws.roomCode) : null;
        if (!room) {
            send(ws, { type: 'ERROR', code: 'not_in_room' });
            return;
        }

        const result = room.handleMessage(ws, msg);
        if (result && result.error) {
            send(ws, { type: 'ERROR', code: result.error });
        } else if (result && result.ok === false && result.error) {
            send(ws, { type: 'ERROR', code: result.error });
        }
    });

    ws.on('close', () => {
        const room = ws.roomCode ? roomManager.get(ws.roomCode) : null;
        if (room) {
            room.removeConnection(ws);
        }
    });
});

server.listen(PORT, () => {
    console.log(`Quiz server: http://localhost:${PORT}`);
    console.log(`WebSocket:   ws://localhost:${PORT}/ws`);
});
