import dns from 'dns'
import dotenv from 'dotenv'
import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { connectDB } from './config/db.js'
import { seedDatabase } from './seed.js'
dns.setServers(['8.8.8.8', '1.1.1.1'])
dotenv.config({ override: true })
console.log('SEED_DATABASE=', process.env.SEED_DATABASE)
console.log('Using DNS servers:', dns.getServers())
import authRoutes from './routes/auth.js'
import issueRoutes from './routes/issues.js'
import configRoutes from './routes/config.js'
import chatRoutes from './routes/chat.js'
import uploadRoutes from './routes/uploads.js'
import notificationRoutes from './routes/notifications.js'
import adminRoutes from './routes/admin.js'
import syncRoutes from './routes/sync.js'
import { initializeCleanupJobs } from './utils/cleanup.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 5000

if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is not set in .env')
  process.exit(1)
}

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests from these origins
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:3000',
      process.env.VITE_API_URL?.replace('/api', '') || '',
      'https://civicpulse.vercel.app',
      'https://civicpulse-saliq.vercel.app'
    ].filter(Boolean)
    
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) return callback(null, true)
    
    // Check if origin is in allowed list
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true)
    } else {
      callback(null, true) // Allow all origins in development
    }
  },
  credentials: true
}))
app.use(express.json({ limit: '50mb' }))

// Error handler for JSON parsing failures
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    console.error('JSON parse error:', err.message)
    console.error('Body length:', req.body?.length || 'unknown')
    return res.status(400).json({ error: 'Invalid JSON in request body' })
  }
  next(err)
})

app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'CivicPulse API' })
})

app.use('/api/auth', authRoutes)
app.use('/api/config', configRoutes)
app.use('/api/chat', chatRoutes)
app.use('/api/uploads', uploadRoutes)
app.use('/api/issues', issueRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/user-notifications', notificationRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/sync', syncRoutes)

async function start() {
  try {
    await connectDB(process.env.MONGODB_URI)
    await seedDatabase()
    initializeCleanupJobs()
    app.listen(PORT, () => {
      console.log(`CivicPulse API running on http://localhost:${PORT}`)
    })
  } catch (err) {
    console.error('Failed to start server:', err.message)
    process.exit(1)
  }
}

start()
