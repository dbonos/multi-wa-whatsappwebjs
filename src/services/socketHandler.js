const { Server } = require('socket.io');

class SocketHandler {
    constructor(server) {
        this.io = new Server(server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });
        this.sessions = new Map(); // sessionId -> socketId[]
    }

    initialize() {
        this.io.on('connection', (socket) => {
            console.log('Client connected:', socket.id);

            // Join session room
            socket.on('join_session', (sessionId) => {
                socket.join(`session_${sessionId}`);
                if (!this.sessions.has(sessionId)) {
                    this.sessions.set(sessionId, []);
                }
                this.sessions.get(sessionId).push(socket.id);
                console.log(`Socket ${socket.id} joined session ${sessionId}`);
            });

            // Leave session room
            socket.on('leave_session', (sessionId) => {
                socket.leave(`session_${sessionId}`);
                const sockets = this.sessions.get(sessionId);
                if (sockets) {
                    const index = sockets.indexOf(socket.id);
                    if (index > -1) sockets.splice(index, 1);
                }
            });

            socket.on('disconnect', () => {
                console.log('Client disconnected:', socket.id);
                // Clean up from all sessions
                for (const [sessionId, sockets] of this.sessions.entries()) {
                    const index = sockets.indexOf(socket.id);
                    if (index > -1) {
                        sockets.splice(index, 1);
                        if (sockets.length === 0) {
                            this.sessions.delete(sessionId);
                        }
                    }
                }
            });
        });
    }

    // Emit QR code update to session room
    emitQRCode(sessionId, qrCode) {
        this.io.to(`session_${sessionId}`).emit('qr_code', {
            sessionId,
            qrCode,
            timestamp: Date.now()
        });
    }

    // Emit session status update
    emitSessionStatus(sessionId, status, data = {}) {
        this.io.to(`session_${sessionId}`).emit('session_status', {
            sessionId,
            status,
            ...data,
            timestamp: Date.now()
        });
    }

    // Emit message status update
    emitMessageStatus(messageId, status, sessionId) {
        this.io.to(`session_${sessionId}`).emit('message_status', {
            messageId,
            status,
            timestamp: Date.now()
        });
    }

    // Emit new incoming message
    emitNewMessage(sessionId, message) {
        this.io.to(`session_${sessionId}`).emit('new_message', {
            sessionId,
            message,
            timestamp: Date.now()
        });
    }

    // Emit message reaction
    emitReaction(sessionId, reaction) {
        this.io.to(`session_${sessionId}`).emit('message_reaction', {
            sessionId,
            messageId: reaction.messageId,
            from: reaction.from,
            reaction: {
                emoji: reaction.reaction?.emoji || reaction.reaction,
                text: reaction.reaction?.text || '',
            },
            timestamp: Date.now()
        });
    }

    // Emit message revoked (deleted/retracted)
    emitMessageRevoked(sessionId, data) {
        this.io.to(`session_${sessionId}`).emit('message_revoked', {
            sessionId,
            messageId: data.messageId,
            type: data.type,
            timestamp: Date.now()
        });
    }

    // Broadcast to all clients
    broadcast(event, data) {
        this.io.emit(event, data);
    }
}

module.exports = SocketHandler;

