import { Server } from 'socket.io';

let io = null;

export function initSocket(httpServer, origins) {
  io = new Server(httpServer, {
    cors: { origin: origins.includes('*') ? true : origins, methods: ['GET', 'POST'] },
  });
  io.on('connection', (socket) => {
    socket.on('subscribe', (serviceId) => {
      if (typeof serviceId === 'string' && serviceId.length < 64) socket.join(`service:${serviceId}`);
    });
    socket.on('subscribe:all', () => socket.join('all'));
  });
  return io;
}

/** Tell every interested client that something changed; clients refetch their own view. */
export function emitServiceUpdate(serviceId, extra = {}) {
  if (!io) return;
  const payload = { serviceId: String(serviceId), at: Date.now(), ...extra };
  io.to(`service:${serviceId}`).emit('queue:update', payload);
  io.to('all').emit('services:update', payload);
}
