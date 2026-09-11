import React, { useEffect } from 'react'
import { CheckCircle2, X } from 'lucide-react'

export interface ToastMessage { id: number; text: string }
interface ToastProps { toast: ToastMessage | null; onDismiss: () => void }

export const Toast: React.FC<ToastProps> = ({ toast, onDismiss }) => {
  useEffect(() => { if (!toast) return; const timer = setTimeout(onDismiss, 3500); return () => clearTimeout(timer) }, [toast, onDismiss])
  if (!toast) return null
  return <div role="status" aria-live="polite" className="fixed bottom-6 right-4 z-[100] flex max-w-sm items-center gap-3 rounded-lg border border-shafx-success/40 bg-shafx-surface px-4 py-3 shadow-lg"><CheckCircle2 className="h-5 w-5 flex-shrink-0 text-shafx-success" /><span className="flex-1 text-sm text-shafx-text">{toast.text}</span><button type="button" onClick={onDismiss} className="min-h-9 min-w-9 text-shafx-textMuted hover:text-shafx-text" aria-label="Dismiss notification"><X className="mx-auto h-4 w-4" /></button></div>
}
