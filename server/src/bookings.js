import { HttpError, pool, tx } from './db.js'
import { post } from './ledger.js'
import { notify } from './events.js'
import { costFor, refundOnCancel, canJoinNow, DISPUTE_WINDOW_HOURS, FIRST_TEACH_BONUS } from '../../shared/policy.js'

const ACTIVE = ['requested', 'accepted', 'completed', 'disputed']

async function lockBooking(c, id) {
  const { rows: [b] } = await c.query(
    `select b.*, s.title from bookings b join skills s on s.id = b.skill_id where b.id = $1 for update of b`, [id])
  if (!b) throw new HttpError(404, 'Booking not found')
  return b
}

function expect(b, statuses) {
  if (!statuses.includes(b.status)) throw new HttpError(409, `Booking is ${b.status}`)
}

export async function createBooking(learnerId, { slotId, note = '' }, { allowPast = false } = {}) {
  return tx(async c => {
    const { rows: [slot] } = await c.query(
      `select sl.*, s.teacher_id, s.credits_per_hour, s.title, s.active
         from skill_slots sl join skills s on s.id = sl.skill_id where sl.id = $1 for update of sl`, [slotId])
    if (!slot || !slot.active) throw new HttpError(404, 'Slot not found')
    if (slot.teacher_id === learnerId) throw new HttpError(400, 'You cannot book your own skill')
    if (!allowPast && new Date(slot.starts_at).getTime() + slot.minutes * 60000 < Date.now()) {
      throw new HttpError(400, 'That slot is in the past')
    }
    const taken = await c.query(`select 1 from bookings where slot_id = $1 and status = any($2)`, [slotId, ACTIVE.concat('settled')])
    if (taken.rowCount) throw new HttpError(409, 'That slot was just taken')
    const credits = costFor(slot.credits_per_hour, slot.minutes)
    const { rows: [b] } = await c.query(
      `insert into bookings (skill_id, slot_id, learner_id, teacher_id, credits, starts_at, minutes, status, note)
       values ($1, $2, $3, $4, $5, $6, $7, 'requested', $8) returning *`,
      [slot.skill_id, slotId, learnerId, slot.teacher_id, credits, slot.starts_at, slot.minutes, String(note).slice(0, 500)])
    await post(c, { kind: 'hold', bookingId: b.id, memo: `Held for ${slot.title}`, legs: [{ from: learnerId, to: 'escrow', amount: credits }] })
    await notify(c, slot.teacher_id, 'booking_requested', `New request for ${slot.title}`, b.id)
    return b
  }).catch(err => {
    if (err.code === '23505') throw new HttpError(409, 'That slot was just taken')
    throw err
  })
}

export async function accept(userId, id) {
  return tx(async c => {
    const b = await lockBooking(c, id)
    if (b.teacher_id !== userId) throw new HttpError(403, 'Only the teacher can accept')
    expect(b, ['requested'])
    await c.query(`update bookings set status = 'accepted' where id = $1`, [id])
    await notify(c, b.learner_id, 'booking_accepted', `Your session for ${b.title} was accepted`, id)
    return { ...b, status: 'accepted' }
  })
}

async function refund(c, b, toLearner, kind, memo) {
  const toTeacher = b.credits - toLearner
  await post(c, {
    kind, bookingId: b.id, memo,
    legs: [{ from: 'escrow', to: b.learner_id, amount: toLearner }, { from: 'escrow', to: b.teacher_id, amount: toTeacher }],
  })
}

export async function decline(userId, id) {
  return tx(async c => {
    const b = await lockBooking(c, id)
    if (b.teacher_id !== userId) throw new HttpError(403, 'Only the teacher can decline')
    expect(b, ['requested'])
    await refund(c, b, b.credits, 'refund', `Declined: ${b.title}`)
    await c.query(`update bookings set status = 'declined', refunded = credits where id = $1`, [id])
    await notify(c, b.learner_id, 'booking_declined', `${b.title} was declined, ${b.credits} CR refunded`, id)
    return { ...b, status: 'declined', refunded: b.credits }
  })
}

export async function cancel(userId, id, now = Date.now()) {
  return tx(async c => {
    const b = await lockBooking(c, id)
    const by = b.learner_id === userId ? 'learner' : b.teacher_id === userId ? 'teacher' : null
    if (!by) throw new HttpError(403, 'Not your booking')
    expect(b, ['requested', 'accepted'])
    const back = refundOnCancel({ status: b.status, credits: b.credits, startsAt: b.starts_at, now, by })
    await refund(c, b, back, 'refund', `Cancelled by ${by}: ${b.title}`)
    await c.query(`update bookings set status = 'cancelled', refunded = $2 where id = $1`, [id, back])
    const other = by === 'learner' ? b.teacher_id : b.learner_id
    await notify(c, other, 'booking_cancelled', `${b.title} was cancelled`, id)
    return { ...b, status: 'cancelled', refunded: back }
  })
}

export async function complete(userId, id, now = Date.now()) {
  return tx(async c => {
    const b = await lockBooking(c, id)
    if (b.teacher_id !== userId && b.learner_id !== userId) throw new HttpError(403, 'Not your booking')
    expect(b, ['accepted'])
    if (now < new Date(b.starts_at).getTime() - 15 * 60000) throw new HttpError(409, 'The session has not started yet')
    await c.query(`update bookings set status = 'completed', completed_at = to_timestamp($2 / 1000.0) where id = $1`, [id, now])
    await notify(c, b.learner_id, 'booking_completed',
      `${b.title} is done. Rate it to release the credits, or open a dispute within ${DISPUTE_WINDOW_HOURS}h`, id)
    return { ...b, status: 'completed' }
  })
}

async function settle(c, b) {
  await post(c, { kind: 'release', bookingId: b.id, memo: `Earned: ${b.title}`, legs: [{ from: 'escrow', to: b.teacher_id, amount: b.credits }] })
  const prior = await c.query(`select 1 from bookings where teacher_id = $1 and status = 'settled' limit 1`, [b.teacher_id])
  if (!prior.rowCount) {
    await post(c, { kind: 'bonus', bookingId: b.id, memo: 'First lesson taught bonus', legs: [{ from: 'mint', to: b.teacher_id, amount: FIRST_TEACH_BONUS }] })
  }
  await c.query(`update bookings set status = 'settled', settled_at = now() where id = $1`, [b.id])
  await notify(c, b.teacher_id, 'credits_released', `${b.credits} CR released for ${b.title}`, b.id)
}

export async function confirm(userId, id) {
  return tx(async c => {
    const b = await lockBooking(c, id)
    if (b.learner_id !== userId) throw new HttpError(403, 'Only the learner can release credits')
    expect(b, ['completed'])
    await settle(c, b)
    return { ...b, status: 'settled' }
  })
}

export async function dispute(userId, id, reason, now = Date.now()) {
  return tx(async c => {
    const b = await lockBooking(c, id)
    if (b.learner_id !== userId) throw new HttpError(403, 'Only the learner can dispute')
    expect(b, ['completed'])
    if (now > new Date(b.completed_at).getTime() + DISPUTE_WINDOW_HOURS * 3600000) throw new HttpError(409, 'Dispute window has closed')
    await c.query(`update bookings set status = 'disputed', dispute_reason = $2 where id = $1`, [id, String(reason || '').slice(0, 1000)])
    await notify(c, b.teacher_id, 'booking_disputed', `The learner disputed ${b.title}. Credits stay in escrow until a moderator decides`, id)
    return { ...b, status: 'disputed' }
  })
}

// Moderator decision: refund some share to the learner, the rest to the teacher.
export async function resolve(id, refundCredits) {
  return tx(async c => {
    const b = await lockBooking(c, id)
    expect(b, ['disputed'])
    const back = Math.max(0, Math.min(b.credits, Math.round(refundCredits)))
    await refund(c, b, back, 'resolution', `Dispute resolved: ${b.title}`)
    const status = back === b.credits ? 'refunded' : 'settled'
    await c.query(`update bookings set status = $2, refunded = $3, settled_at = now() where id = $1`, [id, status, back])
    await notify(c, b.learner_id, 'dispute_resolved', `Dispute on ${b.title} resolved, ${back} CR refunded`, id)
    await notify(c, b.teacher_id, 'dispute_resolved', `Dispute on ${b.title} resolved, ${b.credits - back} CR paid`, id)
    return { ...b, status, refunded: back }
  })
}

// Completed bookings with no dispute are paid out once the window passes.
export async function settleDue(now = Date.now()) {
  const { rows } = await pool.query(
    `select id from bookings where status = 'completed' and completed_at < to_timestamp($1 / 1000.0) - make_interval(hours => $2)`,
    [now, DISPUTE_WINDOW_HOURS])
  for (const { id } of rows) {
    await tx(async c => {
      const b = await lockBooking(c, id)
      if (b.status === 'completed') await settle(c, b)
    })
  }
  return rows.length
}

export async function review(userId, id, { rating, comment = '' }) {
  rating = Number(rating)
  if (!(rating >= 1 && rating <= 5)) throw new HttpError(400, 'Rating must be 1 to 5')
  return tx(async c => {
    const b = await lockBooking(c, id)
    if (b.learner_id !== userId) throw new HttpError(403, 'Only the learner can review')
    expect(b, ['completed', 'settled'])
    if (b.status === 'completed') await settle(c, b)
    const { rows: [r] } = await c.query(
      `insert into reviews (booking_id, skill_id, teacher_id, reviewer_id, rating, comment)
       values ($1, $2, $3, $4, $5, $6) on conflict (booking_id) do nothing returning *`,
      [id, b.skill_id, b.teacher_id, userId, Math.round(rating), String(comment).slice(0, 1000)])
    if (!r) throw new HttpError(409, 'Already reviewed')
    return r
  })
}

export async function assertParticipant(userId, id) {
  const { rows: [b] } = await pool.query('select * from bookings where id = $1', [id])
  if (!b || (b.learner_id !== userId && b.teacher_id !== userId)) throw new HttpError(403, 'Not your booking')
  return b
}

export function joinable(b, now = Date.now()) {
  return b.status === 'accepted' && canJoinNow({ startsAt: b.starts_at, minutes: b.minutes, now })
}
