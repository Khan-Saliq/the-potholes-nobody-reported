import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { authRequired, requireAdmin } from '../middleware/auth.js'
import Upload from '../models/Upload.js'
import Issue from '../models/Issue.js'
import User from '../models/User.js'
import ChatMessage from '../models/ChatMessage.js'
import cloudinary from '../config/cloudinary.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uploadsDir = path.join(__dirname, '..', 'uploads')

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}

const router = Router()

router.get('/', authRequired, async (req, res) => {
  try {
    const query = {}
    if (req.user.role !== 'admin' || req.query.mine === 'true') {
      query.uploaderId = req.user.id
    }
    const uploads = await Upload.find(query).sort({ createdAt: -1 }).lean()
    res.json(
      uploads.map((item) => ({
        ...item,
        id: item._id.toString(),
      }))
    )
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/clear-all', authRequired, requireAdmin, async (_req, res) => {
  try {
    const files = fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir) : []
    for (const file of files) {
      const filepath = path.join(uploadsDir, file)
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath)
      }
    }

    await Upload.deleteMany({})
    await Issue.deleteMany({})
    await ChatMessage.deleteMany({ issueId: { $exists: true, $ne: null } })
    await User.updateMany({}, { $set: { totalReports: 0, verifiedReports: 0 } })

    res.json({ message: 'Cleared all uploads, issues, and related database records.' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/image', authRequired, async (req, res) => {
  try {
    const { imageBase64, filename, issueId } = req.body
    if (!imageBase64) {
      return res.status(400).json({ error: 'imageBase64 required' })
    }

    let match = imageBase64.match(/^data:([^;]+);base64,(.+)$/)
    let ext = 'jpg'
    let buffer = null

    if (match) {
      const mime = match[1] || 'image/jpeg'
      ext = mime.split('/')[1] || 'jpg'
      if (ext === 'octet-stream' || ext === 'png') ext = ext === 'png' ? 'png' : 'jpg'
      buffer = Buffer.from(match[2], 'base64')
    } else if (typeof imageBase64 === 'string' && imageBase64.length > 50) {
      buffer = Buffer.from(imageBase64.replace(/^data:.*?;base64,/, ''), 'base64')
    } else {
      return res.status(400).json({ error: 'Invalid image format. Send data URL base64.' })
    }
    const name = `${Date.now()}-${filename || 'upload'}.${ext}`.replace(/[^a-zA-Z0-9._-]/g, '')
    
    let url = null

    // Try uploading to Cloudinary if fully configured
    if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
      try {
        console.log('Uploading image to Cloudinary...')
        const result = await new Promise((resolve, reject) => {
          try {
            const uploadStream = cloudinary.uploader.upload_stream(
              {
                folder: 'civicpulse',
                public_id: name.replace(/\.[^/.]+$/, ''),
                resource_type: 'image',
              },
              (error, result) => {
                if (error) {
                  console.error('Cloudinary upload error:', error.message || error)
                  reject(error)
                } else {
                  resolve(result)
                }
              }
            )
            uploadStream.end(buffer)
          } catch (e) {
            reject(e)
          }
        })
        url = result?.secure_url
      } catch (cloudErr) {
        console.warn('⚠️ Cloudinary upload failed, using local filesystem fallback:', cloudErr.message || cloudErr)
      }
    }

    // Local filesystem fallback
    if (!url) {
      const localFilePath = path.join(uploadsDir, name)
      fs.writeFileSync(localFilePath, buffer)
      const host = req.get('host') || 'localhost:5000'
      const protocol = req.protocol || 'http'
      url = `${protocol}://${host}/uploads/${name}`
      console.log('Saved image locally:', url)
    }

    await Upload.create({
      filename: name,
      url,
      uploaderId: req.user.id,
      uploaderName: req.user.name,
      issueId,
    })

    res.json({ url, type: 'image', filename: name })
  } catch (err) {
    console.error('Upload error:', err)
    res.status(500).json({ error: err.message })
  }
})

router.post('/media', authRequired, async (req, res) => {
  try {
    const { mediaBase64, filename, issueId } = req.body
    if (!mediaBase64) {
      return res.status(400).json({ error: 'mediaBase64 required' })
    }

    const match = mediaBase64.match(/^data:([\w/+]+);base64,(.+)$/)
    if (!match) {
      return res.status(400).json({ error: 'Invalid media format. Send data URL base64.' })
    }

    const mimeType = match[1]
    const isImage = mimeType.startsWith('image/')
    const isVideo = mimeType.startsWith('video/')

    if (!isImage && !isVideo) {
      return res.status(400).json({ error: 'Only image and video files are supported.' })
    }

    const ext = mimeType.split('/')[1] || (isVideo ? 'mp4' : 'jpg')
    const buffer = Buffer.from(match[2], 'base64')
    const name = `${Date.now()}-${filename || 'upload'}.${ext}`.replace(/[^a-zA-Z0-9._-]/g, '')
    
    let url = null

    // Try uploading to Cloudinary
    if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
      try {
        const result = await new Promise((resolve, reject) => {
          try {
            const uploadStream = cloudinary.uploader.upload_stream(
              {
                folder: 'civicpulse',
                public_id: name.replace(/\.[^/.]+$/, ''),
                resource_type: isVideo ? 'video' : 'image',
              },
              (error, result) => {
                if (error) reject(error)
                else resolve(result)
              }
            )
            uploadStream.end(buffer)
          } catch (e) {
            reject(e)
          }
        })
        url = result?.secure_url
      } catch (cloudErr) {
        console.warn('⚠️ Cloudinary media upload failed, using local fallback:', cloudErr.message || cloudErr)
      }
    }

    // Local filesystem fallback
    if (!url) {
      const localFilePath = path.join(uploadsDir, name)
      fs.writeFileSync(localFilePath, buffer)
      const host = req.get('host') || 'localhost:5000'
      const protocol = req.protocol || 'http'
      url = `${protocol}://${host}/uploads/${name}`
      console.log('Saved media locally:', url)
    }

    await Upload.create({
      filename: name,
      url,
      uploaderId: req.user.id,
      uploaderName: req.user.name,
      issueId,
    })

    res.json({ url, type: isVideo ? 'video' : 'image', filename: name })
  } catch (err) {
    console.error('Upload error:', err)
    res.status(500).json({ error: err.message })
  }
})

export default router
