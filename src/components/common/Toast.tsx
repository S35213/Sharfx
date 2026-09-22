import React, { useEffect } from 'react'
import { CheckCircle2, X } from 'lucide-react'

export interface ToastMessage { id: number; text: string }
interface ToastProps { toast: ToastMessage | null; onDismiss: () => void }

export const Toast: React.FC<ToastProps> = ({ toast, onDismiss }) => {
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(onDismiss, 3000); return () => window.clearTimeout(timer) }, [toast, onDismiss])
  if (!toast) return null
  return <div role="status" aria-live="polite" className="pointer-events-auto fixed bottom-[calc(6.5rem+env(safe-area-inset-bottom))] right-3 z-[100] flex max-w-[calc(100vw-1.5rem)] items-center gap-3 rounded-lg border border-shafx-success/40 bg-shafx-surface px-3 py-3 shadow-lg sm:bottom-6 sm:right-4 sm:max-w-sm sm:px-4"><CheckCircle2 className="h-5 w-5 flex-shrink-0 text-shafx-success" /><span className="flex-1 text-[11px] leading-4 text-shafx-text sm:text-sm">{toast.text}</span><button type="button" onClick={onDismiss} className="min-h-9 min-w-9 text-shafx-textMuted hover:text-shafx-text" aria-label="Dismiss notification"><X className="mx-auto h-4 w-4" /></button></div>
}
