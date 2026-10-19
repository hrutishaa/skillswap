import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { useApp } from '../lib/app.jsx'
import { api } from '../api/index.js'
import { ErrorText } from '../components/ui.jsx'
import { when } from '../lib/format.js'
import { CATEGORIES, LEVELS } from '@shared/policy.js'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function weeklySlots(days, time, minutes, weeks) {
  const [h, m] = time.split(':').map(Number)
  const out = []
  const start = new Date()
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i, h, m)
    if (days.includes(d.getDay()) && d > start) out.push({ startsAt: d.toISOString(), minutes })
  }
  return out
}

export default function Teach() {
  const { changed, showToast } = useApp()
  const navigate = useNavigate()
  const [form, setForm] = useState({ title: '', description: '', category: CATEGORIES[0], level: LEVELS[0], creditsPerHour: 20 })
  const [pattern, setPattern] = useState({ days: [2, 4], time: '18:00', minutes: 60, weeks: 2 })
  const [slots, setSlots] = useState([])
  const [single, setSingle] = useState('')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const addSlots = list => setSlots(s => [...s, ...list].sort((a, b) => a.startsAt.localeCompare(b.startsAt)))

  const submit = async e => {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      const skill = await api.post('/skills', { ...form, creditsPerHour: Number(form.creditsPerHour), slots })
      changed()
      showToast('Your skill is listed.')
      navigate(`/skills/${skill.id}`)
    } catch (e) { setErr(e) } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <div className="card space-y-4 p-6">
        <div>
          <h1 className="text-2xl font-extrabold">Teach a skill</h1>
          <p className="text-sm text-ink-500">You earn the credits when the learner rates the session, or 24 hours after it ends if they don't. Your first lesson also earns a 10 CR bonus.</p>
        </div>
        <div><label className="label" htmlFor="title">Title</label><input id="title" className="input" value={form.title} onChange={set('title')} placeholder="Intro to chess openings" /></div>
        <div><label className="label" htmlFor="desc">What will people learn</label><textarea id="desc" rows={4} className="input" value={form.description} onChange={set('description')} /></div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div><label className="label" htmlFor="cat">Category</label><select id="cat" className="input" value={form.category} onChange={set('category')}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
          <div><label className="label" htmlFor="lvl">Level</label><select id="lvl" className="input" value={form.level} onChange={set('level')}>{LEVELS.map(c => <option key={c}>{c}</option>)}</select></div>
          <div><label className="label" htmlFor="cph">Credits per hour</label><input id="cph" type="number" min={1} max={100} className="input" value={form.creditsPerHour} onChange={set('creditsPerHour')} /></div>
        </div>
        <ErrorText error={err} />
        <button className="btn-primary" disabled={busy}>Publish listing</button>
      </div>
      <div className="card h-fit space-y-4 p-5">
        <h2 className="font-extrabold">Availability</h2>
        <div>
          <span className="label">Repeat on</span>
          <div className="flex flex-wrap gap-1">
            {WEEKDAYS.map((d, i) => (
              <button type="button" key={d} onClick={() => setPattern(p => ({ ...p, days: p.days.includes(i) ? p.days.filter(x => x !== i) : [...p.days, i] }))}
                className={`rounded-lg px-2 py-1 text-xs font-bold ${pattern.days.includes(i) ? 'bg-ember-500 text-white' : 'bg-cream-100'}`}>{d}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div><label className="label" htmlFor="time">At</label><input id="time" type="time" className="input" value={pattern.time} onChange={e => setPattern(p => ({ ...p, time: e.target.value }))} /></div>
          <div><label className="label" htmlFor="mins">Minutes</label><select id="mins" className="input" value={pattern.minutes} onChange={e => setPattern(p => ({ ...p, minutes: Number(e.target.value) }))}>{[30, 45, 60, 90, 120].map(m => <option key={m}>{m}</option>)}</select></div>
          <div><label className="label" htmlFor="weeks">Weeks</label><input id="weeks" type="number" min={1} max={8} className="input" value={pattern.weeks} onChange={e => setPattern(p => ({ ...p, weeks: Number(e.target.value) }))} /></div>
        </div>
        <button type="button" className="btn-soft w-full" onClick={() => addSlots(weeklySlots(pattern.days, pattern.time, pattern.minutes, pattern.weeks))}>Add these times</button>
        <div className="flex gap-2">
          <input type="datetime-local" className="input" value={single} onChange={e => setSingle(e.target.value)} aria-label="One-off time" />
          <button type="button" className="btn-soft" disabled={!single} onClick={() => { addSlots([{ startsAt: new Date(single).toISOString(), minutes: pattern.minutes }]); setSingle('') }}>Add</button>
        </div>
        <div className="max-h-64 space-y-1 overflow-auto">
          {slots.length === 0 && <p className="text-xs text-ink-500">No times added. You can still publish and add them later.</p>}
          {slots.map((s, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg bg-cream-50 px-2 py-1 text-xs">
              <span>{when(s.startsAt)} &middot; {s.minutes} min</span>
              <button type="button" onClick={() => setSlots(list => list.filter((_, j) => j !== i))} aria-label="Remove"><X size={14} /></button>
            </div>
          ))}
        </div>
      </div>
    </form>
  )
}
