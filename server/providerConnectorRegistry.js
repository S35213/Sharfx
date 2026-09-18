import { connectOandaProvider } from './oanda.js'

const connectors = new Map([
  ['oanda', async ({ req, credentials }) => connectOandaProvider({
    req,
    token: credentials.token,
    environment: credentials.environment,
    label: credentials.label,
  })],
])

export const hasProviderConnector = (providerId) => connectors.has(providerId)

export const connectProvider = async ({ providerId, req, credentials }) => {
  const connector = connectors.get(providerId)
  if (!connector) {
    throw Object.assign(new Error('Provider connection is not implemented for ' + providerId + '.'), { status: 409 })
  }
  return connector({ req, credentials })
}
