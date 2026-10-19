import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { io as connect } from 'socket.io-client'
import { app, api, reset, user, skill, hoursFromNow, pool } from './helpers.js'
import { attachSockets } from '../src/socket.js'

let server, url
before(async () => {
  await reset()
  server = http.createServer(app)
  attachSockets(server)
  await new Promise(r => server.listen(0, r))
  url = `http://localhost:${server.address().port}`
})
after(async () => { server.close(); await pool.end() })

const once = (s, ev) => new Promise(r => s.once(ev, r))

test('notifications, session chat and WebRTC signaling relay', async () => {
  const t = await user('SockT'); const l = await user('SockL'); const x = await user('Outsider')
  const s = await skill(t, { slots: [hoursFromNow(0.05)] })
  const ts = connect(url, { auth: { token: t.token } })
  const ls = connect(url, { auth: { token: l.token } })
  const xs = connect(url, { auth: { token: x.token } })
  await Promise.all([once(ts, 'connect'), once(ls, 'connect'), once(xs, 'connect')])

  const note = once(ts, 'notification')
  const b = (await api().post('/api/bookings').set(l.auth).send({ slotId: s.slots[0].id })).body
  assert.equal((await note).type, 'booking_requested')

  const denied = await ls.emitWithAck('session:join', { bookingId: b.id })
  assert.ok(denied.error, 'cannot join before the booking is accepted')
  await api().post(`/api/bookings/${b.id}/accept`).set(t.auth)

  assert.ok((await ts.emitWithAck('session:join', { bookingId: b.id })).ok)
  const peer = once(ts, 'session:peer')
  assert.ok((await ls.emitWithAck('session:join', { bookingId: b.id })).ok)
  assert.equal((await peer).userId, l.id)
  assert.ok((await xs.emitWithAck('session:join', { bookingId: b.id })).error)

  const offer = once(ls, 'rtc:signal')
  ts.emit('rtc:signal', { bookingId: b.id, data: { type: 'offer', sdp: 'v=0' } })
  assert.deepEqual((await offer).data, { type: 'offer', sdp: 'v=0' })

  const msg = once(ts, 'chat:message')
  await ls.emitWithAck('chat:send', { bookingId: b.id, body: 'hello' })
  assert.equal((await msg).body, 'hello')
  const hist = await api().get(`/api/bookings/${b.id}/messages`).set(t.auth)
  assert.equal(hist.body.length, 1)
  for (const s of [ts, ls, xs]) s.close()
})
