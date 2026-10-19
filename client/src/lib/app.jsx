import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { api, getToken, setToken } from '../api/index.js'
import { connectRealtime } from '../api/realtime.js'

const AppContext = createContext(null)
export const useApp = () => useContext(AppContext)

export function AppProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)
  const [rt, setRt] = useState(null)
  const [version, setVersion] = useState(0)
  const [toast, setToast] = useState(null)
  const toastTimer = useRef()

  const bump = useCallback(() => setVersion(v => v + 1), [])

  const showToast = useCallback(text => {
    setToast(text)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 4000)
  }, [])

  const refreshMe = useCallback(async () => {
    if (!getToken()) { setUser(null); return null }
    try {
      const me = await api.get('/me')
      setUser(me)
      return me
    } catch {
      setToken(null)
      setUser(null)
      return null
    }
  }, [])

  useEffect(() => { refreshMe().finally(() => setReady(true)) }, [refreshMe])

  // One realtime connection per logged in tab.
  const userId = user?.id
  useEffect(() => {
    if (!userId) return
    let conn
    let closed = false
    connectRealtime(getToken(), { id: userId }).then(c => {
      if (closed) return c.close()
      conn = c
      setRt(c)
      c.on('notification', n => { showToast(n.body); refreshMe(); bump() })
      c.on('data:changed', () => { refreshMe(); bump() })
    })
    return () => { closed = true; conn?.close(); setRt(null) }
  }, [userId, refreshMe, bump, showToast])

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password })
    setToken(res.token)
    return refreshMe()
  }
  const signup = async form => {
    const res = await api.post('/auth/signup', form)
    setToken(res.token)
    return refreshMe()
  }
  const logout = () => { setToken(null); setUser(null) }

  // Call after any action that changes balances or bookings.
  const changed = useCallback(() => { refreshMe(); bump() }, [refreshMe, bump])

  return (
    <AppContext.Provider value={{ user, ready, rt, version, changed, login, signup, logout, showToast, toast }}>
      {children}
    </AppContext.Provider>
  )
}

// Small data hook that refetches when anything in the app changes.
export function useData(path, deps = []) {
  const { version } = useApp()
  const [state, setState] = useState({ data: null, error: null, loading: true })
  useEffect(() => {
    if (!path) return
    let live = true
    api.get(path)
      .then(data => live && setState({ data, error: null, loading: false }))
      .catch(error => live && setState(s => ({ data: s.data, error, loading: false })))
    return () => { live = false }
  }, [path, version, ...deps])
  return state
}
