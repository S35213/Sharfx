export type CandleTheme = 'shafx' | 'mt5' | 'blue' | 'amber'
export type ChartMode = 'candles' | 'bars' | 'wave' | 'area'

export interface ChartWorkspaceSettings {
  showGrid: boolean
  showPriceLabels: boolean
  autoHideNavigation: boolean
  candleTheme: CandleTheme
  chartMode: ChartMode
}

export const DEFAULT_CHART_SETTINGS: ChartWorkspaceSettings = {
  showGrid: true,
  showPriceLabels: true,
  autoHideNavigation: true,
  candleTheme: 'mt5',
  chartMode: 'candles',
}

const KEY = 'shafx.chart.settings'

export function readChartWorkspaceSettings(): ChartWorkspaceSettings {
  if (typeof window === 'undefined') return DEFAULT_CHART_SETTINGS
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? 'null')
    if (!parsed || typeof parsed !== 'object') return DEFAULT_CHART_SETTINGS
    const value = parsed as Partial<ChartWorkspaceSettings>
    const themes: CandleTheme[] = ['shafx', 'mt5', 'blue', 'amber']
    const modes: ChartMode[] = ['candles', 'bars', 'wave', 'area']
    return {
      showGrid: value.showGrid !== false,
      showPriceLabels: value.showPriceLabels !== false,
      autoHideNavigation: value.autoHideNavigation !== false,
      candleTheme: themes.includes(value.candleTheme as CandleTheme) ? value.candleTheme as CandleTheme : DEFAULT_CHART_SETTINGS.candleTheme,
      chartMode: modes.includes(value.chartMode as ChartMode) ? value.chartMode as ChartMode : DEFAULT_CHART_SETTINGS.chartMode,
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
