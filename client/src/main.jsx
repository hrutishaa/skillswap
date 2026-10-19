import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import './index.css'
import { AppProvider, useApp } from './lib/app.jsx'
import Layout from './components/Layout.jsx'
import Login from './pages/Login.jsx'
import Explore from './pages/Explore.jsx'
import SkillDetail from './pages/SkillDetail.jsx'
import Profile from './pages/Profile.jsx'
import Teach from './pages/Teach.jsx'
import Bookings from './pages/Bookings.jsx'
import WalletPage from './pages/Wallet.jsx'
import Credits from './pages/Credits.jsx'
import Session from './pages/Session.jsx'

function RequireUser({ children }) {
  const { user, ready } = useApp()
  const loc = useLocation()
  if (!ready) return null
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />
  return children
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/session/:id" element={<RequireUser><Session /></RequireUser>} />
      <Route element={<RequireUser><Layout /></RequireUser>}>
        <Route path="/" element={<Explore />} />
        <Route path="/skills/:id" element={<SkillDetail />} />
        <Route path="/users/:id" element={<Profile />} />
        <Route path="/teach" element={<Teach />} />
        <Route path="/bookings" element={<Bookings />} />
        <Route path="/wallet" element={<WalletPage />} />
        <Route path="/credits" element={<Credits />} />
      </Route>
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <AppProvider>
        <App />
      </AppProvider>
    </HashRouter>
  </React.StrictMode>,
)
