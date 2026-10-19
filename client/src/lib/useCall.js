import { useCallback, useEffect, useRef, useState } from 'react'

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }]

// When there is no camera (or permission is denied) we still want the call to
// work, so we send a generated video track and a silent audio track instead.
function placeholderStream(label) {
  const canvas = Object.assign(document.createElement('canvas'), { width: 640, height: 360 })
  const ctx = canvas.getContext('2d')
  let t = 0
  const draw = () => {
    t += 1
    ctx.fillStyle = '#3b2a1e'
    ctx.fillRect(0, 0, 640, 360)
    ctx.fillStyle = '#f47b20'
    ctx.beginPath()
    ctx.arc(320 + Math.sin(t / 20) * 120, 180, 40, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fff7ec'
    ctx.font = 'bold 28px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(label, 320, 320)
  }
  const timer = setInterval(draw, 66)
  draw()
  const stream = canvas.captureStream(15)
  try {
    const audio = new AudioContext()
    const dest = audio.createMediaStreamDestination()
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    gain.gain.value = 0
    osc.connect(gain).connect(dest)
    osc.start()
    dest.stream.getAudioTracks().forEach(tr => stream.addTrack(tr))
  } catch { /* video only */ }
  stream.stop = () => clearInterval(timer)
  return stream
}

export function useCall({ rt, bookingId, isOfferer, label, enabled }) {
  const [localStream, setLocalStream] = useState(null)
  const [remoteStream, setRemoteStream] = useState(null)
  const [state, setState] = useState('starting')
  const [peerHere, setPeerHere] = useState(false)
  const [muted, setMuted] = useState(false)
  const [cameraOff, setCameraOff] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [usingPlaceholder, setUsingPlaceholder] = useState(false)
  const [error, setError] = useState(null)
  const pcRef = useRef(null)
  const localRef = useRef(null)
  const screenRef = useRef(null)
  const pendingIce = useRef([])

  const signal = useCallback(data => rt.send('rtc:signal', { bookingId, data }), [rt, bookingId])

  const closePeer = useCallback(() => {
    pcRef.current?.close()
    pcRef.current = null
    pendingIce.current = []
    setRemoteStream(null)
  }, [])

  const startPeer = useCallback(() => {
    closePeer()
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    pcRef.current = pc
    const local = localRef.current
    local.getTracks().forEach(track => pc.addTrack(track, local))
    if (screenRef.current) {
      const sender = pc.getSenders().find(s => s.track?.kind === 'video')
      sender?.replaceTrack(screenRef.current.getVideoTracks()[0])
    }
    pc.onicecandidate = e => e.candidate && signal({ kind: 'ice', candidate: e.candidate.toJSON() })
    pc.ontrack = e => setRemoteStream(e.streams[0] || new MediaStream([e.track]))
    pc.onconnectionstatechange = () => setState(pc.connectionState)
    setState('connecting')
    return pc
  }, [closePeer, signal])

  const makeOffer = useCallback(async () => {
    const pc = startPeer()
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    signal({ kind: 'sdp', description: pc.localDescription.toJSON() })
  }, [startPeer, signal])

  useEffect(() => {
    if (!rt || !enabled) return
    let stopped = false
    const offs = []

    async function init() {
      let stream
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 360 }, audio: true })
      } catch {
        stream = placeholderStream(label)
        setUsingPlaceholder(true)
      }
      if (stopped) { stream.getTracks().forEach(t => t.stop()); return }
      localRef.current = stream
      setLocalStream(stream)

      offs.push(rt.on('session:peer', ({ type }) => {
        if (type === 'joined') {
          setPeerHere(true)
          // The learner always announces itself and the teacher answers with an
          // offer, so there is exactly one offer per pairing.
          if (!isOfferer) signal({ kind: 'ready' })
        } else {
          setPeerHere(false)
          closePeer()
          setState('waiting')
        }
      }))

      offs.push(rt.on('rtc:signal', async ({ data }) => {
        try {
          if (data.kind === 'ready') {
            setPeerHere(true)
            if (isOfferer) makeOffer()
          } else if (data.kind === 'sdp' && data.description.type === 'offer') {
            setPeerHere(true)
            const pc = startPeer()
            await pc.setRemoteDescription(data.description)
            for (const c of pendingIce.current.splice(0)) await pc.addIceCandidate(c).catch(() => {})
            await pc.setLocalDescription(await pc.createAnswer())
            signal({ kind: 'sdp', description: pc.localDescription.toJSON() })
          } else if (data.kind === 'sdp' && data.description.type === 'answer') {
            const pc = pcRef.current
            if (pc?.signalingState === 'have-local-offer') {
              await pc.setRemoteDescription(data.description)
              for (const c of pendingIce.current.splice(0)) await pc.addIceCandidate(c).catch(() => {})
            }
          } else if (data.kind === 'ice') {
            const pc = pcRef.current
            if (pc?.remoteDescription) await pc.addIceCandidate(data.candidate).catch(() => {})
            else pendingIce.current.push(data.candidate)
          }
        } catch (e) {
          console.warn('signaling', e)
        }
      }))

      const res = await rt.request('session:join', { bookingId })
      if (res?.error) { setError(res.error); return }
      setState('waiting')
      // If the other side is already in the room, this tells them to (re)start.
      if (!isOfferer) signal({ kind: 'ready' })
    }
    init()

    return () => {
      stopped = true
      offs.forEach(off => off())
      rt.send('session:leave', { bookingId })
      closePeer()
      localRef.current?.getTracks().forEach(t => t.stop())
      localRef.current?.stop?.()
      screenRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [rt, bookingId, enabled]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMute = () => {
    const next = !muted
    localRef.current?.getAudioTracks().forEach(t => { t.enabled = !next })
    setMuted(next)
  }

  const toggleCamera = () => {
    const next = !cameraOff
    localRef.current?.getVideoTracks().forEach(t => { t.enabled = !next })
    setCameraOff(next)
  }

  const videoSender = () => pcRef.current?.getSenders().find(s => s.track?.kind === 'video')

  const stopShare = useCallback(() => {
    screenRef.current?.getTracks().forEach(t => t.stop())
    screenRef.current = null
    setSharing(false)
    videoSender()?.replaceTrack(localRef.current.getVideoTracks()[0])
    setLocalStream(localRef.current)
  }, [])

  const toggleShare = async () => {
    if (sharing) return stopShare()
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: true })
      screenRef.current = screen
      const track = screen.getVideoTracks()[0]
      track.onended = stopShare
      await videoSender()?.replaceTrack(track)
      setLocalStream(new MediaStream([track]))
      setSharing(true)
    } catch { /* user closed the picker */ }
  }

  return { localStream, remoteStream, state, peerHere, muted, cameraOff, sharing, usingPlaceholder, error, toggleMute, toggleCamera, toggleShare, signal }
}
