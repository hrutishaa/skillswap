import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Mic, MicOff, Video, VideoOff, MonitorUp, PhoneOff, Send } from 'lucide-react'
import { useApp, useData } from '../lib/app.jsx'
import { api } from '../api/index.js'
import { useCall } from '../lib/useCall.js'
import { Avatar, ErrorText } from '../components/ui.jsx'
import { RateForm } from './Bookings.jsx'
import { Logo } from '../components/Layout.jsx'

function VideoTile({ stream, muted, label, mirrored, testid }) {
  const ref = useRef()
  useEffect(() => { if (ref.current) ref.current.srcObject = stream || null }, [stream])
  return (
    <div className="relative aspect-video overflow-hidden rounded-2xl bg-ink-900">
      <video ref={ref} autoPlay playsInline muted={muted} data-testid={testid}
        className={`h-full w-full object-cover ${mirrored ? '-scale-x-100' : ''}`} />
      <span className="absolute bottom-2 left-2 rounded-lg bg-black/50 px-2 py-0.5 text-xs text-white">{label}</span>
    </div>
  )
}

function useTimer(running) {
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setSecs(s => s + 1), 1000)
    return () => clearInterval(id)
  }, [running])
  return secs
}

const mmss = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

function Chat({ rt, bookingId, user }) {
  const { data: history } = useData(`/bookings/${bookingId}/messages`)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const end = useRef()
  useEffect(() => { if (history) setMessages(history) }, [history])
  useEffect(() => rt?.on('chat:message', m => setMessages(list => (list.some(x => x.id === m.id) ? list : [...list, m]))), [rt])
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [messages])
  const send = async e => {
    e.preventDefault()
    if (!text.trim()) return
    await rt.request('chat:send', { bookingId, body: text })
    setText('')
  }
  return (
    <div className="card flex h-full min-h-[320px] flex-col">
      <div className="border-b border-cream-200 px-4 py-3 font-extrabold">Chat</div>
      <div className="flex-1 space-y-2 overflow-auto p-3" data-testid="chat">
        {messages.length === 0 && <p className="text-xs text-ink-500">Messages are saved with the booking.</p>}
        {messages.map(m => (
          <div key={m.id} className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.senderId === user.id ? 'ml-auto bg-ember-500 text-white' : 'bg-cream-100'}`}>
            {m.senderId !== user.id && <div className="text-[11px] font-bold opacity-70">{m.senderName}</div>}
            {m.body}
          </div>
        ))}
        <div ref={end} />
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-cream-200 p-2">
        <input className="input" value={text} onChange={e => setText(e.target.value)} placeholder="Say something" aria-label="Message" />
        <button className="btn-primary px-3" aria-label="Send"><Send size={16} /></button>
      </form>
    </div>
  )
}

export default function Session() {
  const { id } = useParams()
  const bookingId = Number(id)
  const { user, rt, changed } = useApp()
  const navigate = useNavigate()
  const { data: booking, error } = useData(`/bookings/${bookingId}`)
  const [ended, setEnded] = useState(false)
  const [rated, setRated] = useState(false)
  const [endErr, setEndErr] = useState(null)
  const isTeacher = booking?.teacherId === user.id
  const allowed = booking && ['accepted', 'completed'].includes(booking.status)
  const call = useCall({ rt, bookingId, isOfferer: isTeacher, label: user.name, enabled: !!allowed && !ended })
  const secs = useTimer(call.state === 'connected' && !ended)

  useEffect(() => rt?.on('rtc:signal', ({ data }) => { if (data.kind === 'ended') { setEnded(true); changed() } }), [rt, changed])

  const endSession = async () => {
    setEndErr(null)
    try {
      if (booking.status === 'accepted') await api.post(`/bookings/${bookingId}/complete`)
      call.signal({ kind: 'ended' })
      setEnded(true)
      changed()
    } catch (e) { setEndErr(e) }
  }

  if (error) return <div className="p-10"><ErrorText error={error} /></div>
  if (!booking) return null
  const other = isTeacher ? { name: booking.learnerName, id: booking.learnerId } : { name: booking.teacherName, id: booking.teacherId }

  if (!allowed && !ended) {
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <p className="mb-4">This session is {booking.status}, so the room is closed.</p>
        <Link to="/bookings" className="btn-primary">Back to bookings</Link>
      </div>
    )
  }

  if (ended) {
    return (
      <div className="mx-auto max-w-lg p-10">
        <div className="card space-y-4 p-6 text-center" data-testid="session-ended">
          <Avatar name={other.name} id={other.id} size={64} />
          <h1 className="text-xl font-extrabold">Session finished</h1>
          {!isTeacher && !rated && <>
            <p className="text-sm text-ink-500">How was {booking.title} with {other.name.split(' ')[0]}? Rating releases the {booking.credits} CR held in escrow.</p>
            <RateForm booking={booking} onDone={() => { setRated(true); changed() }} />
          </>}
          {!isTeacher && rated && <p>Thanks. {booking.credits} CR went to {other.name.split(' ')[0]}.</p>}
          {isTeacher && <p className="text-sm text-ink-500">Nice work. The {booking.credits} CR move to your wallet when {other.name.split(' ')[0]} rates the session, or automatically after 24 hours.</p>}
          <button className="btn-soft" onClick={() => navigate('/bookings')}>Back to bookings</button>
        </div>
      </div>
    )
  }

  const statusText = call.error || (call.state === 'connected' ? 'Connected' : call.peerHere ? 'Connecting...' : `Waiting for ${other.name.split(' ')[0]} to join`)

  return (
    <div className="min-h-screen bg-cream-100">
      <header className="flex items-center justify-between border-b border-cream-200 bg-cream-50 px-4 py-3">
        <Logo />
        <div className="text-center">
          <div className="font-extrabold">{booking.title}</div>
          <div className="text-xs text-ink-500">with {other.name}</div>
        </div>
        <div className="text-right">
          <div className="font-mono text-lg font-bold" data-testid="timer">{mmss(secs)}</div>
          <div className="text-xs text-ink-500">of {booking.minutes} min</div>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-4 p-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <span className={`h-2.5 w-2.5 rounded-full ${call.state === 'connected' ? 'bg-emerald-500' : 'bg-amber-400'}`} />
            <span data-testid="call-state" data-state={call.state}>{statusText}</span>
            {call.usingPlaceholder && <span className="text-xs text-ink-500">(no camera found, sending a test pattern)</span>}
          </div>
          <div className="relative">
            <VideoTile stream={call.remoteStream} label={other.name} testid="remote-video" />
            <div className="absolute bottom-3 right-3 w-1/4 min-w-[140px] shadow-lg">
              <VideoTile stream={call.localStream} muted mirrored={!call.sharing} label={call.sharing ? 'Your screen' : 'You'} testid="local-video" />
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <button className={call.muted ? 'btn-primary' : 'btn-soft'} onClick={call.toggleMute}>{call.muted ? <MicOff size={16} /> : <Mic size={16} />}{call.muted ? 'Unmute' : 'Mute'}</button>
            <button className={call.cameraOff ? 'btn-primary' : 'btn-soft'} onClick={call.toggleCamera}>{call.cameraOff ? <VideoOff size={16} /> : <Video size={16} />}{call.cameraOff ? 'Camera on' : 'Camera off'}</button>
            <button className={call.sharing ? 'btn-primary' : 'btn-soft'} onClick={call.toggleShare}><MonitorUp size={16} />{call.sharing ? 'Stop sharing' : 'Share screen'}</button>
            <button className="btn bg-red-600 text-white hover:bg-red-700" onClick={endSession}><PhoneOff size={16} />End session</button>
          </div>
          <ErrorText error={endErr} />
        </div>
        <Chat rt={rt} bookingId={bookingId} user={user} />
      </div>
    </div>
  )
}
