import { HttpError } from './db.js'

async function systemAccount(c, kind) {
  const { rows } = await c.query('select id from accounts where kind = $1', [kind])
  return rows[0].id
}

export async function walletOf(c, userId) {
  const { rows } = await c.query('select id from accounts where user_id = $1', [userId])
  return rows[0].id
}

// Moves credits between accounts as one balanced ledger transaction.
// legs: [{ from, to, amount }] where from/to are 'escrow', 'mint' or a user id.
// Accounts are locked in id order so concurrent transfers cannot deadlock.
export async function post(c, { kind, bookingId = null, memo = '', legs }) {
  legs = legs.filter(l => l.amount > 0)
  if (!legs.length) return null
  const resolve = async ref => (typeof ref === 'number' ? walletOf(c, ref) : systemAccount(c, ref))
  const delta = new Map()
  for (const leg of legs) {
    const from = await resolve(leg.from)
    const to = await resolve(leg.to)
    delta.set(from, (delta.get(from) || 0) - leg.amount)
    delta.set(to, (delta.get(to) || 0) + leg.amount)
  }
  const ids = [...delta.keys()].sort((a, b) => a - b)
  const { rows: locked } = await c.query(
    'select id, kind, balance from accounts where id = any($1) order by id for update', [ids])
  for (const acc of locked) {
    if (acc.kind !== 'mint' && acc.balance + delta.get(acc.id) < 0) {
      throw new HttpError(409, acc.kind === 'user' ? 'Not enough credits' : 'Escrow would go negative')
    }
  }
  const { rows: [t] } = await c.query(
    'insert into ledger_txns (kind, booking_id, memo) values ($1, $2, $3) returning id', [kind, bookingId, memo])
  for (const id of ids) {
    const amount = delta.get(id)
    if (amount === 0) continue
    await c.query('insert into ledger_entries (txn_id, account_id, booking_id, amount) values ($1, $2, $3, $4)',
      [t.id, id, bookingId, amount])
    await c.query('update accounts set balance = balance + $1 where id = $2', [amount, id])
  }
  return t.id
}
