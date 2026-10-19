import { DEMO, API_URL } from '../config.js'

// Both transports expose the same small interface:
//   on(event, fn) -> unsubscribe
//   request(event, payload) -> Promise of the ack
//   send(event, payload)
//   close()
export async function connectRealtime(token, user) {
  if (DEMO) {
    const { connectDemoRealtime } = await import('../demo/realtime.js')
    return connectDemoRealtime(token, user)
  }
  const { io } = await import('socket.io-client')
  const socket = io(API_URL, { auth: { token } })
  return {
    on(event, fn) { socket.on(event, fn); return () => socket.off(event, fn) },
    request: (event, payload) => socket.timeout(8000).emitWithAck(event, payload).catch(() => ({ error: 'No response from server' })),
    send: (event, payload) => socket.emit(event, payload),
    close: () => socket.close(),
  }
}
