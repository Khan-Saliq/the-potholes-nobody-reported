/**
 * Offline Utilities & Image Safeguard Helpers
 */

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `op_${crypto.randomUUID()}`
  }
  return `op_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

export function generateTempComplaintCode(): string {
  const randomNum = Math.floor(10000 + Math.random() * 90000)
  return `OFF-${randomNum}`
}

export function generateTempId(): string {
  return `offline_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Rescales/compresses an image Blob if it exceeds size limits (e.g. > 1.5MB)
 * to safeguard IndexedDB storage and upload speed while preserving proof quality.
 */
export async function compressImageIfNeeded(
  fileOrBlob: Blob | File,
  maxDimension = 1600,
  quality = 0.85
): Promise<Blob> {
  // If file is already smaller than 1MB, return as is
  if (fileOrBlob.size < 1024 * 1024) {
    return fileOrBlob
  }

  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(fileOrBlob)

    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width)
          width = maxDimension
        } else {
          width = Math.round((width * maxDimension) / height)
          height = maxDimension
        }
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')

      if (!ctx) {
        resolve(fileOrBlob)
        return
      }

      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => {
          if (blob && blob.size < fileOrBlob.size) {
            resolve(blob)
          } else {
            resolve(fileOrBlob)
          }
        },
        fileOrBlob.type || 'image/jpeg',
        quality
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(fileOrBlob)
    }

    img.src = url
  })
}

/**
 * Helper to convert Blob to Base64 data URI string when needed
 */
export function blobToBase64(blob: Blob): Promise<string> {
  const typedBlob = (!blob.type || blob.type === 'application/octet-stream')
    ? new Blob([blob], { type: 'image/jpeg' })
    : blob

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      let resStr = reader.result as string
      if (resStr && !resStr.startsWith('data:image/')) {
        resStr = resStr.replace(/^data:[^;]+;base64,/, 'data:image/jpeg;base64,')
      }
      resolve(resStr)
    }
    reader.onerror = reject
    reader.readAsDataURL(typedBlob)
  })
}

/**
 * Helper to convert Base64 data URI string to Blob
 */
export function base64ToBlob(base64: string): Blob {
  const arr = base64.split(',')
  const mimeMatch = arr[0].match(/:(.*?);/)
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg'
  const bstr = atob(arr[1] || arr[0])
  let n = bstr.length
  const u8arr = new Uint8Array(n)
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n)
  }
  return new Blob([u8arr], { type: mime })
}
