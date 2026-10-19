import { DEMO, API_URL } from '../config.js'

const TOKEN_KEY = 'skillswap-token'
// sessionStorage keeps logins per tab, which lets two tabs act as two users.
export const getToken = () => sessionStorage.getItem(TOKEN_KEY)
export const setToken = t => (t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY))

async function httpRequest(method, path, body, token) {
  const res = await fetch(`${API_URL}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`)
    err.status = res.status
    throw err
  }
  return data
}

let demoModule
async function request(method, path, body) {
  if (DEMO) {
    demoModule ||= await import('../demo/backend.js')
    return demoModule.demoRequest(method, path, body, getToken())
  }
  return httpRequest(method, path, body, getToken())
}

export const api = {
  get: path => request('GET', path),
  post: (path, body) => request('POST', path, body || {}),
  patch: (path, body) => request('PATCH', path, body),
}
