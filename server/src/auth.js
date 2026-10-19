import jwt from 'jsonwebtoken'
import { HttpError } from './db.js'

const SECRET = process.env.JWT_SECRET || 'dev-only-secret'

export const sign = user => jwt.sign({ id: user.id, role: user.role }, SECRET, { expiresIn: '7d' })
export const verify = token => jwt.verify(token, SECRET)

export function requireUser(req, _res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '')
  try {
    req.user = verify(token)
    next()
  } catch {
    next(new HttpError(401, 'Please log in'))
  }
}

export function requireAdmin(req, _res, next) {
  if (req.user?.role !== 'admin') return next(new HttpError(403, 'Moderators only'))
  next()
}
