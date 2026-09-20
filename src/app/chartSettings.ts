export type CandleTheme = 'shafx' | 'mt5' | 'blue' | 'amber'

export interface ChartWorkspaceSettings {
  showGrid: boolean
  showPriceLabels: boolean
  autoHideNavigation: boolean
  candleTheme: CandleTheme
}

export const DEFAULT_CHART_SETTINGS: ChartWorkspaceSettings = {
  showGrid: true,
  showPriceLabels: true,
  autoHideNavigation: true,
  candleTheme: 'mt5',
}

const KEY = 'shafx.chart.settings'

export function readChartWorkspaceSettings(): ChartWorkspaceSettings {
  if (typeof window === 'undefined') return DEFAULT_CHART_SETTINGS
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? 'null')
    if (!parsed || typeof parsed !== 'object') return DEFAULT_CHART_SETTINGS
    const value = parsed as Partial<ChartWorkspaceSettings>
    const themes: CandleTheme[] = ['shafx', 'mt5', 'blue', 'amber']
    return {
      showGrid: value.showGrid !== false,
      showPriceLabels: value.showPriceLabels !== false,
      autoHideNavigation: value.autoHideNavigation !== false,
      candleTheme: themes.includes(value.candleTheme as CandleTheme) ? value.candleTheme as CandleTheme : DEFAULT_CHART_SETTINGS.candleTheme,
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
