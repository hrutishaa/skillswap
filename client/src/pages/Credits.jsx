import { Link } from 'react-router-dom'
import { SIGNUP_BONUS, FIRST_TEACH_BONUS, DISPUTE_WINDOW_HOURS } from '@shared/policy.js'

export default function Credits() {
  return (
    <div className="card max-w-2xl space-y-4 p-6">
      <h1 className="text-2xl font-extrabold">Getting more credits</h1>
      <p className="text-ink-700">
        Credits can't be bought. The only way to get more is to teach. Everyone starts with {SIGNUP_BONUS} CR, and the
        first session you teach earns an extra {FIRST_TEACH_BONUS} CR on top of what the learner pays.
      </p>
      <p className="text-ink-700">
        When someone books you, their credits move into escrow. After the session they rate it and the credits move to
        you. If they forget, the credits are released {DISPUTE_WINDOW_HOURS} hours after the session ends. If they report
        a problem, the credits stay in escrow until a moderator decides.
      </p>
      <p className="text-ink-700">
        If a learner cancels at least 24 hours ahead they get everything back. Later than that, you keep half. Less than
        two hours before, you keep all of it. If you cancel, they always get a full refund.
      </p>
      <Link to="/teach" className="btn-primary">List something you can teach</Link>
    </div>
  )
}
