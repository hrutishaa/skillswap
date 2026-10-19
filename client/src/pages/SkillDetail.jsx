import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useApp, useData } from '../lib/app.jsx'
import { api } from '../api/index.js'
import { Avatar, CategoryArt, CreditBadge, ErrorText, Rating, Empty } from '../components/ui.jsx'
import { when, relative } from '../lib/format.js'
import { costFor } from '@shared/policy.js'

export function ReviewList({ reviews }) {
  if (!reviews.length) return <Empty>No reviews yet.</Empty>
  return (
    <div className="space-y-3" data-testid="reviews">
      {reviews.map(r => (
        <div key={r.id} className="rounded-xl bg-cream-50 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold">{r.reviewerName}</span>
            <Rating value={r.rating} />
          </div>
          {r.comment && <p className="mt-1 text-sm text-ink-700">{r.comment}</p>}
          <p className="mt-1 text-xs text-ink-500">{r.skillTitle} &middot; {relative(r.createdAt)}</p>
        </div>
      ))}
    </div>
  )
}

export default function SkillDetail() {
  const { id } = useParams()
  const { user, changed, showToast } = useApp()
  const { data: skill, error } = useData(`/skills/${id}`)
  const [slotId, setSlotId] = useState(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const navigate = useNavigate()

  if (error) return <ErrorText error={error} />
  if (!skill) return null
  const own = skill.teacherId === user.id
  const slot = skill.slots.find(s => s.id === slotId)
  const cost = slot ? costFor(skill.creditsPerHour, slot.minutes) : skill.creditsPerHour

  const book = async () => {
    setBusy(true); setErr(null)
    try {
      await api.post('/bookings', { slotId, note })
      changed()
      showToast(`Request sent. ${cost} CR is held in escrow until the session is done.`)
      navigate('/bookings')
    } catch (e) { setErr(e); changed() } finally { setBusy(false) }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <div className="card p-5">
          <CategoryArt category={skill.category} size="lg" />
          <div className="mt-4 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-extrabold">{skill.title}</h1>
              <p className="text-sm text-ink-500">{skill.level} &middot; {skill.category}</p>
            </div>
            <CreditBadge value={skill.creditsPerHour} className="h-14 w-14" />
          </div>
          <p className="mt-4 leading-relaxed text-ink-700">{skill.description}</p>
          <Link to={`/users/${skill.teacherId}`} className="mt-5 flex items-center gap-3 rounded-xl bg-cream-50 p-3 hover:bg-cream-100">
            <Avatar name={skill.teacherName} id={skill.teacherId} size={44} />
            <div>
              <div className="font-bold">{skill.teacherName}</div>
              <Rating value={skill.rating} count={skill.reviewCount} />
            </div>
          </Link>
        </div>
        <div className="card p-5">
          <h2 className="mb-3 font-extrabold">Reviews</h2>
          <ReviewList reviews={skill.reviews} />
        </div>
      </div>
      <div className="card h-fit p-5">
        <h2 className="font-extrabold">Pick a time</h2>
        <p className="mb-3 text-xs text-ink-500">{skill.creditsPerHour} CR per hour</p>
        {skill.slots.length === 0 && <Empty>No open times right now.</Empty>}
        <div className="grid max-h-72 gap-2 overflow-auto pr-1">
          {skill.slots.map(s => (
            <button key={s.id} onClick={() => setSlotId(s.id)} disabled={own} data-testid="slot"
              className={`rounded-xl border px-3 py-2 text-left text-sm ${slotId === s.id ? 'border-ember-500 bg-cream-100' : 'border-cream-200 hover:border-ember-400'}`}>
              <div className="font-bold">{when(s.startsAt)}</div>
              <div className="text-xs text-ink-500">{s.minutes} min &middot; {relative(s.startsAt)}</div>
            </button>
          ))}
        </div>
        {own ? (
          <p className="mt-4 text-sm text-ink-500">This is your listing.</p>
        ) : (
          <>
            <label className="label mt-4" htmlFor="note">Note for {skill.teacherName.split(' ')[0]}</label>
            <textarea id="note" className="input" rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="What do you want to get out of it?" />
            <div className="mt-4 space-y-1 rounded-xl bg-cream-50 p-3 text-sm">
              <div className="flex justify-between"><span>Cost</span><b>{cost} CR</b></div>
              <div className="flex justify-between text-ink-500"><span>Your balance after</span><span>{user.balance - cost} CR</span></div>
            </div>
            <ErrorText error={err} />
            <button className="btn-primary mt-3 w-full" disabled={!slot || busy || user.balance < cost} onClick={book}>
              {user.balance < cost ? 'Not enough credits' : 'Request session'}
            </button>
            <p className="mt-2 text-xs text-ink-500">
              Credits stay in escrow until you rate the session. Cancel 24 hours ahead for a full refund, half back if later.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
