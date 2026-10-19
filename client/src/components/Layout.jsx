import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate, useSearchParams } from 'react-router-dom'
import { Search, Bell, Compass, CalendarDays, GraduationCap, Wallet, LogOut, ArrowLeftRight, Coins } from 'lucide-react'
import { useApp, useData } from '../lib/app.jsx'
import { Avatar } from './ui.jsx'
import { api } from '../api/index.js'
import { relative } from '../lib/format.js'
import DemoBanner from './DemoBanner.jsx'

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ember-500 text-white">
        <ArrowLeftRight size={20} strokeWidth={2.5} />
      </span>
      <span className="text-xl font-extrabold tracking-tight">Skill<span className="text-ember-500">Swap</span></span>
    </Link>
  )
}

function Topbar() {
  const { user, logout } = useApp()
  const [params] = useSearchParams()
  const [q, setQ] = useState(params.get('q') || '')
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { data: notes } = useData('/notifications')
  const unread = (notes || []).filter(n => !n.read).length

  return (
    <header className="sticky top-0 z-20 border-b border-cream-200 bg-cream-50/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        <Logo />
        <form className="relative flex-1" onSubmit={e => { e.preventDefault(); navigate(`/?q=${encodeURIComponent(q)}`) }}>
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search for skills to learn..." className="input rounded-full pl-9" aria-label="Search skills" />
        </form>
        <div className="relative">
          <button className="btn-ghost relative px-2" onClick={() => { setOpen(o => !o); if (unread) api.post('/notifications/read') }} aria-label="Notifications">
            <Bell size={20} />
            {unread > 0 && <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-ember-500" />}
          </button>
          {open && (
            <div className="card absolute right-0 mt-2 w-80 p-2">
              {(notes || []).length === 0 && <p className="p-3 text-sm text-ink-500">Nothing yet.</p>}
              {(notes || []).slice(0, 8).map(n => (
                <Link key={n.id} to="/bookings" onClick={() => setOpen(false)} className="block rounded-lg p-2 text-sm hover:bg-cream-100">
                  <div>{n.body}</div>
                  <div className="text-xs text-ink-500">{relative(n.createdAt)}</div>
                </Link>
              ))}
            </div>
          )}
        </div>
        <Link to={`/users/${user.id}`} className="flex items-center gap-2" data-testid="current-user">
          <Avatar name={user.name} id={user.id} />
          <span className="hidden text-sm font-bold md:block">{user.name}</span>
        </Link>
        <button className="btn-ghost px-2" onClick={() => { logout(); navigate('/login') }} aria-label="Log out" title="Log out"><LogOut size={18} /></button>
      </div>
    </header>
  )
}

function MiniCalendar({ sessions }) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = Array.from({ length: 7 }, (_, i) => new Date(today.getTime() + i * 86400000))
  const has = d => sessions.some(s => new Date(s.startsAt).toDateString() === d.toDateString())
  return (
    <div className="grid grid-cols-7 gap-1 text-center">
      {days.map((d, i) => (
        <div key={i} className={`rounded-lg py-1 ${i === 0 ? 'bg-ember-500 text-white' : 'bg-cream-100'}`}>
          <div className="text-[10px] font-bold uppercase opacity-80">{d.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2)}</div>
          <div className="text-sm font-extrabold">{d.getDate()}</div>
          <div className={`mx-auto mt-0.5 h-1 w-1 rounded-full ${has(d) ? (i === 0 ? 'bg-white' : 'bg-ember-500') : 'bg-transparent'}`} />
        </div>
      ))}
    </div>
  )
}

function Sidebar() {
  const { user } = useApp()
  const { data: bookings } = useData('/bookings')
  const upcoming = (bookings || [])
    .filter(b => ['requested', 'accepted'].includes(b.status) && new Date(b.startsAt).getTime() + b.minutes * 60000 > Date.now())
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const nav = [
    ['/', 'Explore', Compass],
    ['/bookings', 'My bookings', CalendarDays],
    ['/teach', 'Teach a skill', GraduationCap],
    ['/wallet', 'Wallet', Wallet],
  ]
  return (
    <aside className="space-y-4">
      <div className="card overflow-hidden text-center">
        <div className="bg-gradient-to-b from-cream-200 to-white px-4 pb-4 pt-5">
          <div className="text-sm font-bold text-ink-700">Your Credits</div>
          <div className="mx-auto my-3 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-ember-500 shadow-inner">
            <Coins size={30} className="text-white" />
          </div>
          <div className="text-3xl font-extrabold" data-testid="balance">{user.balance} <span className="text-base text-ember-600">CR</span></div>
          <Link to="/credits" className="btn-primary mt-3 w-full">Get More Credits</Link>
        </div>
      </div>
      <div className="card p-4">
        <div className="mb-3 text-sm font-extrabold">Upcoming Sessions</div>
        <MiniCalendar sessions={upcoming} />
        <div className="mt-3 space-y-2">
          {upcoming.length === 0 && <p className="text-xs text-ink-500">No sessions booked yet.</p>}
          {upcoming.slice(0, 3).map(b => (
            <Link key={b.id} to="/bookings" className="block rounded-xl bg-cream-100 p-2 text-xs hover:bg-cream-200">
              <div className="font-bold">{b.title}</div>
              <div className="text-ink-500">
                {b.teacherId === user.id ? `with ${b.learnerName}` : `with ${b.teacherName}`} &middot; {relative(b.startsAt)}
              </div>
            </Link>
          ))}
        </div>
      </div>
      <nav className="card p-2">
        {nav.map(([to, label, Icon]) => (
          <NavLink key={to} to={to} end className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold ${isActive ? 'bg-cream-200 text-ember-700' : 'hover:bg-cream-100'}`}>
            <Icon size={17} /> {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}

export default function Layout() {
  const { toast } = useApp()
  return (
    <div className="min-h-screen">
      <DemoBanner />
      <Topbar />
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[250px_1fr]">
        <Sidebar />
        <main className="min-w-0"><Outlet /></main>
      </div>
      {toast && <div className="fixed bottom-5 right-5 z-50 max-w-sm rounded-xl bg-ink-900 px-4 py-3 text-sm text-white shadow-lg" role="status">{toast}</div>}
    </div>
  )
}
