// In-browser version of the REST API used by the GitHub Pages demo.
// Data lives in localStorage so every tab on this origin sees the same
// marketplace. The credit rules are the same as the server: a double-entry
// ledger, escrow on booking, refunds by policy, release after completion.
import {
  SIGNUP_BONUS, FIRST_TEACH_BONUS, DISPUTE_WINDOW_HOURS, CATEGORIES, LEVELS,
  costFor, refundOnCancel, canJoinNow,
} from '@shared/policy.js'
import { USERS, SKILLS, HISTORY, PASSWORD, slotTimes } from '@shared/seedData.js'

const KEY = 'skillswap-demo-v1'
const events = new BroadcastChannel('skillswap-demo-events')
const listeners = new Set()

export function onDemoEvent(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
events.onmessage = e => listeners.forEach(fn => fn(e.data))
function broadcast(msg) {
  events.postMessage(msg)
  listeners.forEach(fn => fn(msg))
}

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status }
}
const fail = (status, message) => { throw new ApiError(status, message) }

const nowIso = (t = Date.now()) => new Date(t).toISOString()
const OPEN = ['requested', 'accepted', 'completed', 'disputed']

function empty() {
  return { seq: {}, users: [], accounts: [], txns: [], entries: [], skills: [], slots: [], bookings: [], reviews: [], messages: [], notifications: [] }
}

function nextId(db, table) {
  db.seq[table] = (db.seq[table] || 0) + 1
  return db.seq[table]
}

function insert(db, table, row) {
  const r = { id: nextId(db, table), ...row }
  db[table].push(r)
  return r
}

let pending = []
function notify(db, userId, type, body, bookingId = null) {
  const n = insert(db, 'notifications', { userId, type, body, bookingId, read: false, createdAt: nowIso() })
  pending.push({ type: 'notification', userId, notification: n })
}

// Ledger

const account = (db, ref) =>
  typeof ref === 'number' ? db.accounts.find(a => a.userId === ref) : db.accounts.find(a => a.kind === ref)

function post(db, { kind, bookingId = null, memo = '', legs }, at = nowIso()) {
  legs = legs.filter(l => l.amount > 0)
  if (!legs.length) return
  const delta = new Map()
  for (const l of legs) {
    const from = account(db, l.from); const to = account(db, l.to)
    delta.set(from, (delta.get(from) || 0) - l.amount)
    delta.set(to, (delta.get(to) || 0) + l.amount)
  }
  for (const [acc, d] of delta) {
    if (acc.kind !== 'mint' && acc.balance + d < 0) fail(409, acc.kind === 'user' ? 'Not enough credits' : 'Escrow would go negative')
  }
  const t = insert(db, 'txns', { kind, bookingId, memo, createdAt: at })
  for (const [acc, d] of delta) {
    if (!d) continue
    acc.balance += d
    insert(db, 'entries', { txnId: t.id, accountId: acc.id, bookingId, amount: d, createdAt: at })
  }
}

// Seed

function createUser(db, { name, email, password, bio = '', role = 'user' }, at = nowIso()) {
  if (!name?.trim() || !email?.includes('@') || !password || password.length < 8) {
    fail(400, 'Name, a valid email and a password of at least 8 characters are required')
  }
  if (db.users.some(u => u.email === email.toLowerCase())) fail(409, 'That email is already registered')
  const u = insert(db, 'users', { name: name.trim(), email: email.trim().toLowerCase(), password, bio, role, createdAt: at })
  insert(db, 'accounts', { kind: 'user', userId: u.id, balance: 0 })
  post(db, { kind: 'signup_bonus', memo: 'Welcome bonus', legs: [{ from: 'mint', to: u.id, amount: SIGNUP_BONUS }] }, at)
  return u
}

function seed() {
  const db = empty()
  insert(db, 'accounts', { kind: 'escrow', userId: null, balance: 0 })
  insert(db, 'accounts', { kind: 'mint', userId: null, balance: 0 })
  const users = {}
  const monthAgo = nowIso(Date.now() - 30 * 86400000)
  for (const u of USERS) users[u.key] = createUser(db, { ...u, password: PASSWORD }, monthAgo)
  const skills = {}
  SKILLS.forEach((s, i) => {
    skills[s.key] = insert(db, 'skills', {
      teacherId: users[s.teacher].id, title: s.title, description: s.description, category: s.category,
      level: s.level, creditsPerHour: s.creditsPerHour, active: true, createdAt: nowIso(Date.now() - (30 - i) * 86400000),
    })
    for (const sl of slotTimes(i)) insert(db, 'slots', { skillId: skills[s.key].id, ...sl })
  })
  for (const h of HISTORY) {
    const skill = skills[h.skill]
    const when = Date.now() - h.daysAgo * 86400000
    const slot = insert(db, 'slots', { skillId: skill.id, startsAt: nowIso(when), minutes: 60 })
    const learner = users[h.learner].id
    const b = createBooking(db, learner, { slotId: slot.id }, { allowPast: true, at: nowIso(when) })
    transition(db, skill.teacherId, b.id, 'accept')
    transition(db, skill.teacherId, b.id, 'complete', { now: when + 3600000 })
    review(db, learner, b.id, { rating: h.rating, comment: h.comment }, nowIso(when + 3600000))
  }
  for (const t of db.txns) {
    const b = t.bookingId && db.bookings.find(x => x.id === t.bookingId)
    if (b) t.createdAt = nowIso(new Date(b.startsAt).getTime() + 3600000)
  }
  for (const e of db.entries) e.createdAt = db.txns.find(t => t.id === e.txnId).createdAt
  db.notifications.forEach(n => { n.read = true })
  pending = []
  return db
}

function load() {
  const raw = localStorage.getItem(KEY)
  if (raw) return JSON.parse(raw)
  const db = seed()
  save(db)
  return db
}
function save(db) { localStorage.setItem(KEY, JSON.stringify(db)) }

export function resetDemo() {
  localStorage.removeItem(KEY)
  broadcast({ type: 'changed' })
}

// Bookings

function createBooking(db, learnerId, { slotId, note = '' }, { allowPast = false, at = nowIso() } = {}) {
  const slot = db.slots.find(s => s.id === Number(slotId))
  const skill = slot && db.skills.find(s => s.id === slot.skillId)
  if (!slot || !skill?.active) fail(404, 'Slot not found')
  if (skill.teacherId === learnerId) fail(400, 'You cannot book your own skill')
  if (!allowPast && new Date(slot.startsAt).getTime() + slot.minutes * 60000 < Date.now()) fail(400, 'That slot is in the past')
  if (db.bookings.some(b => b.slotId === slot.id && [...OPEN, 'settled'].includes(b.status))) fail(409, 'That slot was just taken')
  const credits = costFor(skill.creditsPerHour, slot.minutes)
  const b = insert(db, 'bookings', {
    skillId: skill.id, slotId: slot.id, learnerId, teacherId: skill.teacherId, credits, startsAt: slot.startsAt,
    minutes: slot.minutes, status: 'requested', note: String(note).slice(0, 500), refunded: 0, disputeReason: null,
    createdAt: at, completedAt: null, settledAt: null,
  })
  post(db, { kind: 'hold', bookingId: b.id, memo: `Held for ${skill.title}`, legs: [{ from: learnerId, to: 'escrow', amount: credits }] }, at)
  notify(db, skill.teacherId, 'booking_requested', `New request for ${skill.title}`, b.id)
  return b
}

const titleOf = (db, b) => db.skills.find(s => s.id === b.skillId).title

function refund(db, b, toLearner, kind, memo) {
  post(db, {
    kind, bookingId: b.id, memo,
    legs: [{ from: 'escrow', to: b.learnerId, amount: toLearner }, { from: 'escrow', to: b.teacherId, amount: b.credits - toLearner }],
  })
}

function settle(db, b) {
  const title = titleOf(db, b)
  post(db, { kind: 'release', bookingId: b.id, memo: `Earned: ${title}`, legs: [{ from: 'escrow', to: b.teacherId, amount: b.credits }] })
  if (!db.bookings.some(x => x.teacherId === b.teacherId && x.status === 'settled')) {
    post(db, { kind: 'bonus', bookingId: b.id, memo: 'First lesson taught bonus', legs: [{ from: 'mint', to: b.teacherId, amount: FIRST_TEACH_BONUS }] })
  }
  b.status = 'settled'
  b.settledAt = nowIso()
  notify(db, b.teacherId, 'credits_released', `${b.credits} CR released for ${title}`, b.id)
}

function transition(db, userId, id, action, { now = Date.now(), reason } = {}) {
  const b = db.bookings.find(x => x.id === Number(id))
  if (!b) fail(404, 'Booking not found')
  const title = titleOf(db, b)
  const expect = list => { if (!list.includes(b.status)) fail(409, `Booking is ${b.status}`) }
  const isT = b.teacherId === userId; const isL = b.learnerId === userId
  switch (action) {
    case 'accept':
      if (!isT) fail(403, 'Only the teacher can accept')
      expect(['requested'])
      b.status = 'accepted'
      notify(db, b.learnerId, 'booking_accepted', `Your session for ${title} was accepted`, b.id)
      break
    case 'decline':
      if (!isT) fail(403, 'Only the teacher can decline')
      expect(['requested'])
      refund(db, b, b.credits, 'refund', `Declined: ${title}`)
      b.status = 'declined'; b.refunded = b.credits
      notify(db, b.learnerId, 'booking_declined', `${title} was declined, ${b.credits} CR refunded`, b.id)
      break
    case 'cancel': {
      const by = isL ? 'learner' : isT ? 'teacher' : fail(403, 'Not your booking')
      expect(['requested', 'accepted'])
      const back = refundOnCancel({ status: b.status, credits: b.credits, startsAt: b.startsAt, now, by })
      refund(db, b, back, 'refund', `Cancelled by ${by}: ${title}`)
      b.status = 'cancelled'; b.refunded = back
      notify(db, isL ? b.teacherId : b.learnerId, 'booking_cancelled', `${title} was cancelled`, b.id)
      break
    }
    case 'complete':
      if (!isT && !isL) fail(403, 'Not your booking')
      expect(['accepted'])
      if (now < new Date(b.startsAt).getTime() - 15 * 60000) fail(409, 'The session has not started yet')
      b.status = 'completed'; b.completedAt = nowIso(now)
      notify(db, b.learnerId, 'booking_completed',
        `${title} is done. Rate it to release the credits, or open a dispute within ${DISPUTE_WINDOW_HOURS}h`, b.id)
      break
    case 'confirm':
      if (!isL) fail(403, 'Only the learner can release credits')
      expect(['completed'])
      settle(db, b)
      break
    case 'dispute':
      if (!isL) fail(403, 'Only the learner can dispute')
      expect(['completed'])
      if (now > new Date(b.completedAt).getTime() + DISPUTE_WINDOW_HOURS * 3600000) fail(409, 'Dispute window has closed')
      b.status = 'disputed'; b.disputeReason = String(reason || '').slice(0, 1000)
      notify(db, b.teacherId, 'booking_disputed', `The learner disputed ${title}. Credits stay in escrow until a moderator decides`, b.id)
      break
    default:
      fail(404, 'Unknown action')
  }
  return b
}

function settleDue(db) {
  const cutoff = Date.now() - DISPUTE_WINDOW_HOURS * 3600000
  for (const b of db.bookings) {
    if (b.status === 'completed' && new Date(b.completedAt).getTime() < cutoff) settle(db, b)
  }
}

function review(db, userId, id, { rating, comment = '' }, at = nowIso()) {
  rating = Number(rating)
  if (!(rating >= 1 && rating <= 5)) fail(400, 'Rating must be 1 to 5')
  const b = db.bookings.find(x => x.id === Number(id))
  if (!b) fail(404, 'Booking not found')
  if (b.learnerId !== userId) fail(403, 'Only the learner can review')
  if (!['completed', 'settled'].includes(b.status)) fail(409, `Booking is ${b.status}`)
  if (db.reviews.some(r => r.bookingId === b.id)) fail(409, 'Already reviewed')
  if (b.status === 'completed') settle(db, b)
  return insert(db, 'reviews', {
    bookingId: b.id, skillId: b.skillId, teacherId: b.teacherId, reviewerId: userId,
    rating: Math.round(rating), comment: String(comment).slice(0, 1000), createdAt: at,
  })
}

// Views

const publicUser = u => ({ id: u.id, name: u.name, email: u.email, bio: u.bio, role: u.role, createdAt: u.createdAt })
const round1 = x => Math.round(x * 10) / 10

function skillOut(db, s) {
  const rs = db.reviews.filter(r => r.skillId === s.id)
  return {
    id: s.id, teacherId: s.teacherId, teacherName: db.users.find(u => u.id === s.teacherId).name, title: s.title,
    description: s.description, category: s.category, level: s.level, creditsPerHour: s.creditsPerHour, active: s.active,
    rating: rs.length ? round1(rs.reduce((a, r) => a + r.rating, 0) / rs.length) : 0, reviewCount: rs.length, createdAt: s.createdAt,
  }
}

function reviewsOut(db, pred) {
  return db.reviews.filter(pred).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(r => ({
    id: r.id, rating: r.rating, comment: r.comment, createdAt: r.createdAt,
    reviewerName: db.users.find(u => u.id === r.reviewerId).name, skillTitle: db.skills.find(s => s.id === r.skillId).title,
  }))
}

function bookingOut(db, b) {
  const name = id => db.users.find(u => u.id === id).name
  return {
    ...b, title: titleOf(db, b), learnerName: name(b.learnerId), teacherName: name(b.teacherId),
    reviewed: db.reviews.some(r => r.bookingId === b.id),
  }
}

// Routes

const routes = []
const route = (method, path, handler, { auth = false, write = false } = {}) => {
  const keys = []
  const re = new RegExp('^' + path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)' }) + '$')
  routes.push({ method, re, keys, handler, auth, write })
}

route('GET', '/health', () => ({ ok: true }))
route('GET', '/meta', () => ({ categories: CATEGORIES, levels: LEVELS, signupBonus: SIGNUP_BONUS }))

route('POST', '/auth/signup', ({ db, body }) => {
  const u = createUser(db, body)
  return { token: `demo-${u.id}`, user: publicUser(u) }
}, { write: true })

route('POST', '/auth/login', ({ db, body }) => {
  const u = db.users.find(x => x.email === String(body.email || '').toLowerCase())
  if (!u || u.password !== body.password) fail(401, 'Wrong email or password')
  return { token: `demo-${u.id}`, user: publicUser(u) }
})

route('GET', '/me', ({ db, user }) => ({ ...publicUser(user), balance: account(db, user.id).balance }), { auth: true })

route('PATCH', '/me', ({ user, body }) => {
  if (body.name?.trim()) user.name = body.name.trim()
  if (typeof body.bio === 'string') user.bio = body.bio
  return publicUser(user)
}, { auth: true, write: true })

route('GET', '/users/:id', ({ db, params }) => {
  const u = db.users.find(x => x.id === Number(params.id)) || fail(404, 'User not found')
  const reviews = reviewsOut(db, r => r.teacherId === u.id)
  return {
    id: u.id, name: u.name, bio: u.bio, createdAt: u.createdAt,
    skills: db.skills.filter(s => s.teacherId === u.id && s.active).map(s => skillOut(db, s)),
    reviews,
    rating: reviews.length ? round1(reviews.reduce((a, r) => a + r.rating, 0) / reviews.length) : 0,
    taught: db.bookings.filter(b => b.teacherId === u.id && b.status === 'settled').length,
    learned: db.bookings.filter(b => b.learnerId === u.id && b.status === 'settled').length,
  }
})

route('GET', '/skills', ({ db, query }) => {
  const q = (query.q || '').toLowerCase()
  let list = db.skills.filter(s => s.active).map(s => skillOut(db, s)).filter(s =>
    (!q || s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) || s.teacherName.toLowerCase().includes(q)) &&
    (!query.category || s.category === query.category) &&
    (!query.level || s.level === query.level) &&
    (!query.maxCredits || s.creditsPerHour <= Number(query.maxCredits)))
  const sorts = {
    rating: (a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount,
    cheap: (a, b) => a.creditsPerHour - b.creditsPerHour,
    new: (a, b) => b.createdAt.localeCompare(a.createdAt),
  }
  return list.sort((a, b) => (sorts[query.sort] || ((x, y) => y.reviewCount - x.reviewCount || y.rating - x.rating))(a, b) || a.id - b.id)
})

route('GET', '/skills/:id', ({ db, params }) => {
  const s = db.skills.find(x => x.id === Number(params.id)) || fail(404, 'Skill not found')
  const taken = new Set(db.bookings.filter(b => [...OPEN, 'settled'].includes(b.status)).map(b => b.slotId))
  const slots = db.slots
    .filter(sl => sl.skillId === s.id && !taken.has(sl.id) && new Date(sl.startsAt).getTime() + sl.minutes * 60000 > Date.now())
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, 30)
    .map(sl => ({ id: sl.id, startsAt: sl.startsAt, minutes: sl.minutes }))
  return { ...skillOut(db, s), slots, reviews: reviewsOut(db, r => r.skillId === s.id) }
})

function addSlots(db, skillId, slots = []) {
  for (const sl of slots.slice(0, 50)) {
    const t = new Date(sl.startsAt)
    if (isNaN(t)) fail(400, 'Bad slot time')
    insert(db, 'slots', { skillId, startsAt: t.toISOString(), minutes: Number(sl.minutes) || 60 })
  }
}

route('POST', '/skills', ({ db, user, body: b }) => {
  if (!b.title?.trim() || !b.description?.trim()) fail(400, 'Title and description are required')
  if (!CATEGORIES.includes(b.category)) fail(400, 'Unknown category')
  if (!LEVELS.includes(b.level)) fail(400, 'Unknown level')
  const cph = Number(b.creditsPerHour)
  if (!Number.isInteger(cph) || cph < 1 || cph > 100) fail(400, 'Credits per hour must be 1 to 100')
  const s = insert(db, 'skills', {
    teacherId: user.id, title: b.title.trim(), description: b.description.trim(), category: b.category,
    level: b.level, creditsPerHour: cph, active: true, createdAt: nowIso(),
  })
  addSlots(db, s.id, b.slots)
  return skillOut(db, s)
}, { auth: true, write: true })

route('POST', '/skills/:id/slots', ({ db, user, params, body }) => {
  const s = db.skills.find(x => x.id === Number(params.id))
  if (!s || s.teacherId !== user.id) fail(403, 'Not your skill')
  addSlots(db, s.id, body.slots)
  return { ok: true }
}, { auth: true, write: true })

route('GET', '/bookings', ({ db, user, query }) => {
  settleDue(db)
  const mine = b => query.role === 'teacher' ? b.teacherId === user.id : query.role === 'learner' ? b.learnerId === user.id
    : b.teacherId === user.id || b.learnerId === user.id
  return db.bookings.filter(mine).sort((a, b) => b.startsAt.localeCompare(a.startsAt)).map(b => bookingOut(db, b))
}, { auth: true, write: true })

const participant = (db, user, id) => {
  const b = db.bookings.find(x => x.id === Number(id))
  if (!b || (b.learnerId !== user.id && b.teacherId !== user.id)) fail(403, 'Not your booking')
  return b
}

route('GET', '/bookings/:id', ({ db, user, params }) => {
  const b = participant(db, user, params.id)
  return { ...bookingOut(db, b), joinable: b.status === 'accepted' && canJoinNow({ startsAt: b.startsAt, minutes: b.minutes }) }
}, { auth: true })

route('POST', '/bookings', ({ db, user, body }) => bookingOut(db, createBooking(db, user.id, body)), { auth: true, write: true })

for (const action of ['accept', 'decline', 'cancel', 'complete', 'confirm', 'dispute']) {
  route('POST', `/bookings/:id/${action}`, ({ db, user, params, body }) =>
    bookingOut(db, transition(db, user.id, params.id, action, { reason: body?.reason })), { auth: true, write: true })
}

route('POST', '/bookings/:id/review', ({ db, user, params, body }) => review(db, user.id, params.id, body), { auth: true, write: true })

route('GET', '/bookings/:id/messages', ({ db, user, params }) => {
  participant(db, user, params.id)
  return db.messages.filter(m => m.bookingId === Number(params.id)).map(m => ({
    id: m.id, body: m.body, senderId: m.senderId, senderName: db.users.find(u => u.id === m.senderId).name, createdAt: m.createdAt,
  }))
}, { auth: true })

route('POST', '/bookings/:id/messages', ({ db, user, params, body }) => {
  const b = participant(db, user, params.id)
  if (!['accepted', 'completed'].includes(b.status) || !body.body?.trim()) fail(400, 'Not in session')
  const m = insert(db, 'messages', { bookingId: b.id, senderId: user.id, body: body.body.trim().slice(0, 2000), createdAt: nowIso() })
  return { id: m.id, body: m.body, senderId: m.senderId, senderName: user.name, createdAt: m.createdAt }
}, { auth: true, write: true })

route('GET', '/wallet', ({ db, user }) => {
  settleDue(db)
  const acc = account(db, user.id)
  let running = 0
  const entries = db.entries.filter(e => e.accountId === acc.id).map(e => {
    running += e.amount
    const t = db.txns.find(x => x.id === e.txnId)
    return { id: e.id, amount: e.amount, kind: t.kind, memo: t.memo, bookingId: e.bookingId, balanceAfter: running, createdAt: e.createdAt }
  }).reverse()
  const sum = pred => db.bookings.filter(pred).reduce((a, b) => a + b.credits, 0)
  return {
    balance: acc.balance,
    held: sum(b => b.learnerId === user.id && OPEN.includes(b.status)),
    incoming: sum(b => b.teacherId === user.id && ['accepted', 'completed', 'disputed'].includes(b.status)),
    entries,
  }
}, { auth: true, write: true })

route('GET', '/notifications', ({ db, user }) =>
  db.notifications.filter(n => n.userId === user.id).sort((a, b) => b.id - a.id).slice(0, 30), { auth: true })

route('POST', '/notifications/read', ({ db, user }) => {
  db.notifications.forEach(n => { if (n.userId === user.id) n.read = true })
  return { ok: true }
}, { auth: true, write: true })

function run(method, path, body, token) {
  const [p, qs] = path.split('?')
  const r = routes.find(x => x.method === method && x.re.test(p))
  if (!r) fail(404, 'Not found')
  const db = load()
  const params = {}
  p.match(r.re).slice(1).forEach((v, i) => { params[r.keys[i]] = decodeURIComponent(v) })
  const query = Object.fromEntries(new URLSearchParams(qs || ''))
  let user = null
  if (r.auth) {
    const id = Number(String(token || '').replace('demo-', ''))
    user = db.users.find(u => u.id === id) || fail(401, 'Please log in')
  }
  pending = []
  const result = r.handler({ db, params, query, body: body || {}, user })
  if (r.write) {
    save(db)
    const out = pending
    pending = []
    out.forEach(broadcast)
    if (method !== 'GET') broadcast({ type: 'changed' })
  }
  return JSON.parse(JSON.stringify(result))
}

// Serialize requests across tabs with the Web Locks API so two tabs never
// read and write the store at the same time.
export async function demoRequest(method, path, body, token) {
  const exec = () => {
    try {
      return run(method, path, body, token)
    } catch (err) {
      if (err instanceof ApiError) throw err
      console.warn(err)
      throw new ApiError(500, 'Something went wrong')
    }
  }
  if (navigator.locks) return navigator.locks.request('skillswap-demo-db', exec)
  return exec()
}
