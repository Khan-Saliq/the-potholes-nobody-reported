import dns from 'dns'
import dotenv from 'dotenv'
import { MongoClient } from 'mongodb'

dns.setServers(['8.8.8.8', '1.1.1.1'])
dotenv.config()

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI)
  try {
    await client.connect()
    const db = client.db()
    const result = await db.collection('users').updateMany({ role: 'department_admin' }, { $set: { role: 'admin' } })
    console.log(`✅ Successfully migrated ${result.modifiedCount} legacy department_admin user(s) to admin.`)
  } finally {
    await client.close()
  }
}

run().catch(console.error)
