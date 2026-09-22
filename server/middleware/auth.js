import { verifyToken } from '../utils/jwt.js'
import User from '../models/User.js'
import { formatUser } from '../utils/format.js'

export async function authOptional(req, _res, next) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return next()

  try {
    const payload = verifyToken(header.slice(7))
    const user = await User.findById(payload.id)
    if (user) req.user = formatUser(user)
  } catch {
    // ignore invalid token
  }
  next()
}

export async function authRequired(req, res, next) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' })
  }

  try {
    const payload = verifyToken(header.slice(7))
    const user = await User.findById(payload.id)
    if (!user) return res.status(401).json({ error: 'User not found' })
    req.user = formatUser(user)
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' })
  }
  next()
}

export function requireAnyAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' })
  }
  next()
}

export function requireContractor(req, res, next) {
  if (req.user?.role !== 'contractor' && req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Contractor access required' })
  }
  next()
}
