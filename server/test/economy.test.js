import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { api, reset, user, skill, hoursFromNow, balance, checkInvariants, pool } from './helpers.js'
import { cancel, settleDue, complete } from '../src/bookings.js'
import { SIGNUP_BONUS, FIRST_TEACH_BONUS, DISPUTE_WINDOW_HOURS } from '../../shared/policy.js'

before(reset)
after(() => pool.end())

test('signup grants the bonus through the ledger', async () => {
  const u = await user('Ana')
  assert.equal(await balance(u), SIGNUP_BONUS)
  const w = await api().get('/api/wallet').set(u.auth)
  assert.equal(w.body.entries.length, 1)
  assert.equal(w.body.entries[0].kind, 'signup_bonus')
  await checkInvariants()
})

test('booking holds credits in escrow and decline refunds them', async () => {
  const t = await user('Teach'); const l = await user('Learn')
  const s = await skill(t, { creditsPerHour: 30, slots: [hoursFromNow(48)] })
  const b = await api().post('/api/bookings').set(l.auth).send({ slotId: s.slots[0].id })
  assert.equal(b.status, 200)
  assert.equal(b.body.credits, 30)
  assert.equal(await balance(l), SIGNUP_BONUS - 30)
  const w = await api().get('/api/wallet').set(l.auth)
  assert.equal(w.body.held, 30)
  await checkInvariants()
  const forbidden = await api().post(`/api/bookings/${b.body.id}/decline`).set(l.auth)
  assert.equal(forbidden.status, 403)
  const d = await api().post(`/api/bookings/${b.body.id}/decline`).set(t.auth)
  assert.equal(d.body.status, 'declined')
  assert.equal(await balance(l), SIGNUP_BONUS)
  await checkInvariants()
})

test('cannot overspend and cannot book own skill', async () => {
  const t = await user('Pricey'); const l = await user('Broke')
  const s = await skill(t, { creditsPerHour: 100, slots: [hoursFromNow(30), hoursFromNow(31)] })
  await pool.query(`update skill_slots set minutes = 120 where id = $1`, [s.slots[0].id])
  const r = await api().post('/api/bookings').set(l.auth).send({ slotId: s.slots[0].id })
  assert.equal(r.status, 409)
  assert.match(r.body.error, /Not enough credits/)
  assert.equal(await balance(l), SIGNUP_BONUS)
  const own = await api().post('/api/bookings').set(t.auth).send({ slotId: s.slots[1].id })
  assert.equal(own.status, 400)
  await checkInvariants()
})

test('full flow: accept, complete, review releases credits plus first lesson bonus', async () => {
  const t = await user('Mentor'); const l = await user('Student')
  const s = await skill(t, { creditsPerHour: 20, slots: [hoursFromNow(0.1), hoursFromNow(0.2)] })
  const b = (await api().post('/api/bookings').set(l.auth).send({ slotId: s.slots[0].id })).body
  assert.equal((await api().post(`/api/bookings/${b.id}/complete`).set(t.auth)).status, 409, 'cannot complete before accept')
  assert.equal((await api().post(`/api/bookings/${b.id}/accept`).set(t.auth)).body.status, 'accepted')
  const detail = await api().get(`/api/bookings/${b.id}`).set(l.auth)
  assert.equal(detail.body.joinable, true)
  assert.equal((await api().post(`/api/bookings/${b.id}/complete`).set(t.auth)).body.status, 'completed')
  assert.equal(await balance(t), SIGNUP_BONUS, 'still in escrow during dispute window')
  const rv = await api().post(`/api/bookings/${b.id}/review`).set(l.auth).send({ rating: 5, comment: 'Great' })
  assert.equal(rv.status, 200)
  assert.equal(await balance(t), SIGNUP_BONUS + 20 + FIRST_TEACH_BONUS)
  assert.equal(await balance(l), SIGNUP_BONUS - 20)
  const again = await api().post(`/api/bookings/${b.id}/review`).set(l.auth).send({ rating: 1 })
  assert.equal(again.status, 409)
  const sk = await api().get(`/api/skills/${s.id}`)
  assert.equal(sk.body.rating, 5)
  assert.equal(sk.body.reviews.length, 1)
  assert.equal(sk.body.slots.length, 1, 'booked slot no longer offered')

  // Second lesson pays no extra bonus.
  const b2 = (await api().post('/api/bookings').set(l.auth).send({ slotId: s.slots[1].id })).body
  await api().post(`/api/bookings/${b2.id}/accept`).set(t.auth)
  await api().post(`/api/bookings/${b2.id}/complete`).set(l.auth)
  await api().post(`/api/bookings/${b2.id}/confirm`).set(l.auth)
  assert.equal(await balance(t), SIGNUP_BONUS + 40 + FIRST_TEACH_BONUS)
  await checkInvariants()
})

test('cancellation policy', async () => {
  const t = await user('Cancelee'); const l = await user('Canceller')
  const s = await skill(t, { creditsPerHour: 40, slots: [hoursFromNow(48), hoursFromNow(5), hoursFromNow(1), hoursFromNow(3), hoursFromNow(4)] })
  const book = async slot => {
    const b = (await api().post('/api/bookings').set(l.auth).send({ slotId: slot.id })).body
    await api().post(`/api/bookings/${b.id}/accept`).set(t.auth)
    return b
  }
  const [late, pending, byTeacher, mid, far] = s.slots // ordered by start time
  const bFar = await book(far)
  assert.equal((await api().post(`/api/bookings/${bFar.id}/cancel`).set(l.auth)).body.refunded, 40)
  const bMid = await book(mid)
  assert.equal((await api().post(`/api/bookings/${bMid.id}/cancel`).set(l.auth)).body.refunded, 20)
  const bLate = await book(late)
  assert.equal((await cancel(l.id, bLate.id)).refunded, 0)
  const bPending = (await api().post('/api/bookings').set(l.auth).send({ slotId: pending.id })).body
  assert.equal((await api().post(`/api/bookings/${bPending.id}/cancel`).set(l.auth)).body.refunded, 40)
  const bT = await book(byTeacher)
  assert.equal((await api().post(`/api/bookings/${bT.id}/cancel`).set(t.auth)).body.refunded, 40)
  assert.equal(await balance(l), SIGNUP_BONUS - 20 - 40)
  assert.equal(await balance(t), SIGNUP_BONUS + 20 + 40)
  const twice = await api().post(`/api/bookings/${bFar.id}/cancel`).set(l.auth)
  assert.equal(twice.status, 409)
  await checkInvariants()
})

test('dispute holds credits until a moderator resolves; undisputed bookings auto release', async () => {
  const t = await user('Disputed'); const l = await user('Unhappy')
  const s = await skill(t, { creditsPerHour: 30, slots: [hoursFromNow(0), hoursFromNow(0.1)] })
  const mk = async slot => {
    const b = (await api().post('/api/bookings').set(l.auth).send({ slotId: slot.id })).body
    await api().post(`/api/bookings/${b.id}/accept`).set(t.auth)
    await api().post(`/api/bookings/${b.id}/complete`).set(t.auth)
    return b
  }
  const b = await mk(s.slots[0])
  const d = await api().post(`/api/bookings/${b.id}/dispute`).set(l.auth).send({ reason: 'Teacher never showed up' })
  assert.equal(d.body.status, 'disputed')
  await settleDue(Date.now() + (DISPUTE_WINDOW_HOURS + 1) * 3600000)
  assert.equal(await balance(t), SIGNUP_BONUS, 'disputed credits are not auto released')
  const notAdmin = await api().post(`/api/admin/bookings/${b.id}/resolve`).set(t.auth).send({ refund: 0 })
  assert.equal(notAdmin.status, 403)
  await pool.query(`update users set role = 'admin' where id = $1`, [l.id])
  const relog = await api().post('/api/auth/login').send({ email: l.email, password: 'password123' })
  const res = await api().post(`/api/admin/bookings/${b.id}/resolve`).set({ Authorization: `Bearer ${relog.body.token}` }).send({ refund: 20 })
  assert.equal(res.body.refunded, 20)
  assert.equal(await balance(t), SIGNUP_BONUS + 10)

  const b2 = await mk(s.slots[1])
  assert.equal(await settleDue(Date.now() + 3600000), 0)
  const late = await api().post(`/api/bookings/${b2.id}/dispute`).set(l.auth)
  assert.equal(late.status, 200)
  await checkInvariants()
})

test('auto release after the dispute window', async () => {
  const t = await user('Auto'); const l = await user('Quiet')
  const s = await skill(t, { creditsPerHour: 10, slots: [hoursFromNow(0)] })
  const b = (await api().post('/api/bookings').set(l.auth).send({ slotId: s.slots[0].id })).body
  await api().post(`/api/bookings/${b.id}/accept`).set(t.auth)
  await complete(t.id, b.id)
  assert.equal(await settleDue(Date.now() + (DISPUTE_WINDOW_HOURS + 1) * 3600000), 1)
  assert.equal(await balance(t), SIGNUP_BONUS + 10 + FIRST_TEACH_BONUS)
  const late = await api().post(`/api/bookings/${b.id}/dispute`).set(l.auth)
  assert.equal(late.status, 409)
  await checkInvariants()
})

test('concurrent bookings by one learner never overspend', async () => {
  const t = await user('Busy'); const l = await user('Greedy')
  const slots = Array.from({ length: 12 }, (_, i) => hoursFromNow(30 + i))
  const s = await skill(t, { creditsPerHour: 30, slots })
  const results = await Promise.all(s.slots.map(sl => api().post('/api/bookings').set(l.auth).send({ slotId: sl.id })))
  const ok = results.filter(r => r.status === 200).length
  assert.equal(ok, Math.floor(SIGNUP_BONUS / 30))
  assert.ok(results.every(r => r.status === 200 || r.status === 409))
  assert.equal(await balance(l), SIGNUP_BONUS - ok * 30)
  await checkInvariants()
})

test('concurrent bookings of the same slot: exactly one wins', async () => {
  const t = await user('Popular')
  const learners = await Promise.all(Array.from({ length: 8 }, (_, i) => user(`Fan${i}`)))
  const s = await skill(t, { creditsPerHour: 25, slots: [hoursFromNow(40)] })
  const results = await Promise.all(learners.map(l => api().post('/api/bookings').set(l.auth).send({ slotId: s.slots[0].id })))
  assert.equal(results.filter(r => r.status === 200).length, 1)
  const balances = await Promise.all(learners.map(balance))
  assert.equal(balances.filter(b => b === SIGNUP_BONUS - 25).length, 1)
  assert.equal(balances.filter(b => b === SIGNUP_BONUS).length, 7)
  await checkInvariants()
})

test('concurrent accept, cancel and decline on one booking settle exactly once', async () => {
  const t = await user('Racer'); const l = await user('Racer2')
  const s = await skill(t, { creditsPerHour: 20, slots: Array.from({ length: 6 }, (_, i) => hoursFromNow(50 + i)) })
  for (const sl of s.slots) {
    const b = (await api().post('/api/bookings').set(l.auth).send({ slotId: sl.id })).body
    const rs = await Promise.all([
      api().post(`/api/bookings/${b.id}/decline`).set(t.auth),
      api().post(`/api/bookings/${b.id}/cancel`).set(l.auth),
      api().post(`/api/bookings/${b.id}/cancel`).set(l.auth),
      api().post(`/api/bookings/${b.id}/accept`).set(t.auth),
    ])
    assert.ok(rs.some(r => r.status === 200))
    await checkInvariants()
  }
})

test('ledger entries cannot be edited', async () => {
  await assert.rejects(pool.query('update ledger_entries set amount = 999'), /append only/)
  await assert.rejects(pool.query('delete from ledger_entries'), /append only/)
})

test('search and filters', async () => {
  const t = await user('Searcher')
  await api().post('/api/skills').set(t.auth).send({ title: 'Watercolor Basics', description: 'Paint', category: 'Arts', level: 'Advanced', creditsPerHour: 12 })
  const q = await api().get('/api/skills?q=watercolor')
  assert.equal(q.body.length, 1)
  assert.equal((await api().get('/api/skills?category=Arts&level=Advanced&maxCredits=12')).body.length, 1)
  assert.equal((await api().get('/api/skills?category=Arts&maxCredits=5')).body.length, 0)
  const bad = await api().post('/api/skills').set(t.auth).send({ title: 'x', description: 'y', category: 'Nope', level: 'Beginner', creditsPerHour: 5 })
  assert.equal(bad.status, 400)
})
