import { useState } from 'react'
import { Wifi, WifiOff, RefreshCw, Layers } from 'lucide-react'
import { useOffline } from '../../context/OfflineContext'
import { SyncCenterModal } from './SyncCenterModal'

export function ConnectivityIndicator() {
  const { isOnline, isBackendReachable, isSyncing, pendingCount, triggerSyncNow } = useOffline()
  const [showSyncCenter, setShowSyncCenter] = useState(false)

  // Status computation
  let statusText = 'Online'
  let statusColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
  let dotColor = 'bg-emerald-400'

  if (!isOnline) {
    statusText = 'Offline — Changes will sync automatically'
    statusColor = 'text-rose-300 bg-rose-500/15 border-rose-500/40'
    dotColor = 'bg-rose-400 animate-pulse'
  } else if (!isBackendReachable) {
    statusText = 'Weak Connection / Server Unreachable'
    statusColor = 'text-amber-300 bg-amber-500/15 border-amber-500/40'
    dotColor = 'bg-amber-400 animate-pulse'
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Connectivity Status Badge */}
        <div className={`px-2.5 py-1 rounded-full text-[11px] font-mono font-medium border flex items-center gap-1.5 transition-all ${statusColor}`}>
          <span className={`w-2 h-2 rounded-full ${dotColor}`} />
          {isOnline && isBackendReachable ? (
            <Wifi className="w-3 h-3 text-emerald-400" />
          ) : (
            <WifiOff className="w-3 h-3 text-rose-400" />
          )}
          <span className="hidden sm:inline">{statusText}</span>
          <span className="sm:hidden">{isOnline && isBackendReachable ? 'Online' : 'Offline'}</span>
        </div>

        {/* Pending Sync Counter Badge */}
        {pendingCount > 0 && (
          <button
            onClick={() => setShowSyncCenter(true)}
            className="px-2.5 py-1 rounded-full text-[11px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30 transition flex items-center gap-1.5 cursor-pointer shadow-lg animate-pulse"
            title="Open Sync Center"
          >
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span>Sync Center ({pendingCount} pending)</span>
          </button>
        )}

        {/* Syncing Spinner */}
        {isSyncing && (
          <button
            onClick={triggerSyncNow}
            disabled={isSyncing}
            className="p-1 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/20 transition cursor-pointer"
            title="Syncing offline items..."
          >
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          </button>
        )}
      </div>

      {/* Sync Center Modal */}
      {showSyncCenter && <SyncCenterModal onClose={() => setShowSyncCenter(false)} />}
    </>
  )
}
