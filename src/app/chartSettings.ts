export interface ChartWorkspaceSettings {
  showGrid: boolean
  showPriceLabels: boolean
  autoHideNavigation: boolean
}

export const DEFAULT_CHART_SETTINGS: ChartWorkspaceSettings = {
  showGrid: true,
  showPriceLabels: true,
  autoHideNavigation: true,
}

const KEY = 'shafx.chart.settings'

export function readChartWorkspaceSettings(): ChartWorkspaceSettings {
  if (typeof window === 'undefined') return DEFAULT_CHART_SETTINGS
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? 'null')
    if (!parsed || typeof parsed !== 'object') return DEFAULT_CHART_SETTINGS
    const value = parsed as Partial<ChartWorkspaceSettings>
    return {
      showGrid: value.showGrid !== false,
      showPriceLabels: value.showPriceLabels !== false,
      autoHideNavigation: value.autoHideNavigation !== false,
    }
  } catch {
    return DEFAULT_CHART_SETTINGS
  }
}

export function writeChartWorkspaceSettings(value: ChartWorkspaceSettings): void {
  try { window.localStorage.setItem(KEY, JSON.stringify(value)) } catch { /* optional */ }
  window.dispatchEvent(new CustomEvent<ChartWorkspaceSettings>('shafx:chart-settings', { detail: value }))
}

export const CHART_SETTINGS_EVENT = 'shafx:chart-settings'
