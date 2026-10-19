export const shortName = name => {
  const [first, last] = name.split(' ')
  return last ? `${first} ${last[0]}.` : first
}

export const initials = name => name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()

export function when(iso) {
  const d = new Date(iso)
  return d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export const dateOnly = iso => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

export function relative(iso) {
  const diff = new Date(iso).getTime() - Date.now()
  const mins = Math.round(diff / 60000)
  if (Math.abs(mins) < 60) return mins >= 0 ? `in ${mins} min` : `${-mins} min ago`
  const hours = Math.round(mins / 60)
  if (Math.abs(hours) < 36) return hours >= 0 ? `in ${hours} h` : `${-hours} h ago`
  const days = Math.round(hours / 24)
  return days >= 0 ? `in ${days} days` : `${-days} days ago`
}

export const STATUS_LABEL = {
  requested: 'Waiting for teacher',
  accepted: 'Confirmed',
  declined: 'Declined',
  cancelled: 'Cancelled',
  completed: 'Awaiting rating',
  settled: 'Paid out',
  disputed: 'In dispute',
  refunded: 'Refunded',
}

export const KIND_LABEL = {
  signup_bonus: 'Welcome bonus',
  hold: 'Held in escrow',
  refund: 'Refund',
  release: 'Earned',
  bonus: 'Bonus',
  resolution: 'Dispute resolution',
}
