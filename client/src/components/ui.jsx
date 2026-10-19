import { Star, Guitar, Code2, Camera, Palette, CakeSlice, Languages, BookOpen, Dumbbell } from 'lucide-react'
import { initials } from '../lib/format.js'

const AVATAR_COLORS = ['#f6b26b', '#e69f7c', '#f4c27a', '#d9a066', '#f2a65a', '#e8b98a', '#c98e5d', '#f7c59f']

export function Avatar({ name = '?', id = 0, size = 36 }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white ring-2 ring-white"
      style={{ width: size, height: size, background: AVATAR_COLORS[id % AVATAR_COLORS.length], fontSize: size * 0.38 }}
      aria-hidden
    >
      {initials(name)}
    </div>
  )
}

export function Rating({ value, count }) {
  if (!count) return <span className="text-xs text-ink-500">New</span>
  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold text-ink-700">
      <Star size={13} className="fill-amber-400 text-amber-400" />
      {value.toFixed(1)}
      {count !== undefined && <span className="font-normal text-ink-500">({count})</span>}
    </span>
  )
}

export function Stars({ value, onChange, size = 22 }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" onClick={() => onChange?.(n)} aria-label={`${n} star${n > 1 ? 's' : ''}`}
          className={onChange ? 'cursor-pointer' : 'cursor-default'}>
          <Star size={size} className={n <= value ? 'fill-amber-400 text-amber-400' : 'text-cream-300'} />
        </button>
      ))}
    </div>
  )
}

const ART = {
  Music: { Icon: Guitar, bg: '#fde3c8', fg: '#c2410c' },
  Programming: { Icon: Code2, bg: '#dbeafe', fg: '#1d4ed8' },
  Arts: { Icon: Camera, bg: '#e7e5e4', fg: '#44403c' },
  Design: { Icon: Palette, bg: '#fce7f3', fg: '#be185d' },
  Cooking: { Icon: CakeSlice, bg: '#fef3c7', fg: '#b45309' },
  Languages: { Icon: Languages, bg: '#dcfce7', fg: '#15803d' },
  Academics: { Icon: BookOpen, bg: '#ede9fe', fg: '#6d28d9' },
  Fitness: { Icon: Dumbbell, bg: '#ccfbf1', fg: '#0f766e' },
}

export function CategoryArt({ category, size = 'md' }) {
  const { Icon, bg, fg } = ART[category] || ART.Academics
  const box = size === 'lg' ? 'h-40' : 'h-24'
  return (
    <div className={`relative flex ${box} items-center justify-center overflow-hidden rounded-xl`} style={{ background: bg }}>
      <div className="absolute -right-4 -top-6 h-20 w-20 rounded-full opacity-40" style={{ background: fg }} />
      <div className="absolute -bottom-8 -left-6 h-20 w-20 rounded-full opacity-20" style={{ background: fg }} />
      <Icon size={size === 'lg' ? 64 : 40} style={{ color: fg }} strokeWidth={1.6} />
    </div>
  )
}

export function CreditBadge({ value, className = '' }) {
  return (
    <span className={`inline-flex h-10 w-10 flex-col items-center justify-center rounded-full bg-ember-500 text-white leading-none shadow ${className}`}>
      <span className="text-sm font-extrabold">{value}</span>
      <span className="text-[9px] font-bold">CR</span>
    </span>
  )
}

export function StatusPill({ status, label }) {
  const tone = {
    requested: 'bg-amber-100 text-amber-800', accepted: 'bg-emerald-100 text-emerald-800',
    completed: 'bg-sky-100 text-sky-800', settled: 'bg-stone-100 text-stone-700', disputed: 'bg-red-100 text-red-700',
    declined: 'bg-stone-100 text-stone-500', cancelled: 'bg-stone-100 text-stone-500', refunded: 'bg-stone-100 text-stone-600',
  }[status] || 'bg-stone-100'
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${tone}`}>{label}</span>
}

export function Empty({ children }) {
  return <div className="rounded-2xl border border-dashed border-cream-300 p-8 text-center text-sm text-ink-500">{children}</div>
}

export function ErrorText({ error }) {
  if (!error) return null
  return <p className="text-sm font-semibold text-red-600">{error.message || String(error)}</p>
}
