import { useState } from 'react'
import { X, RefreshCw, Trash2, MapPin, Clock, Camera, CheckCircle2, Wifi, ShieldCheck } from 'lucide-react'
import { useOffline } from '../../context/OfflineContext'
import { useConfirm } from '../../context/ConfirmContext'
import type { OfflineQueueItem } from '../../services/offlineStorage'

export function SyncCenterModal({ onClose }: { onClose: () => void }) {
  const { isOnline, isBackendReachable, isSyncing, pendingItems, triggerSyncNow, removePendingOp } = useOffline()
  const { confirmAction } = useConfirm()
  const [syncingSingle, setSyncingSingle] = useState<string | null>(null)

  const handleManualSync = async () => {
    setSyncingSingle('all')
    await triggerSyncNow()
    setSyncingSingle(null)
  }

  const handleRemoveItem = (item: OfflineQueueItem) => {
    confirmAction({
      title: 'Remove Offline Item?',
      description: `Are you sure you want to discard this offline ${
        item.actionType === 'CREATE_CITIZEN_REPORT' ? 'complaint report' : 'repair evidence proof'
      }? Unsynced evidence will be permanently deleted from this device.`,
      confirmText: 'Discard Evidence',
      variant: 'danger',
      onConfirm: async () => {
        await removePendingOp(item.operationId)
      },
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-fade-in">
      <div className="relative w-full max-w-2xl rounded-2xl border border-cyan-500/30 bg-slate-900/95 p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <RefreshCw className={`w-5 h-5 ${isSyncing ? 'animate-spin' : ''}`} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-100">Offline Sync Center</h2>
              <p className="text-xs text-slate-400">
                Persistent storage & automatic queue management for low-connectivity environments.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Connection Status Banner */}
        <div className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
          isOnline && isBackendReachable
            ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
            : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
        }`}>
          <div className="flex items-center gap-2.5 text-xs font-mono font-medium">
            <Wifi className="w-4 h-4" />
            <span>
              STATUS: {isOnline && isBackendReachable ? '🟢 Online & Server Reachable' : !isOnline ? '🔴 Device Offline' : '🟠 Server Unreachable'}
            </span>
          </div>

          <button
            onClick={handleManualSync}
            disabled={isSyncing || !isOnline || !isBackendReachable || pendingItems.length === 0}
            className="btn-primary py-1.5 px-4 text-xs font-bold flex items-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing || syncingSingle ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Syncing Queue...' : 'Sync All Pending Items'}
          </button>
        </div>

        {/* Queue Items List */}
        <div className="space-y-3">
          <h3 className="text-xs font-mono text-slate-400 uppercase tracking-wider font-bold">
            Pending Queue ({pendingItems.length} items waiting)
          </h3>

          {pendingItems.length === 0 ? (
            <div className="p-8 rounded-xl border border-white/10 bg-white/5 text-center text-slate-400 space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
              <p className="text-sm font-semibold text-slate-200">All Offline Items Synchronized!</p>
              <p className="text-xs text-slate-500">There are no pending reports or repair proofs stored locally.</p>
            </div>
          ) : (
            pendingItems.map((item) => {
              const previewUrl = item.photoBlob ? URL.createObjectURL(item.photoBlob) : null
              const isReport = item.actionType === 'CREATE_CITIZEN_REPORT'

              return (
                <div
                  key={item.operationId}
                  className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center hover:border-cyan-500/30 transition-all"
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {/* Thumbnail */}
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt="Proof Thumbnail"
                        className="w-16 h-16 rounded-lg object-cover border border-white/10 shrink-0"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-lg bg-slate-800 flex items-center justify-center text-slate-500 shrink-0">
                        <Camera className="w-6 h-6" />
                      </div>
                    )}

                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                          isReport
                            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                            : 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                        }`}>
                          {isReport ? 'Citizen Pothole Report' : 'Contractor Repair Proof'}
                        </span>
                        <span className="font-mono text-[10px] text-amber-400">
                          {item.entityId}
                        </span>
                      </div>

                      <h4 className="font-semibold text-slate-100 text-sm truncate">
                        {item.payload.title || (isReport ? 'Pothole Complaint Report' : 'Repair Work Evidence')}
                      </h4>

                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-cyan-400" />
                          Captured: {new Date(item.capturedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-violet-400" />
                          {item.location.latitude?.toFixed(4)}, {item.location.longitude?.toFixed(4)}
                        </span>
                      </div>

                      {item.lastError && (
                        <p className="text-[10px] text-rose-300 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                          ⚠️ Sync error: {item.lastError}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions & Status */}
                  <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-2 border-t sm:border-t-0 pt-3 sm:pt-0 border-white/10">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-semibold border ${
                      item.status === 'SYNCING'
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 animate-pulse'
                        : item.status === 'SYNC_FAILED'
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                        : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    }`}>
                      {item.status === 'SYNCING' ? '⏳ Syncing...' : item.status === 'SYNC_FAILED' ? '❌ Sync Failed' : ' Saved Offline'}
                    </span>

                    <button
                      onClick={() => handleRemoveItem(item)}
                      className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 p-1 rounded hover:bg-rose-500/10 transition cursor-pointer"
                      title="Discard local evidence"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Discard</span>
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        <div className="pt-2 border-t border-white/10 text-xs text-slate-400 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-cyan-400" />
          <span>Evidence photos & GPS coordinates are safely encrypted & stored in IndexedDB until sync succeeds.</span>
        </div>
      </div>
    </div>
  )
}
