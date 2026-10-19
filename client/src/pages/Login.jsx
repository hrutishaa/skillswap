import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../lib/app.jsx'
import { Logo } from '../components/Layout.jsx'
import DemoBanner from '../components/DemoBanner.jsx'
import { Avatar, ErrorText } from '../components/ui.jsx'
import { DEMO } from '../config.js'

const DEMO_USERS = [
  { name: 'Maya Chen', email: 'maya@skillswap.test', id: 1, role: 'Learner, wants to pick up guitar' },
  { name: 'Liam Carter', email: 'liam@skillswap.test', id: 2, role: 'Teaches Guitar Basics' },
]

export default function Login() {
  const { user, login, signup } = useApp()
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const loc = useLocation()
  if (user) return <Navigate to={loc.state?.from || '/'} replace />

  const go = async fn => {
    setBusy(true); setError(null)
    try { await fn(); navigate(loc.state?.from || '/') } catch (e) { setError(e) } finally { setBusy(false) }
  }
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <div className="min-h-screen">
      <DemoBanner />
      <div className="mx-auto grid max-w-5xl items-center gap-10 px-4 py-16 md:grid-cols-2">
        <div>
          <Logo />
          <h1 className="mt-8 text-4xl font-extrabold leading-tight">Teach what you know.<br />Learn what you don't.</h1>
          <p className="mt-4 text-ink-500">
            Students trade lessons with each other using credits instead of money. You start with 100.
            Teach an hour of something you are good at and you earn enough to learn something new.
          </p>
        </div>
        <div className="card p-6">
          {DEMO && (
            <div className="mb-6">
              <p className="label">Try it as</p>
              <div className="grid gap-2">
                {DEMO_USERS.map(u => (
                  <button key={u.email} disabled={busy} onClick={() => go(() => login(u.email, 'password123'))}
                    className="flex items-center gap-3 rounded-xl border border-cream-300 p-3 text-left hover:border-ember-400 hover:bg-cream-50">
                    <Avatar name={u.name} id={u.id} />
                    <div><div className="font-bold">{u.name}</div><div className="text-xs text-ink-500">{u.role}</div></div>
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs text-ink-500">Every seeded account uses the password password123.</p>
            </div>
          )}
          <form className="space-y-3" onSubmit={e => { e.preventDefault(); go(() => (mode === 'login' ? login(form.email, form.password) : signup(form))) }}>
            {mode === 'signup' && <div><label className="label" htmlFor="name">Name</label><input id="name" className="input" value={form.name} onChange={set('name')} /></div>}
            <div><label className="label" htmlFor="email">Email</label><input id="email" type="email" className="input" value={form.email} onChange={set('email')} /></div>
            <div><label className="label" htmlFor="password">Password</label><input id="password" type="password" className="input" value={form.password} onChange={set('password')} /></div>
            <ErrorText error={error} />
            <button className="btn-primary w-full" disabled={busy}>{mode === 'login' ? 'Log in' : 'Create account'}</button>
          </form>
          <button className="mt-3 w-full text-center text-sm text-ink-500 hover:text-ember-600" onClick={() => setMode(m => (m === 'login' ? 'signup' : 'login'))}>
            {mode === 'login' ? 'New here? Create an account' : 'Already have an account? Log in'}
          </button>
        </div>
      </div>
    </div>
  )
}
