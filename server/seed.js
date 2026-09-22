import bcrypt from 'bcryptjs'
import User from './models/User.js'

export async function seedDatabase() {
  try {
    console.log('🌱 Running DB Role Migration (department_admin -> admin)...')
    const migrationResult = await User.updateMany({ role: 'department_admin' }, { role: 'admin' })
    if (migrationResult.modifiedCount > 0) {
      console.log(`✅ Migrated ${migrationResult.modifiedCount} legacy department_admin user(s) to admin.`)
    }

    console.log('🌱 Checking / Seeding default demo accounts...')
    const hashedPassword = await bcrypt.hash('password123', 10)

    const defaultUsers = [
      {
        name: 'Aarav Sharma (Citizen)',
        email: 'citizen@civicpulse.org',
        password: hashedPassword,
        role: 'citizen',
        trustScore: 85,
        totalReports: 12,
        verifiedReports: 10,
      },
      {
        name: 'Municipal Admin',
        email: 'admin@civicpulse.org',
        password: hashedPassword,
        role: 'admin',
        department: 'Central Municipal Operations',
      },
      {
        name: 'Apex Infra Repairs (Contractor)',
        email: 'contractor@civicpulse.org',
        password: hashedPassword,
        role: 'contractor',
        companyName: 'Apex Infra Repairs Ltd',
        assignedDepartment: 'Roads & Bridges Department',
        contractorRating: 4.9,
      },
    ]

    for (const u of defaultUsers) {
      const exists = await User.findOne({ email: u.email })
      if (!exists) {
        await User.create(u)
        console.log(`👤 Created default user: ${u.email} (${u.role})`)
      }
    }
  } catch (err) {
    console.error('Error seeding database:', err.message)
  }
}
