// Stand-in for Socket.io in the demo. Tabs on the same origin talk through a
// BroadcastChannel, which is enough to carry WebRTC offers, answers and ICE
// candidates between two tabs on one machine.
import { demoRequest, onDemoEvent } from './backend.js'

export function connectDemoRealtime(token, user) {
  const channel = new BroadcastChannel('skillswap-demo-rt')
  const handlers = new Map()
  const rooms = new Set()
  const fire = (event, payload) => (handlers.get(event) || []).forEach(fn => fn(payload))
  const toRoom = (room, event, payload, includeSelf = false) => {
    channel.postMessage({ room, event, payload, from: user.id })
    if (includeSelf) fire(event, payload)
  }

  channel.onmessage = ({ data }) => {
    if (data.from === user.id || !rooms.has(data.room)) return
    fire(data.event, data.payload)
  }
  const offDemo = onDemoEvent(msg => {
    if (msg.type === 'notification' && msg.userId === user.id) fire('notification', msg.notification)
    if (msg.type === 'changed') fire('data:changed', {})
  })

  const actions = {
    async 'session:join'({ bookingId }) {
      const b = await demoRequest('GET', `/bookings/${bookingId}`, null, token).catch(() => null)
      if (!b || !['accepted', 'completed'].includes(b.status)) return { error: 'Not allowed in this session' }
      const room = `session:${bookingId}`
      rooms.add(room)
      toRoom(room, 'session:peer', { type: 'joined', userId: user.id })
      return { ok: true }
    },
    async 'session:leave'({ bookingId }) {
      const room = `session:${bookingId}`
      toRoom(room, 'session:peer', { type: 'left', userId: user.id })
      rooms.delete(room)
      return { ok: true }
    },
    async 'chat:send'({ bookingId, body }) {
      const room = `session:${bookingId}`
      if (!rooms.has(room)) return { error: 'Not in session' }
      const msg = await demoRequest('POST', `/bookings/${bookingId}/messages`, { body }, token)
      toRoom(room, 'chat:message', { bookingId, ...msg }, true)
      return { ok: true }
    },
    async 'rtc:signal'({ bookingId, data }) {
      toRoom(`session:${bookingId}`, 'rtc:signal', { from: user.id, data })
      return { ok: true }
    },
  }

  const leaveAll = () => rooms.forEach(room => channel.postMessage({ room, event: 'session:peer', payload: { type: 'left', userId: user.id }, from: user.id }))
  window.addEventListener('beforeunload', leaveAll)

  return {
    on(event, fn) {
      if (!handlers.has(event)) handlers.set(event, new Set())
      handlers.get(event).add(fn)
      return () => handlers.get(event).delete(fn)
    },
    request: (event, payload) => (actions[event] ? actions[event](payload) : Promise.resolve({ error: 'unknown event' })),
    send: (event, payload) => { actions[event]?.(payload) },
    close() {
      leaveAll()
      window.removeEventListener('beforeunload', leaveAll)
      offDemo()
      channel.close()
    },
  }
}
