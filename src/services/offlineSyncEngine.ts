/**
 * CivicSync Offline Sync Engine
 * Manages background queue processing, active connectivity pings, exponential retries, and server idempotency.
 */

import { apiFetch, API_URL } from './api'
import { uploadImage } from './uploadService'
import { blobToBase64 } from '../utils/offlineHelpers'
import {
  getOfflineQueue,
  saveOfflineQueueItem,
  deleteOfflineItem,
  updateCachedIssue,
  type OfflineQueueItem,
} from './offlineStorage'

type SyncListener = (event: { type: string; payload?: any }) => void

const listeners: Set<SyncListener> = new Set()

export function subscribeSyncEvents(listener: SyncListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function notifySyncListeners(type: string, payload?: any) {
  for (const listener of listeners) {
    try {
      listener({ type, payload })
    } catch (e) {
      console.error('Error in sync listener:', e)
    }
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('civicsync_sync_event', { detail: { type, payload } }))
  }
}

let isSyncing = false
let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true
let isBackendReachable = false

// Exponential Backoff Intervals (in ms)
const RETRY_INTERVALS = [0, 30000, 120000, 300000, 900000]

export function getNetworkState() {
  return {
    isOnline,
    isBackendReachable,
    isSyncing,
  }
}

/**
 * Pings backend health endpoint to check true server reachability
 */
export async function checkBackendReachability(): Promise<boolean> {
  if (!navigator.onLine) {
    isBackendReachable = false
    notifySyncListeners('NETWORK_CHANGED', { isOnline: false, isBackendReachable: false })
    return false
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 4000)

    const res = await fetch(`${API_URL}/health`, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
    })
    clearTimeout(timeoutId)

    const ok = res.ok
    const changed = isBackendReachable !== ok
    isBackendReachable = ok

    if (changed) {
      notifySyncListeners('NETWORK_CHANGED', { isOnline: true, isBackendReachable: ok })
    }
    return ok
  } catch {
    const changed = isBackendReachable !== false
    isBackendReachable = false
    if (changed) {
      notifySyncListeners('NETWORK_CHANGED', { isOnline: true, isBackendReachable: false })
    }
    return false
  }
}

/**
 * Main Sync Execution Loop — Processes queued items sequentially
 */
export async function triggerSync(): Promise<void> {
  if (isSyncing) return

  const reachable = await checkBackendReachability()
  if (!reachable) {
    return
  }

  const queue = await getOfflineQueue()
  const pendingItems = queue.filter((item) => item.status !== 'UPLOADED')

  if (pendingItems.length === 0) {
    return
  }

  try {
    isSyncing = true
    notifySyncListeners('SYNC_START')
    console.log(`🔄 Sync engine starting: ${pendingItems.length} items queued for server sync...`)

    for (const item of pendingItems) {
      const success = await processSingleQueueItem(item)
      if (!success) {
        console.warn(`⚠️ Sync paused at item ${item.operationId} due to error or backoff limit.`)
        break
      }
    }
  } catch (err: any) {
    console.error('Error during offline queue sync:', err)
  } finally {
    isSyncing = false
    notifySyncListeners('SYNC_END')
  }
}

async function processSingleQueueItem(item: OfflineQueueItem): Promise<boolean> {
  // Check retry interval backoff
  if (item.lastAttemptAt && item.retryCount > 0) {
    const backoffMs = RETRY_INTERVALS[Math.min(item.retryCount, RETRY_INTERVALS.length - 1)]
    const elapsed = Date.now() - new Date(item.lastAttemptAt).getTime()
    if (elapsed < backoffMs) {
      console.log(`⏳ Item ${item.operationId} waiting for backoff timer (${Math.round((backoffMs - elapsed) / 1000)}s remaining).`)
      return true // Skip to next item
    }
  }

  item.status = 'SYNCING'
  item.lastAttemptAt = new Date().toISOString()
  item.retryCount = (item.retryCount || 0) + 1
  await saveOfflineQueueItem(item)
  notifySyncListeners('ITEM_SYNCING', { item })

  try {
    let imageUrl = item.payload.imageUrl

    // 1. Upload photo blob to server if not already uploaded
    if (!imageUrl && item.photoBlob) {
      console.log(`📸 Uploading photo blob for offline op ${item.operationId}...`)
      const base64 = await blobToBase64(item.photoBlob)
      imageUrl = await uploadImage(base64, item.photoMetadata?.fileName || 'offline_proof.jpg')
    }

    // 2. Dispatch to appropriate sync endpoint
    let serverResponse: any = null

    if (item.actionType === 'CREATE_CITIZEN_REPORT') {
      const syncBody = {
        operationId: item.operationId,
        capturedAt: item.capturedAt,
        title: item.payload.title,
        description: item.payload.description,
        category: item.payload.category || 'potholes_and_road_damage',
        severity: item.payload.severity || 3,
        location: item.payload.location,
        imageUrl,
        beforeGps: item.payload.beforeGps,
        mergeWithId: item.payload.mergeWithId,
      }

      console.log('Sending sync report payload:', syncBody)
      serverResponse = await apiFetch('/sync/report', {
        method: 'POST',
        body: JSON.stringify(syncBody),
      })
    } else if (item.actionType === 'SUBMIT_CONTRACTOR_PROOF') {
      const syncBody = {
        operationId: item.operationId,
        issueId: item.entityId,
        capturedAt: item.capturedAt,
        afterImage: imageUrl,
        afterGps: item.payload.afterGps,
      }

      console.log('Sending sync repair-proof payload:', syncBody)
      serverResponse = await apiFetch('/sync/repair-proof', {
        method: 'POST',
        body: JSON.stringify(syncBody),
      })
    }

    // 3. Mark successful sync in IndexedDB & local cache
    item.status = 'UPLOADED'
    item.syncedAt = new Date().toISOString()
    item.serverResponse = serverResponse
    item.lastError = null

    if (serverResponse && serverResponse.id) {
      await updateCachedIssue(serverResponse)
    }

    await saveOfflineQueueItem(item)
    // Remove from queue after successful sync confirmation
    await deleteOfflineItem(item.operationId)

    notifySyncListeners('ITEM_SYNCED', { item, serverResponse })
    console.log(`✅ Queue item ${item.operationId} successfully synchronized!`)
    return true
  } catch (err: any) {
    const errorMsg = err.message || 'Sync failed'
    console.error(`❌ Sync failed for operation ${item.operationId}:`, errorMsg)

    item.status = 'SYNC_FAILED'
    item.lastError = errorMsg
    await saveOfflineQueueItem(item)

    notifySyncListeners('ITEM_FAILED', { item, error: errorMsg })
    return false
  }
}

// ── Setup Network Listeners & Auto-Ping ──

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    isOnline = true
    notifySyncListeners('NETWORK_CHANGED', { isOnline: true, isBackendReachable })
    checkBackendReachability().then((reachable) => {
      if (reachable) triggerSync()
    })
  })

  window.addEventListener('offline', () => {
    isOnline = false
    isBackendReachable = false
    notifySyncListeners('NETWORK_CHANGED', { isOnline: false, isBackendReachable: false })
  })

  // Periodic network check every 15 seconds
  setInterval(() => {
    if (navigator.onLine) {
      checkBackendReachability().then((reachable) => {
        if (reachable) triggerSync()
      })
    }
  }, 15000)

  // Initial check on load
  checkBackendReachability().then((reachable) => {
    if (reachable) triggerSync()
  })
}
