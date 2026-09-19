import React, { useEffect, useState } from 'react'
import { BarChart3, Check, Grid2X2, Navigation, Settings2, X } from 'lucide-react'
import { DEFAULT_CHART_SETTINGS, readChartWorkspaceSettings, writeChartWorkspaceSettings, type ChartWorkspaceSettings } from '../../app/chartSettings'

interface Props { open: boolean; onClose: () => void }

export const ChartSettingsSheet: React.FC<Props> = ({ open, onClose }) => {
  const [settings, setSettings] = useState<ChartWorkspaceSettings>(() => readChartWorkspaceSettings())

  useEffect(() => {
    if (open) setSettings(readChartWorkspaceSettings())
  }, [open])

  if (!open) return null

  const update = (key: keyof ChartWorkspaceSettings): void => {
    const next = { ...settings, [key]: !settings[key] }
    setSettings(next)
    writeChartWorkspaceSettings(next)
  }

  const reset = (): void => {
    setSettings(DEFAULT_CHART_SETTINGS)
    writeChartWorkspaceSettings(DEFAULT_CHART_SETTINGS)
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/55 p-3 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-label="Chart settings">
      <div className="w-full max-w-lg rounded-3xl border border-shafx-border bg-shafx-surface shadow-2xl shadow-black/40">
        <header className="flex items-center justify-between border-b border-shafx-border px-4 py-4 sm:px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-shafx-accent/10 text-shafx-accent"><Settings2 className="h-5 w-5" /></div>
            <div><h2 className="text-base font-semibold">Chart & workspace settings</h2><p className="mt-0.5 text-[10px] text-shafx-textMuted">Controls that change the way SHAFX behaves on this device.</p></div>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-xl border border-shafx-border text-shafx-textMuted" aria-label="Close settings"><X className="h-4 w-4" /></button>
        </header>

        <div className="space-y-2.5 p-4 sm:p-5">
          <SettingRow icon={Grid2X2} title="Chart grid" detail="Show the chart's horizontal and vertical guide grid." enabled={settings.showGrid} onToggle={() => update('showGrid')} />
          <SettingRow icon={BarChart3} title="Price labels" detail="Keep price labels visible on the chart axis and drawings." enabled={settings.showPriceLabels} onToggle={() => update('showPriceLabels')} />
          <SettingRow icon={Navigation} title="Auto-hide navigation" detail="Hide the mobile navigation while scrolling down; bring it back by scrolling up." enabled={settings.autoHideNavigation} onToggle={() => update('autoHideNavigation')} />
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-shafx-border px-4 py-4 sm:px-5">
          <span className="text-[10px] text-shafx-textMuted">Settings are saved locally on this device.</span>
          <button type="button" onClick={reset} className="min-h-10 rounded-xl border border-shafx-border px-3 text-[10px] font-semibold text-shafx-text">Reset</button>
        </footer>
      </div>
    </div>
  )
}

function SettingRow({ icon: Icon, title, detail, enabled, onToggle }: { icon: React.ElementType; title: string; detail: string; enabled: boolean; onToggle: () => void }) {
  return <button type="button" onClick={onToggle} className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-shafx-border bg-shafx-bg px-3 text-left active:bg-shafx-surfaceHover">
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-shafx-accent/10 text-shafx-accent"><Icon className="h-4 w-4" /></div>
    <div className="min-w-0 flex-1"><div className="text-xs font-semibold">{title}</div><div className="mt-1 text-[10px] leading-4 text-shafx-textMuted">{detail}</div></div>
    <span className={enabled ? 'flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-shafx-accent text-white' : 'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-shafx-border text-shafx-textMuted'}>{enabled && <Check className="h-4 w-4" />}</span>
  </button>
}
