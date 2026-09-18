import { connectOandaProvider } from './oanda.js'
import { connectBinanceProvider } from './binance.js'

const connectors = new Map()

export const registerProviderConnector = (providerId, connector) => {
  const id = String(providerId || '').trim()
  if (!id) throw new Error('Provider connector id is required.')
  if (typeof connector !== 'function') throw new Error('Provider connector must be a function.')
  if (connectors.has(id)) throw new Error('Provider connector already registered: ' + id)
  connectors.set(id, connector)
}

export const hasProviderConnector = (providerId) => connectors.has(providerId)
export const listProviderConnectors = () => [...connectors.keys()]

export const connectProvider = async ({ providerId, req, credentials }) => {
  const connector = connectors.get(providerId)
  if (!connector) {
    throw Object.assign(new Error('Provider connection is not implemented for ' + providerId + '.'), { status: 409 })
  }
  return connector({ req, credentials })
}

registerProviderConnector('oanda', async ({ req, credentials }) => connectOandaProvider({
  req,
  token: credentials.token,
  environment: credentials.environment,
  label: credentials.label,
}))

registerProviderConnector('binance', async ({ req, credentials }) => connectBinanceProvider({
  req,
  apiKey: credentials.apiKey,
  apiSecret: credentials.apiSecret,
  environment: credentials.environment,
  label: credentials.label,
}))