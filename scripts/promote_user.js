import dns from 'dns'
import dotenv from 'dotenv'
import { MongoClient } from 'mongodb'

dns.setServers(['8.8.8.8', '1.1.1.1'])
dotenv.config()

const uri = process.env.MONGODB_URI
const email = process.argv[2]
const role = process.argv[3] || 'admin'

if (!email) {
  console.error('Usage: node scripts/promote_user.js email@example.com [role]')
  process.exit(1)
}

async function run() {
  const client = new MongoClient(uri)
  try {
    await client.connect()
    const db = client.db()
    const res = await db.collection('users').updateOne({ email: email.toLowerCase() }, { $set: { role } })
    console.log(`Updated ${email} role to ${role} (Matched: ${res.matchedCount})`)
  } finally {
    await client.close()
  }
}

run().catch(console.error)
