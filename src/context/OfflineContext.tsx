import React, { createContext, useContext, useEffect, useState } from 'react'
import {
  getNetworkState,
  checkBackendReachability,
  triggerSync,
  subscribeSyncEvents,
} from '../services/offlineSyncEngine'
import {
  getOfflineQueue,
  deleteOfflineItem,
  type OfflineQueueItem,
} from '../services/offlineStorage'

interface OfflineContextType {
  isOnline: boolean
  isBackendReachable: boolean
  isSyncing: boolean
  pendingCount: number
  pendingItems: OfflineQueueItem[]
  refreshQueue: () => Promise<void>
  triggerSyncNow: () => Promise<void>
  removePendingOp: (operationId: string) => Promise<void>
}

const OfflineContext = createContext<OfflineContextType | undefined>(undefined)

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const [networkState, setNetworkState] = useState(getNetworkState())
  const [pendingItems, setPendingItems] = useState<OfflineQueueItem[]>([])

  const refreshQueue = async () => {
    try {
      const items = await getOfflineQueue()
      setPendingItems(items.filter((i) => i.status !== 'UPLOADED'))
    } catch {
      setPendingItems([])
    }
  }

  useEffect(() => {
    refreshQueue()

    const unsubscribe = subscribeSyncEvents((evt) => {
      setNetworkState(getNetworkState())
      refreshQueue()

      if (evt.type === 'ITEM_SYNCED') {
        console.log('🎉 Offline item synced event in context')
      }
    })

    const interval = setInterval(() => {
      setNetworkState(getNetworkState())
      refreshQueue()
    }, 5000)

    return () => {
      unsubscribe()
      clearInterval(interval)
    }
  }, [])

  const triggerSyncNow = async () => {
    await checkBackendReachability()
    await triggerSync()
    await refreshQueue()
  }

  const removePendingOp = async (operationId: string) => {
    await deleteOfflineItem(operationId)
    await refreshQueue()
  }

  return (
    <OfflineContext.Provider
      value={{
        isOnline: networkState.isOnline,
        isBackendReachable: networkState.isBackendReachable,
        isSyncing: networkState.isSyncing,
        pendingCount: pendingItems.length,
        pendingItems,
        refreshQueue,
        triggerSyncNow,
        removePendingOp,
      }}
    >
      {children}
    </OfflineContext.Provider>
  )
}

export function useOffline() {
  const context = useContext(OfflineContext)
  if (!context) {
    throw new Error('useOffline must be used within an OfflineProvider')
  }
  return context
}
