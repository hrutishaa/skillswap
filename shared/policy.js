// Rules shared by the real server and the in-browser demo backend.
export const SIGNUP_BONUS = 100
export const FIRST_TEACH_BONUS = 10
export const DISPUTE_WINDOW_HOURS = 24
export const JOIN_EARLY_MINUTES = 15

export const CATEGORIES = ['Music', 'Programming', 'Arts', 'Languages', 'Cooking', 'Fitness', 'Academics', 'Design']
export const LEVELS = ['Beginner', 'Intermediate', 'Advanced']

export function costFor(creditsPerHour, minutes) {
  return Math.ceil((creditsPerHour * minutes) / 60)
}

// How many credits go back to the learner when a booking is cancelled.
// The remainder goes to the teacher. Requested bookings and cancellations
// by the teacher always refund in full.
export function refundOnCancel({ status, credits, startsAt, now = Date.now(), by }) {
  if (by === 'teacher' || status === 'requested') return credits
  const hours = (new Date(startsAt).getTime() - now) / 3600000
  if (hours >= 24) return credits
  if (hours >= 2) return Math.floor(credits / 2)
  return 0
}

export function canJoinNow({ startsAt, minutes, now = Date.now() }) {
  const start = new Date(startsAt).getTime()
  return now >= start - JOIN_EARLY_MINUTES * 60000 && now <= start + (minutes + 60) * 60000
}
