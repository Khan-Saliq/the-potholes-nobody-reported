/**
 * CivicSync IndexedDB Storage Service
 * Native IndexedDB implementation storing binary Blobs, offline queue items, and cached issues.
 */

export type OfflineActionType = 'CREATE_CITIZEN_REPORT' | 'SUBMIT_CONTRACTOR_PROOF' | 'START_REPAIR'

export type OfflineOpStatus =
  | 'CREATED_OFFLINE'
  | 'STORED_LOCALLY'
  | 'WAITING_FOR_SYNC'
  | 'SYNCING'
  | 'UPLOADED'
  | 'SYNC_FAILED'

export interface OfflinePhotoMetadata {
  fileName: string
  mimeType: string
  size: number
  capturedAt: string
}

export interface OfflineQueueItem {
  operationId: string
  userId: string
  userRole: 'citizen' | 'contractor' | 'admin'
  actionType: OfflineActionType
  entityType: 'issue'
  entityId: string
  payload: Record<string, any>
  photoBlob: Blob
  photoMetadata: OfflinePhotoMetadata
  location: {
    latitude: number
    longitude: number
    accuracy?: number
    address?: string
  }
  capturedAt: string
  createdAt: string
  status: OfflineOpStatus
  retryCount: number
  lastAttemptAt?: string | null
  lastError?: string | null
  syncedAt?: string | null
  serverResponse?: any
}

const DB_NAME = 'CivicSyncOfflineDB'
const DB_VERSION = 1
const QUEUE_STORE = 'offlineQueue'
const CACHE_STORE = 'cachedIssues'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported in this environment.'))
      return
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      console.error('IndexedDB open error:', request.error)
      reject(request.error)
    }

    request.onsuccess = () => {
      resolve(request.result)
    }

    request.onupgradeneeded = (e: any) => {
      const db = e.target.result as IDBDatabase

      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        const queueStore = db.createObjectStore(QUEUE_STORE, { keyPath: 'operationId' })
        queueStore.createIndex('userId', 'userId', { unique: false })
        queueStore.createIndex('status', 'status', { unique: false })
        queueStore.createIndex('actionType', 'actionType', { unique: false })
        queueStore.createIndex('createdAt', 'createdAt', { unique: false })
      }

      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        const cacheStore = db.createObjectStore(CACHE_STORE, { keyPath: 'id' })
        cacheStore.createIndex('status', 'status', { unique: false })
        cacheStore.createIndex('reporterId', 'reporterId', { unique: false })
        cacheStore.createIndex('contractorId', 'contractorId', { unique: false })
      }
    }
  })
}

// ── Queue Store Methods ──

export async function saveOfflineQueueItem(item: OfflineQueueItem): Promise<OfflineQueueItem> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite')
    const store = tx.objectStore(QUEUE_STORE)
    const req = store.put(item)

    req.onsuccess = () => resolve(item)
    req.onerror = () => reject(req.error)
  })
}

export async function getOfflineQueue(): Promise<OfflineQueueItem[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readonly')
    const store = tx.objectStore(QUEUE_STORE)
    const req = store.getAll()

    req.onsuccess = () => {
      const items: OfflineQueueItem[] = req.result || []
      // Sort oldest first (FIFO processing)
      items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      resolve(items)
    }
    req.onerror = () => reject(req.error)
  })
}

export async function getOfflineItemByOpId(operationId: string): Promise<OfflineQueueItem | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readonly')
    const store = tx.objectStore(QUEUE_STORE)
    const req = store.get(operationId)

    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
}

export async function deleteOfflineItem(operationId: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite')
    const store = tx.objectStore(QUEUE_STORE)
    const req = store.delete(operationId)

    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

// ── Cached Issues Methods ──

export async function clearCachedIssuesLocally(): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CACHE_STORE, 'readwrite')
    const store = tx.objectStore(CACHE_STORE)
    const req = store.clear()

    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export async function cacheIssuesLocally(issues: any[]): Promise<void> {
  const db = await openDB()
  const tx = db.transaction(CACHE_STORE, 'readwrite')
  const store = tx.objectStore(CACHE_STORE)
  store.clear()

  if (issues && issues.length > 0) {
    for (const issue of issues) {
      store.put(issue)
    }
  }
}

export async function getCachedIssuesLocally(): Promise<any[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CACHE_STORE, 'readonly')
    const store = tx.objectStore(CACHE_STORE)
    const req = store.getAll()

    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => reject(req.error)
  })
}

export async function getCachedIssueById(id: string): Promise<any | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CACHE_STORE, 'readonly')
    const store = tx.objectStore(CACHE_STORE)
    const req = store.get(id)

    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
}

export async function updateCachedIssue(issue: any): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CACHE_STORE, 'readwrite')
    const store = tx.objectStore(CACHE_STORE)
    const req = store.put(issue)

    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}
