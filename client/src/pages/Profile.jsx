import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useApp, useData } from '../lib/app.jsx'
import { api } from '../api/index.js'
import { Avatar, Rating, Empty } from '../components/ui.jsx'
import SkillCard from '../components/SkillCard.jsx'
import { ReviewList } from './SkillDetail.jsx'
import { dateOnly } from '../lib/format.js'

export default function Profile() {
  const { id } = useParams()
  const { user, changed } = useApp()
  const { data: p } = useData(`/users/${id}`)
  const [editing, setEditing] = useState(false)
  const [bio, setBio] = useState('')
  if (!p) return null
  const me = p.id === user.id

  return (
    <div className="space-y-6">
      <div className="card flex flex-wrap items-center gap-5 p-6">
        <Avatar name={p.name} id={p.id} size={72} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold">{p.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-ink-500">
            <Rating value={p.rating} count={p.reviews.length} />
            <span>{p.taught} sessions taught</span>
            <span>{p.learned} learned</span>
            <span>Joined {dateOnly(p.createdAt)}</span>
          </div>
          {editing ? (
            <div className="mt-3 flex gap-2">
              <input className="input" value={bio} onChange={e => setBio(e.target.value)} />
              <button className="btn-primary" onClick={async () => { await api.patch('/me', { bio }); setEditing(false); changed() }}>Save</button>
            </div>
          ) : (
            <p className="mt-3 text-ink-700">{p.bio || 'No bio yet.'} {me && <button className="text-sm text-ember-600 underline" onClick={() => { setBio(p.bio); setEditing(true) }}>Edit</button>}</p>
          )}
        </div>
      </div>
      <div>
        <h2 className="mb-3 font-extrabold">Teaches</h2>
        {p.skills.length === 0 ? <Empty>Not teaching anything yet.</Empty> : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{p.skills.map(s => <SkillCard key={s.id} skill={s} />)}</div>
        )}
      </div>
      <div className="card p-5">
        <h2 className="mb-3 font-extrabold">What learners said</h2>
        <ReviewList reviews={p.reviews} />
      </div>
    </div>
  )
}
