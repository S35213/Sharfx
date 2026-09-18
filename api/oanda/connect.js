import { connectOandaProvider } from '../../server/oanda.js'

const json = (res, status, body) => res.status(status).json(body)

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' })

  try {
    const body = typeof req.body === 'object' && req.body ? req.body : {}
    const result = await connectOandaProvider({
      req,
      token: body.token,
      environment: body.environment,
      label: body.label,
    })
    return json(res, 200, { ok: true, connectionId: result.connectionId, accounts: result.accounts.map((account) => ({ accountId: account.accountId, label: account.accountLabel, environment: account.environment, currency: account.currency })) })
  } catch (error) {
    return json(res, Number(error?.status) || 500, { ok: false, error: error instanceof Error ? error.message : 'Unable to connect OANDA.' })
  }
}
