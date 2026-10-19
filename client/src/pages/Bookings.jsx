import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Video } from 'lucide-react'
import { useApp, useData } from '../lib/app.jsx'
import { api } from '../api/index.js'
import { Avatar, Empty, StatusPill, Stars, ErrorText } from '../components/ui.jsx'
import { when, relative, STATUS_LABEL } from '../lib/format.js'
import { refundOnCancel, canJoinNow, DISPUTE_WINDOW_HOURS } from '@shared/policy.js'

export function RateForm({ booking, onDone }) {
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [err, setErr] = useState(null)
  const submit = async () => {
    try {
      await api.post(`/bookings/${booking.id}/review`, { rating, comment })
      onDone()
    } catch (e) { setErr(e) }
  }
  return (
    <div className="space-y-2 rounded-xl bg-cream-50 p-3" data-testid="rate-form">
      <Stars value={rating} onChange={setRating} />
      <textarea className="input" rows={2} placeholder="How did it go?" value={comment} onChange={e => setComment(e.target.value)} />
      <ErrorText error={err} />
      <button className="btn-primary" onClick={submit}>Rate and release {booking.credits} CR</button>
    </div>
  )
}

function BookingRow({ b, role }) {
  const { changed, showToast } = useApp()
  const [err, setErr] = useState(null)
  const [rating, setRating] = useState(false)
  const other = role === 'teacher' ? { name: b.learnerName, id: b.learnerId } : { name: b.teacherName, id: b.teacherId }
  const act = async (action, body, msg) => {
    setErr(null)
    try {
      await api.post(`/bookings/${b.id}/${action}`, body)
      if (msg) showToast(msg)
      changed()
    } catch (e) { setErr(e) }
  }
  const refund = refundOnCancel({ status: b.status, credits: b.credits, startsAt: b.startsAt, by: role })
  const cancel = () => {
    const text = refund === b.credits ? `Cancel? You get all ${b.credits} CR back.` :
      role === 'learner' ? `Cancel? It is less than 24 hours away, so you get ${refund} of ${b.credits} CR back.` : 'Cancel?'
    if (confirm(text)) act('cancel')
  }
  const joinable = b.status === 'accepted' && canJoinNow({ startsAt: b.startsAt, minutes: b.minutes })
  const releaseAt = b.completedAt && new Date(new Date(b.completedAt).getTime() + DISPUTE_WINDOW_HOURS * 3600000).toISOString()

  return (
    <div className="card p-4" data-testid="booking">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={other.name} id={other.id} size={42} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/skills/${b.skillId}`} className="font-extrabold hover:text-ember-600">{b.title}</Link>
            <StatusPill status={b.status} label={STATUS_LABEL[b.status]} />
          </div>
          <div className="text-sm text-ink-500">
            {role === 'teacher' ? 'Learner' : 'Teacher'}: <Link className="hover:underline" to={`/users/${other.id}`}>{other.name}</Link> &middot; {when(b.startsAt)} ({relative(b.startsAt)}) &middot; {b.minutes} min
          </div>
          {b.note && <div className="mt-1 text-sm italic text-ink-700">"{b.note}"</div>}
        </div>
        <div className="text-right">
          <div className="text-lg font-extrabold">{b.credits} CR</div>
          {b.refunded > 0 && <div className="text-xs text-ink-500">{b.refunded} refunded</div>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {role === 'teacher' && b.status === 'requested' && <>
          <button className="btn-primary" onClick={() => act('accept', null, 'Accepted. The learner has been notified.')}>Accept</button>
          <button className="btn-soft" onClick={() => act('decline')}>Decline</button>
        </>}
        {b.status === 'accepted' && (
          joinable
            ? <Link to={`/session/${b.id}`} className="btn-primary"><Video size={16} /> Join session</Link>
            : <span className="text-xs text-ink-500">The room opens 15 minutes before the start.</span>
        )}
        {['requested', 'accepted'].includes(b.status) && <button className="btn-ghost" onClick={cancel}>Cancel</button>}
        {b.status === 'completed' && role === 'learner' && !rating && <>
          <button className="btn-primary" onClick={() => setRating(true)}>Rate session</button>
          <button className="btn-soft" onClick={() => act('confirm', null, 'Credits released.')}>Release without review</button>
          <button className="btn-ghost" onClick={() => { const reason = prompt('What went wrong?'); if (reason) act('dispute', { reason }) }}>Report a problem</button>
        </>}
        {b.status === 'completed' && role === 'teacher' && (
          <span className="text-xs text-ink-500">Waiting for the learner to rate. Credits release automatically {relative(releaseAt)} unless they report a problem.</span>
        )}
        {b.status === 'disputed' && <span className="text-xs text-ink-500">Credits stay in escrow until a moderator looks at it.</span>}
        {b.status === 'settled' && role === 'learner' && !b.reviewed && !rating && <button className="btn-soft" onClick={() => setRating(true)}>Leave a review</button>}
      </div>
      {rating && <div className="mt-3"><RateForm booking={b} onDone={() => { setRating(false); showToast('Thanks. Credits released to the teacher.'); changed() }} /></div>}
      <ErrorText error={err} />
    </div>
  )
}

export default function Bookings() {
  const [role, setRole] = useState('learner')
  const { data: list } = useData(`/bookings?role=${role}`)
  const active = (list || []).filter(b => ['requested', 'accepted', 'completed', 'disputed'].includes(b.status))
  const past = (list || []).filter(b => !active.includes(b))
  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">My bookings</h1>
        <div className="flex rounded-xl bg-cream-200 p-1 text-sm font-bold">
          {[['learner', 'Learning'], ['teacher', 'Teaching']].map(([r, label]) => (
            <button key={r} onClick={() => setRole(r)} className={`rounded-lg px-4 py-1.5 ${role === r ? 'bg-white shadow' : 'text-ink-500'}`}>{label}</button>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        {list && active.length === 0 && <Empty>{role === 'learner' ? 'Nothing booked. Find something on the Explore page.' : 'No requests right now.'}</Empty>}
        {active.map(b => <BookingRow key={b.id} b={b} role={role} />)}
      </div>
      {past.length > 0 && <>
        <h2 className="mb-3 mt-8 font-extrabold text-ink-500">History</h2>
        <div className="space-y-3">{past.map(b => <BookingRow key={b.id} b={b} role={role} />)}</div>
      </>}
    </div>
  )
}
