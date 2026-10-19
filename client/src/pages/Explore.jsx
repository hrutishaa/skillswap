import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useData } from '../lib/app.jsx'
import SkillCard from '../components/SkillCard.jsx'
import { Empty } from '../components/ui.jsx'
import { CATEGORIES, LEVELS } from '@shared/policy.js'

export default function Explore() {
  const [params, setParams] = useSearchParams()
  const [filters, setFilters] = useState({ category: '', level: '', maxCredits: '', sort: '' })
  const q = params.get('q') || ''
  const qs = new URLSearchParams(Object.entries({ q, ...filters }).filter(([, v]) => v)).toString()
  const { data: skills, loading } = useData(`/skills?${qs}`)
  const set = (k, v) => setFilters(f => ({ ...f, [k]: f[k] === v ? '' : v }))

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Explore Skills &amp; Connect</h1>
          <p className="text-sm text-ink-500">
            {q ? <>Results for "{q}" <button className="ml-1 text-ember-600 underline" onClick={() => setParams({})}>clear</button></> : 'Book an hour with another student. Credits are held until the session is done.'}
          </p>
        </div>
        <div className="flex gap-2">
          <select className="input w-auto" value={filters.level} onChange={e => setFilters(f => ({ ...f, level: e.target.value }))} aria-label="Level">
            <option value="">Any level</option>
            {LEVELS.map(l => <option key={l}>{l}</option>)}
          </select>
          <select className="input w-auto" value={filters.maxCredits} onChange={e => setFilters(f => ({ ...f, maxCredits: e.target.value }))} aria-label="Price">
            <option value="">Any price</option>
            <option value="15">Up to 15 CR</option>
            <option value="25">Up to 25 CR</option>
          </select>
          <select className="input w-auto" value={filters.sort} onChange={e => setFilters(f => ({ ...f, sort: e.target.value }))} aria-label="Sort">
            <option value="">Popular</option>
            <option value="rating">Top rated</option>
            <option value="cheap">Cheapest</option>
            <option value="new">Newest</option>
          </select>
        </div>
      </div>
      <div className="mb-5 flex flex-wrap gap-2">
        {CATEGORIES.map(c => (
          <button key={c} onClick={() => set('category', c)}
            className={`rounded-full px-3 py-1 text-sm font-semibold ${filters.category === c ? 'bg-ember-500 text-white' : 'bg-white border border-cream-200 hover:border-ember-400'}`}>
            {c}
          </button>
        ))}
      </div>
      {!loading && skills?.length === 0 && <Empty>Nobody teaches that yet. Maybe you could.</Empty>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(skills || []).map(s => <SkillCard key={s.id} skill={s} />)}
      </div>
    </div>
  )
}
