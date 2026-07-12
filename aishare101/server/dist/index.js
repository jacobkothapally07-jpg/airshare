"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
// Health check endpoint
app.get('/health', (req, res) => {
    res.send({ status: 'ok', timestamp: new Date() });
});
const httpServer = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
});
// Map to track which room a socket is currently in
// socketId -> roomCode
const socketRoomMap = new Map();
io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);
    // Join a room with roomCode
    socket.on('join-room', (roomCode) => {
        // Normalize room code to uppercase
        const code = roomCode.trim().toUpperCase();
        if (!code) {
            socket.emit('error-msg', 'Invalid room code');
            return;
        }
        console.log(`Socket ${socket.id} joining room: ${code}`);
        // Leave previous room if any
        const previousRoom = socketRoomMap.get(socket.id);
        if (previousRoom) {
            socket.leave(previousRoom);
            socket.to(previousRoom).emit('peer-left', socket.id);
        }
        socket.join(code);
        socketRoomMap.set(socket.id, code);
        // Get all other sockets currently in this room
        const room = io.sockets.adapter.rooms.get(code);
        const existingPeers = room ? Array.from(room).filter(id => id !== socket.id) : [];
        // Tell the joining client who is already in the room
        socket.emit('room-joined', { roomCode: code, peers: existingPeers });
        // Tell all other clients in the room that a new peer has joined
        socket.to(code).emit('peer-joined', socket.id);
    });
    // Relay signaling message to target peer
    socket.on('signal', ({ targetId, signalData }) => {
        console.log(`Relaying signal from ${socket.id} to ${targetId}`);
        io.to(targetId).emit('signal', {
            senderId: socket.id,
            signalData,
        });
    });
    // Explicitly leave a room
    socket.on('leave-room', () => {
        const code = socketRoomMap.get(socket.id);
        if (code) {
            console.log(`Socket ${socket.id} leaving room: ${code}`);
            socket.leave(code);
            socketRoomMap.delete(socket.id);
            socket.to(code).emit('peer-left', socket.id);
        }
    });
    // Handle client disconnect
    socket.on('disconnect', () => {
        console.log(`Socket disconnected: ${socket.id}`);
        const code = socketRoomMap.get(socket.id);
        if (code) {
            socketRoomMap.delete(socket.id);
            socket.to(code).emit('peer-left', socket.id);
        }
    });
});
const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
    console.log(`Signaling server running on port ${PORT}`);
});
