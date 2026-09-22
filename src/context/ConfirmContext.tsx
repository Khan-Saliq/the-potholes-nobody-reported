import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { AlertTriangle, AlertCircle, Info, Loader2, X } from 'lucide-react'

export interface ConfirmOptions {
  title: string
  description: React.ReactNode
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'warning' | 'primary'
  onConfirm: () => Promise<void> | void
  onCancel?: () => void
}

interface ConfirmContextType {
  confirmAction: (options: ConfirmOptions) => void
  closeConfirm: () => void
}

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined)

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)

  const closeConfirm = useCallback(() => {
    if (isSubmitting) return
    if (options?.onCancel) {
      options.onCancel()
    }
    setOptions(null)
  }, [isSubmitting, options])

  const confirmAction = useCallback((opts: ConfirmOptions) => {
    setOptions(opts)
  }, [])

  // Handle ESC key listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && options && !isSubmitting) {
        closeConfirm()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [options, isSubmitting, closeConfirm])

  const handleConfirm = async () => {
    if (!options) return
    try {
      setIsSubmitting(true)
      await options.onConfirm()
      setOptions(null)
    } catch (err) {
      console.error('Confirm action failed:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const variant = options?.variant || 'primary'

  return (
    <ConfirmContext.Provider value={{ confirmAction, closeConfirm }}>
      {children}

      {options && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
          onClick={closeConfirm}
        >
          <div
            className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-6 animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            {/* Header Icon + Title */}
            <div className="flex items-start gap-4">
              <div
                className={`p-3 rounded-xl shrink-0 ${
                  variant === 'danger'
                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    : variant === 'warning'
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                }`}
              >
                {variant === 'danger' && <AlertCircle className="h-6 w-6" />}
                {variant === 'warning' && <AlertTriangle className="h-6 w-6" />}
                {variant === 'primary' && <Info className="h-6 w-6" />}
              </div>

              <div className="flex-1 pr-6">
                <h3 className="text-xl font-bold text-white tracking-tight">{options.title}</h3>
                <div className="mt-2 text-sm text-slate-300 leading-relaxed">{options.description}</div>
              </div>

              <button
                onClick={closeConfirm}
                disabled={isSubmitting}
                className="absolute top-5 right-5 p-1 text-slate-400 hover:text-white rounded-lg transition-colors disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Footer Buttons */}
            <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={closeConfirm}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition-all disabled:opacity-50"
              >
                {options.cancelText || 'Cancel'}
              </button>

              <button
                type="button"
                onClick={handleConfirm}
                disabled={isSubmitting}
                className={`inline-flex items-center justify-center gap-2 px-5 py-2 text-sm font-semibold text-white rounded-xl shadow-lg transition-all disabled:opacity-50 ${
                  variant === 'danger'
                    ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-950/50 active:scale-[0.98]'
                    : variant === 'warning'
                    ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-950/50 active:scale-[0.98]'
                    : 'bg-cyan-600 hover:bg-cyan-500 shadow-cyan-950/50 active:scale-[0.98]'
                }`}
              >
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {options.confirmText || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const context = useContext(ConfirmContext)
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmProvider')
  }
  return context
}
