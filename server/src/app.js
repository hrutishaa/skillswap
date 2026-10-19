import express from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import { pool, tx, HttpError } from './db.js'
import { post } from './ledger.js'
import { sign, requireUser, requireAdmin } from './auth.js'
import * as bk from './bookings.js'
import { SIGNUP_BONUS, CATEGORIES, LEVELS } from '../../shared/policy.js'

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).then(data => res.json(data ?? { ok: true })).catch(next)

const publicUser = u => ({ id: u.id, name: u.name, email: u.email, bio: u.bio, role: u.role, createdAt: u.created_at })

const SKILL_SELECT = `
  select s.*, u.name as teacher_name,
    coalesce(r.avg, 0)::float as rating, coalesce(r.n, 0)::int as review_count
  from skills s
  join users u on u.id = s.teacher_id
  left join (select skill_id, round(avg(rating), 1) as avg, count(*) as n from reviews group by skill_id) r on r.skill_id = s.id`

const skillOut = s => ({
  id: s.id, teacherId: s.teacher_id, teacherName: s.teacher_name, title: s.title, description: s.description,
  category: s.category, level: s.level, creditsPerHour: s.credits_per_hour, active: s.active,
  rating: s.rating, reviewCount: s.review_count, createdAt: s.created_at,
})

const bookingOut = b => ({
  id: b.id, skillId: b.skill_id, slotId: b.slot_id, title: b.title, learnerId: b.learner_id, learnerName: b.learner_name,
  teacherId: b.teacher_id, teacherName: b.teacher_name, credits: b.credits, startsAt: b.starts_at, minutes: b.minutes,
  status: b.status, note: b.note, refunded: b.refunded, disputeReason: b.dispute_reason, createdAt: b.created_at,
  completedAt: b.completed_at, settledAt: b.settled_at, reviewed: b.reviewed ?? false,
})

const BOOKING_SELECT = `
  select b.*, s.title, l.name as learner_name, t.name as teacher_name,
    exists (select 1 from reviews r where r.booking_id = b.id) as reviewed
  from bookings b join skills s on s.id = b.skill_id
  join users l on l.id = b.learner_id join users t on t.id = b.teacher_id`

async function reviewsFor(column, id) {
  const { rows } = await pool.query(
    `select r.*, u.name as reviewer_name, s.title from reviews r join users u on u.id = r.reviewer_id
     join skills s on s.id = r.skill_id where r.${column} = $1 order by r.created_at desc limit 50`, [id])
  return rows.map(r => ({ id: r.id, rating: r.rating, comment: r.comment, reviewerName: r.reviewer_name, skillTitle: r.title, createdAt: r.created_at }))
}

export async function createUser({ name, email, password, bio = '', role = 'user' }) {
  if (!name?.trim() || !email?.includes('@') || !password || password.length < 8) {
    throw new HttpError(400, 'Name, a valid email and a password of at least 8 characters are required')
  }
  const hash = await bcrypt.hash(password, 10)
  return tx(async c => {
    const { rows: [u] } = await c.query(
      'insert into users (name, email, password_hash, bio, role) values ($1, lower($2), $3, $4, $5) returning *',
      [name.trim(), email.trim(), hash, bio, role]).catch(e => {
      if (e.code === '23505') throw new HttpError(409, 'That email is already registered')
      throw e
    })
    await c.query(`insert into accounts (kind, user_id) values ('user', $1)`, [u.id])
    await post(c, { kind: 'signup_bonus', memo: 'Welcome bonus', legs: [{ from: 'mint', to: u.id, amount: SIGNUP_BONUS }] })
    return u
  })
}

export function createApp() {
  const app = express()
  app.use(cors())
  app.use(express.json({ limit: '100kb' }))
  const r = express.Router()

  r.get('/health', wrap(async () => ({ ok: true })))
  r.get('/meta', wrap(async () => ({ categories: CATEGORIES, levels: LEVELS, signupBonus: SIGNUP_BONUS })))

  r.post('/auth/signup', wrap(async req => {
    const u = await createUser(req.body)
    return { token: sign(u), user: publicUser(u) }
  }))

  r.post('/auth/login', wrap(async req => {
    const { rows: [u] } = await pool.query('select * from users where email = lower($1)', [req.body.email || ''])
    if (!u || !(await bcrypt.compare(req.body.password || '', u.password_hash))) throw new HttpError(401, 'Wrong email or password')
    return { token: sign(u), user: publicUser(u) }
  }))

  r.get('/me', requireUser, wrap(async req => {
    const { rows: [u] } = await pool.query('select * from users where id = $1', [req.user.id])
    if (!u) throw new HttpError(401, 'Please log in')
    const { rows: [a] } = await pool.query('select balance from accounts where user_id = $1', [u.id])
    return { ...publicUser(u), balance: a.balance }
  }))

  r.patch('/me', requireUser, wrap(async req => {
    const { name, bio } = req.body
    const { rows: [u] } = await pool.query(
      'update users set name = coalesce(nullif($2, \'\'), name), bio = coalesce($3, bio) where id = $1 returning *',
      [req.user.id, name?.trim() || '', bio ?? null])
    return publicUser(u)
  }))

  r.get('/users/:id', wrap(async req => {
    const { rows: [u] } = await pool.query('select * from users where id = $1', [req.params.id])
    if (!u) throw new HttpError(404, 'User not found')
    const skills = (await pool.query(`${SKILL_SELECT} where s.teacher_id = $1 and s.active order by s.id`, [u.id])).rows.map(skillOut)
    const reviews = await reviewsFor('teacher_id', u.id)
    const { rows: [st] } = await pool.query(
      `select count(*) filter (where teacher_id = $1 and status = 'settled')::int as taught,
              count(*) filter (where learner_id = $1 and status = 'settled')::int as learned from bookings`, [u.id])
    const rating = reviews.length ? Math.round(reviews.reduce((s, r) => s + r.rating, 0) / reviews.length * 10) / 10 : 0
    return { id: u.id, name: u.name, bio: u.bio, createdAt: u.created_at, skills, reviews, rating, ...st }
  }))

  r.get('/skills', wrap(async req => {
    const { q, category, level, maxCredits, sort } = req.query
    const where = ['s.active']
    const args = []
    if (q) { args.push(`%${q}%`); where.push(`(s.title ilike $${args.length} or s.description ilike $${args.length} or u.name ilike $${args.length})`) }
    if (category) { args.push(category); where.push(`s.category = $${args.length}`) }
    if (level) { args.push(level); where.push(`s.level = $${args.length}`) }
    if (maxCredits) { args.push(Number(maxCredits)); where.push(`s.credits_per_hour <= $${args.length}`) }
    const order = { rating: 'rating desc, review_count desc', cheap: 's.credits_per_hour asc', new: 's.created_at desc' }[sort] || 'review_count desc, rating desc'
    const { rows } = await pool.query(`${SKILL_SELECT} where ${where.join(' and ')} order by ${order}, s.id`, args)
    return rows.map(skillOut)
  }))

  r.get('/skills/:id', wrap(async req => {
    const { rows: [s] } = await pool.query(`${SKILL_SELECT} where s.id = $1`, [req.params.id])
    if (!s) throw new HttpError(404, 'Skill not found')
    const { rows: slots } = await pool.query(
      `select sl.id, sl.starts_at, sl.minutes from skill_slots sl
       where sl.skill_id = $1 and sl.starts_at + make_interval(mins => sl.minutes) > now()
         and not exists (select 1 from bookings b where b.slot_id = sl.id and b.status in ('requested','accepted','completed','settled','disputed'))
       order by sl.starts_at limit 30`, [s.id])
    return {
      ...skillOut(s),
      slots: slots.map(x => ({ id: x.id, startsAt: x.starts_at, minutes: x.minutes })),
      reviews: await reviewsFor('skill_id', s.id),
    }
  }))

  const validSkill = b => {
    if (!b.title?.trim() || !b.description?.trim()) throw new HttpError(400, 'Title and description are required')
    if (!CATEGORIES.includes(b.category)) throw new HttpError(400, 'Unknown category')
    if (!LEVELS.includes(b.level)) throw new HttpError(400, 'Unknown level')
    const cph = Number(b.creditsPerHour)
    if (!Number.isInteger(cph) || cph < 1 || cph > 100) throw new HttpError(400, 'Credits per hour must be 1 to 100')
  }

  async function addSlots(c, skillId, slots = []) {
    for (const sl of slots.slice(0, 50)) {
      const t = new Date(sl.startsAt)
      if (isNaN(t)) throw new HttpError(400, 'Bad slot time')
      await c.query('insert into skill_slots (skill_id, starts_at, minutes) values ($1, $2, $3)', [skillId, t, Number(sl.minutes) || 60])
    }
  }

  r.post('/skills', requireUser, wrap(async req => {
    validSkill(req.body)
    const b = req.body
    const id = await tx(async c => {
      const { rows: [s] } = await c.query(
        `insert into skills (teacher_id, title, description, category, level, credits_per_hour)
         values ($1, $2, $3, $4, $5, $6) returning id`,
        [req.user.id, b.title.trim(), b.description.trim(), b.category, b.level, Number(b.creditsPerHour)])
      await addSlots(c, s.id, b.slots)
      return s.id
    })
    return skillOut((await pool.query(`${SKILL_SELECT} where s.id = $1`, [id])).rows[0])
  }))

  r.post('/skills/:id/slots', requireUser, wrap(async req => {
    const { rows: [s] } = await pool.query('select * from skills where id = $1', [req.params.id])
    if (!s || s.teacher_id !== req.user.id) throw new HttpError(403, 'Not your skill')
    await tx(c => addSlots(c, s.id, req.body.slots))
  }))

  r.get('/bookings', requireUser, wrap(async req => {
    await bk.settleDue()
    const col = req.query.role === 'teacher' ? 'b.teacher_id' : req.query.role === 'learner' ? 'b.learner_id' : null
    const where = col ? `${col} = $1` : '(b.learner_id = $1 or b.teacher_id = $1)'
    const { rows } = await pool.query(`${BOOKING_SELECT} where ${where} order by b.starts_at desc`, [req.user.id])
    return rows.map(bookingOut)
  }))

  r.get('/bookings/:id', requireUser, wrap(async req => {
    await bk.assertParticipant(req.user.id, Number(req.params.id))
    const { rows: [b] } = await pool.query(`${BOOKING_SELECT} where b.id = $1`, [req.params.id])
    return { ...bookingOut(b), joinable: bk.joinable(b) }
  }))

  r.post('/bookings', requireUser, wrap(async req => bookingOut(await bk.createBooking(req.user.id, req.body))))

  const action = (name, fn) => r.post(`/bookings/:id/${name}`, requireUser, wrap(async req => bookingOut(await fn(req.user.id, Number(req.params.id), req.body))))
  action('accept', bk.accept)
  action('decline', bk.decline)
  action('cancel', (u, id) => bk.cancel(u, id))
  action('complete', (u, id) => bk.complete(u, id))
  action('confirm', bk.confirm)
  action('dispute', (u, id, body) => bk.dispute(u, id, body?.reason))

  r.post('/bookings/:id/review', requireUser, wrap(async req => bk.review(req.user.id, Number(req.params.id), req.body)))

  r.get('/bookings/:id/messages', requireUser, wrap(async req => {
    await bk.assertParticipant(req.user.id, Number(req.params.id))
    const { rows } = await pool.query(
      `select m.id, m.body, m.sender_id, u.name as sender_name, m.created_at from messages m join users u on u.id = m.sender_id
       where booking_id = $1 order by m.id`, [req.params.id])
    return rows.map(m => ({ id: m.id, body: m.body, senderId: m.sender_id, senderName: m.sender_name, createdAt: m.created_at }))
  }))

  r.post('/admin/bookings/:id/resolve', requireUser, requireAdmin, wrap(async req => bookingOut(await bk.resolve(Number(req.params.id), Number(req.body.refund)))))

  r.get('/wallet', requireUser, wrap(async req => {
    await bk.settleDue()
    const uid = req.user.id
    const { rows: [a] } = await pool.query('select id, balance from accounts where user_id = $1', [uid])
    const { rows: [h] } = await pool.query(
      `select coalesce(sum(credits) filter (where learner_id = $1 and status in ('requested','accepted','completed','disputed')), 0)::int as held,
              coalesce(sum(credits) filter (where teacher_id = $1 and status in ('accepted','completed','disputed')), 0)::int as incoming
       from bookings`, [uid])
    const { rows } = await pool.query(
      `select e.id, e.amount, e.booking_id, t.kind, t.memo, e.created_at,
         sum(e.amount) over (order by e.id) as balance_after
       from ledger_entries e join ledger_txns t on t.id = e.txn_id where e.account_id = $1 order by e.id desc limit 200`, [a.id])
    return {
      balance: a.balance, held: h.held, incoming: h.incoming,
      entries: rows.map(e => ({ id: e.id, amount: e.amount, kind: e.kind, memo: e.memo, bookingId: e.booking_id, balanceAfter: Number(e.balance_after), createdAt: e.created_at })),
    }
  }))

  r.get('/notifications', requireUser, wrap(async req => {
    const { rows } = await pool.query('select * from notifications where user_id = $1 order by id desc limit 30', [req.user.id])
    return rows.map(n => ({ id: n.id, type: n.type, body: n.body, bookingId: n.booking_id, read: n.read, createdAt: n.created_at }))
  }))

  r.post('/notifications/read', requireUser, wrap(async req => {
    await pool.query('update notifications set read = true where user_id = $1', [req.user.id])
  }))

  app.use('/api', r)
  app.use((err, _req, res, _next) => {
    const status = err.status || 500
    if (status === 500) console.error(err)
    res.status(status).json({ error: status === 500 ? 'Something went wrong' : err.message })
  })
  return app
}
