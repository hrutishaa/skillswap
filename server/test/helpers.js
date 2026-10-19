import assert from 'node:assert/strict'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { pool } from '../src/db.js'
import { migrate } from '../src/migrate.js'

export const app = createApp()
export const api = () => request(app)

export async function reset() {
  await migrate({ reset: true })
}

let n = 0
export async function user(name = 'User') {
  const email = `${name.toLowerCase()}${++n}@test.dev`
  const res = await api().post('/api/auth/signup').send({ name, email, password: 'password123' })
  assert.equal(res.status, 200, JSON.stringify(res.body))
  return { ...res.body.user, token: res.body.token, auth: { Authorization: `Bearer ${res.body.token}` } }
}

export async function skill(teacher, { creditsPerHour = 20, slots = [] } = {}) {
  const res = await api().post('/api/skills').set(teacher.auth).send({
    title: 'Test skill', description: 'Something useful', category: 'Music', level: 'Beginner', creditsPerHour, slots,
  })
  assert.equal(res.status, 200, JSON.stringify(res.body))
  const detail = await api().get(`/api/skills/${res.body.id}`)
  return detail.body
}

export const hoursFromNow = h => ({ startsAt: new Date(Date.now() + h * 3600000).toISOString(), minutes: 60 })

export async function balance(u) {
  const { rows } = await pool.query('select balance from accounts where user_id = $1', [u.id])
  return rows[0].balance
}

// The properties that must hold after any sequence of operations.
export async function checkInvariants() {
  const { rows: [total] } = await pool.query('select coalesce(sum(balance), 0)::int as s from accounts')
  assert.equal(total.s, 0, 'all balances including mint sum to zero')
  const { rows: drift } = await pool.query(
    `select a.id from accounts a left join ledger_entries e on e.account_id = a.id
     group by a.id, a.balance having a.balance <> coalesce(sum(e.amount), 0)`)
  assert.deepEqual(drift, [], 'every balance equals the sum of its entries')
  const { rows: unbalanced } = await pool.query('select txn_id from ledger_entries group by txn_id having sum(amount) <> 0')
  assert.deepEqual(unbalanced, [], 'every transaction balances')
  const { rows: [neg] } = await pool.query(`select count(*)::int as c from accounts where kind <> 'mint' and balance < 0`)
  assert.equal(neg.c, 0, 'no negative balances')
  const { rows: [esc] } = await pool.query(`select balance from accounts where kind = 'escrow'`)
  const { rows: [held] } = await pool.query(
    `select coalesce(sum(credits), 0)::int as s from bookings where status in ('requested','accepted','completed','disputed')`)
  assert.equal(esc.balance, held.s, 'escrow equals credits of open bookings')
  const { rows: perBooking } = await pool.query(
    `select b.id from bookings b join ledger_entries e on e.booking_id = b.id
     join accounts a on a.id = e.account_id and a.kind = 'escrow'
     where b.status in ('declined','cancelled','settled','refunded')
     group by b.id having sum(e.amount) <> 0`)
  assert.deepEqual(perBooking, [], 'closed bookings leave nothing in escrow')
}

export { pool }
