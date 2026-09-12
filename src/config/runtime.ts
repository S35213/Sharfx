export type RuntimeMode = 'simulator' | 'live'

export interface RuntimeConfig {
  mode: RuntimeMode
  liveMarketApiBaseUrl?: string
  liveBrokerGatewayBaseUrl?: string
}

const parseMode = (value: string | undefined): RuntimeMode => value === 'live' ? 'live' : 'simulator'

const readEnv = (): Record<string, string | undefined> => import.meta.env as Record<string, string | undefined>

const assertNoClientSecrets = (env: Record<string, string | undefined>): void => {
  const forbidden = Object.keys(env).filter((key) => /^VITE_/i.test(key) && /(SECRET|PRIVATE|PASSWORD|TOKEN|API_KEY|ACCESS_KEY|CLIENT_SECRET)/i.test(key))
  if (forbidden.length > 0) throw new Error(`Client secret-like environment variables are forbidden: ${forbidden.join(', ')}`)
}

export const loadRuntimeConfig = (): RuntimeConfig => {
  const env = readEnv()
  assertNoClientSecrets(env)
  const mode = parseMode(env.VITE_SHAFX_MODE)
  const liveMarketApiBaseUrl = env.VITE_SHAFX_LIVE_MARKET_API_URL?.trim() || undefined
  const liveBrokerGatewayBaseUrl = env.VITE_SHAFX_LIVE_BROKER_GATEWAY_URL?.trim() || undefined
  if (mode === 'live' && (!liveMarketApiBaseUrl || !liveBrokerGatewayBaseUrl)) throw new Error('Live mode requires explicit market API and broker gateway URLs.')
  return { mode, liveMarketApiBaseUrl, liveBrokerGatewayBaseUrl }
}

export const runtimeConfig = loadRuntimeConfig()
