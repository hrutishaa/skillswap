// Socket.io is attached at startup. Tests run without it.
let io = null
export function setIo(instance) { io = instance }

export function emitTo(userId, event, payload) {
  if (io) io.to(`user:${userId}`).emit(event, payload)
}

export async function notify(c, userId, type, body, bookingId = null) {
  const { rows: [n] } = await c.query(
    'insert into notifications (user_id, type, body, booking_id) values ($1, $2, $3, $4) returning *',
    [userId, type, body, bookingId])
  // Emit after the surrounding transaction has had a chance to commit.
  setImmediate(() => emitTo(userId, 'notification', n))
}
