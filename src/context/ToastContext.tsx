import React, { createContext, useContext, useState, useCallback } from 'react'
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastItem {
  id: string
  type: ToastType
  message: string
  description?: string
}

interface ToastContextType {
  toast: {
    success: (message: string, description?: string) => void
    error: (message: string, description?: string) => void
    warning: (message: string, description?: string) => void
    info: (message: string, description?: string) => void
  }
  showToast: (type: ToastType, message: string, description?: string) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const showToast = useCallback((type: ToastType, message: string, description?: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    setToasts(prev => [...prev, { id, type, message, description }])

    // Auto dismiss after 4.5 seconds
    setTimeout(() => {
      removeToast(id)
    }, 4500)
  }, [removeToast])

  const toast = {
    success: (msg: string, desc?: string) => showToast('success', msg, desc),
    error: (msg: string, desc?: string) => showToast('error', msg, desc),
    warning: (msg: string, desc?: string) => showToast('warning', msg, desc),
    info: (msg: string, desc?: string) => showToast('info', msg, desc),
  }

  return (
    <ToastContext.Provider value={{ toast, showToast }}>
      {children}
      {/* Toast Render Container */}
      <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2.5 max-w-md w-full px-4 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl border backdrop-blur-md shadow-2xl transition-all duration-300 animate-in slide-in-from-bottom-5 ${
              t.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-100 shadow-emerald-950/40'
                : t.type === 'error'
                ? 'bg-rose-950/90 border-rose-500/50 text-rose-100 shadow-rose-950/40'
                : t.type === 'warning'
                ? 'bg-amber-950/90 border-amber-500/50 text-amber-100 shadow-amber-950/40'
                : 'bg-slate-900/95 border-cyan-500/50 text-cyan-100 shadow-cyan-950/40'
            }`}
          >
            <div className="mt-0.5 shrink-0">
              {t.type === 'success' && <CheckCircle2 className="h-5 w-5 text-emerald-400" />}
              {t.type === 'error' && <AlertCircle className="h-5 w-5 text-rose-400" />}
              {t.type === 'warning' && <AlertTriangle className="h-5 w-5 text-amber-400" />}
              {t.type === 'info' && <Info className="h-5 w-5 text-cyan-400" />}
            </div>

            <div className="flex-1 text-sm leading-snug">
              <div className="font-semibold text-white">{t.message}</div>
              {t.description && <div className="mt-1 text-xs opacity-90">{t.description}</div>}
            </div>

            <button
              onClick={() => removeToast(t.id)}
              className="shrink-0 p-1 text-slate-400 hover:text-white rounded-lg transition-colors"
              aria-label="Dismiss toast"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}
