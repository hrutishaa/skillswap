import { fileURLToPath } from 'node:url'
import { pool } from './db.js'
import { migrate } from './migrate.js'
import { createUser } from './app.js'
import * as bk from './bookings.js'
import { USERS, SKILLS, HISTORY, PASSWORD, slotTimes } from '../../shared/seedData.js'

// Seeding goes through the same booking functions as the API, so every
// seeded balance is backed by real ledger entries.
export async function seed() {
  await migrate({ reset: true })
  const users = {}
  for (const u of USERS) users[u.key] = await createUser({ ...u, password: PASSWORD })
  const skills = {}
  for (const [i, s] of SKILLS.entries()) {
    const { rows: [row] } = await pool.query(
      `insert into skills (teacher_id, title, description, category, level, credits_per_hour, created_at)
       values ($1, $2, $3, $4, $5, $6, now() - make_interval(days => $7)) returning *`,
      [users[s.teacher].id, s.title, s.description, s.category, s.level, s.creditsPerHour, 30 - i])
    skills[s.key] = row
    for (const sl of slotTimes(i)) {
      await pool.query('insert into skill_slots (skill_id, starts_at, minutes) values ($1, $2, $3)', [row.id, sl.startsAt, sl.minutes])
    }
  }
  for (const h of HISTORY) {
    const skill = skills[h.skill]
    const when = new Date(Date.now() - h.daysAgo * 86400000)
    const { rows: [slot] } = await pool.query(
      'insert into skill_slots (skill_id, starts_at, minutes) values ($1, $2, 60) returning id', [skill.id, when])
    const learner = users[h.learner].id
    const b = await bk.createBooking(learner, { slotId: slot.id }, { allowPast: true })
    await bk.accept(skill.teacher_id, b.id)
    await bk.complete(skill.teacher_id, b.id, when.getTime() + 3600000)
    await bk.review(learner, b.id, { rating: h.rating, comment: h.comment })
    await pool.query('update reviews set created_at = $2 where booking_id = $1', [b.id, when])
  }
  // Ledger rows from the seed get backdated timestamps too, so history reads naturally.
  await pool.query('alter table ledger_entries disable trigger entries_immutable')
  await pool.query(`update ledger_entries e set created_at = b.starts_at + interval '1 hour' from bookings b where b.id = e.booking_id`)
  await pool.query(`update ledger_entries set created_at = now() - interval '30 days' where booking_id is null`)
  await pool.query('alter table ledger_entries enable trigger entries_immutable')
  await pool.query(`update ledger_txns t set created_at = e.created_at from ledger_entries e where e.txn_id = t.id`)
  await pool.query(`update notifications set read = true`)
  return { users, skills }
}

async function isEmpty() {
  const { rows } = await pool.query(`select to_regclass('public.users') as t`)
  if (!rows[0].t) return true
  return (await pool.query('select 1 from users limit 1')).rowCount === 0
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const skip = process.argv.includes('--if-empty') && !(await isEmpty())
  if (skip) { console.log('data exists, not seeding'); await pool.end(); process.exit(0) }
  seed().then(() => { console.log('seeded'); return pool.end() })
}
