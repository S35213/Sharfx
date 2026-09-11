import React, { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { hasError: boolean; error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false, error: null }
  public static getDerivedStateFromError(error: Error): State { return { hasError: true, error } }
  public componentDidCatch(error: Error, info: ErrorInfo): void { console.error('SHAFX ErrorBoundary caught:', error, info) }
  public render(): ReactNode {
    if (!this.state.hasError) return this.props.children
    return <div className="flex min-h-screen flex-col items-center justify-center bg-shafx-bg p-4 text-shafx-text"><h2 className="mb-2 text-xl font-bold text-shafx-danger">Something went wrong.</h2><p className="mb-4 text-shafx-textMuted">The application encountered a critical error.</p><pre className="max-w-full overflow-auto rounded border border-shafx-border bg-shafx-surface p-4 text-xs">{this.state.error?.message ?? 'Unknown error'}</pre><a href="/" className="mt-4 rounded bg-shafx-primary px-4 py-2 text-white hover:bg-shafx-primaryHover">Reload Application</a></div>
  }
}
