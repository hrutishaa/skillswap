import { Server } from 'socket.io'
import { verify } from './auth.js'
import { pool } from './db.js'
import { setIo } from './events.js'

// Rooms: user:<id> for notifications, session:<bookingId> for chat and WebRTC signaling.
export function attachSockets(httpServer) {
  const io = new Server(httpServer, { cors: { origin: '*' } })
  setIo(io)

  io.use((socket, next) => {
    try {
      socket.user = verify(socket.handshake.auth?.token)
      next()
    } catch {
      next(new Error('unauthorized'))
    }
  })

  io.on('connection', socket => {
    const uid = socket.user.id
    socket.join(`user:${uid}`)

    const member = async bookingId => {
      const { rows: [b] } = await pool.query('select learner_id, teacher_id, status from bookings where id = $1', [bookingId])
      return b && (b.learner_id === uid || b.teacher_id === uid) && ['accepted', 'completed'].includes(b.status)
    }

    socket.on('session:join', async ({ bookingId }, ack) => {
      if (!(await member(bookingId))) return ack?.({ error: 'Not allowed in this session' })
      const room = `session:${bookingId}`
      socket.join(room)
      socket.data.sessions = [...(socket.data.sessions || []), room]
      socket.to(room).emit('session:peer', { type: 'joined', userId: uid })
      ack?.({ ok: true })
    })

    socket.on('session:leave', ({ bookingId }) => {
      const room = `session:${bookingId}`
      socket.to(room).emit('session:peer', { type: 'left', userId: uid })
      socket.leave(room)
    })

    socket.on('chat:send', async ({ bookingId, body }, ack) => {
      const room = `session:${bookingId}`
      if (!socket.rooms.has(room) || !body?.trim()) return ack?.({ error: 'Not in session' })
      const { rows: [m] } = await pool.query(
        `insert into messages (booking_id, sender_id, body) values ($1, $2, $3)
         returning id, body, sender_id, created_at, (select name from users where id = $2) as sender_name`,
        [bookingId, uid, body.trim().slice(0, 2000)])
      const msg = { id: m.id, body: m.body, senderId: m.sender_id, senderName: m.sender_name, createdAt: m.created_at }
      io.to(room).emit('chat:message', { bookingId, ...msg })
      ack?.({ ok: true })
    })

    // Offer, answer and ICE candidates are relayed untouched to the other participant.
    socket.on('rtc:signal', ({ bookingId, data }) => {
      const room = `session:${bookingId}`
      if (socket.rooms.has(room)) socket.to(room).emit('rtc:signal', { from: uid, data })
    })

    socket.on('disconnecting', () => {
      for (const room of socket.rooms) {
        if (room.startsWith('session:')) socket.to(room).emit('session:peer', { type: 'left', userId: uid })
      }
    })
  })
  return io
}
