import { Router } from 'express'
import bcrypt from 'bcryptjs'
import User from '../models/User.js'
import { formatUser } from '../utils/format.js'
import { signToken } from '../utils/jwt.js'
import { authRequired, requireAdmin } from '../middleware/auth.js'
import { DEFAULT_TRUST_SCORE } from '../config/constants.js'

const router = Router()

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' })
    }

    const user = await User.findOne({ email: email.toLowerCase() })
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const valid = await bcrypt.compare(password, user.password)
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const token = signToken(user)
    res.json({ user: formatUser(user), token })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'All fields required' })
    }

    const exists = await User.findOne({ email: email.toLowerCase() })
    if (exists) {
      return res.status(409).json({ error: 'Email already registered' })
    }

    const validRoles = ['citizen', 'admin', 'contractor']
    const assignedRole = role && validRoles.includes(role) ? role : 'citizen'

    const hashed = await bcrypt.hash(password, 10)
    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password: hashed,
      role: assignedRole,
      companyName: assignedRole === 'contractor' ? 'Apex Infra Repairs Ltd' : null,
      assignedDepartment: assignedRole === 'contractor' ? 'Roads & Bridges Department' : null,
      trustScore: DEFAULT_TRUST_SCORE,
    })

    const token = signToken(user)
    res.status(201).json({ user: formatUser(user), token })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/me', authRequired, (req, res) => {
  res.json({ user: req.user })
})

router.post('/apply-contractor', authRequired, async (req, res) => {
  try {
    const { companyName, assignedDepartment } = req.body
    const user = await User.findById(req.user.id)
    if (!user) return res.status(404).json({ error: 'User not found' })

    user.contractorApplication = {
      status: 'pending',
      requestedAt: new Date(),
      companyName: companyName || 'Civic Infra Repairs Ltd',
      assignedDepartment: assignedDepartment || 'Roads & Bridges Department',
      notes: 'Citizen requested contractor access',
    }

    await user.save()
    res.json({ message: 'Contractor application submitted for admin review', user: formatUser(user) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/logout', authRequired, (_req, res) => {
  res.json({ message: 'Logged out' })
})

export default router
