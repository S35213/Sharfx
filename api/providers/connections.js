import {
  disconnectProviderConnection,
  getShafxUser,
  listProviderConnections,
  recordProviderAudit,
  touchProviderConnection,
} from '../../server/providerConnections.js'

const json = (res, status, body) => res.status(status).json(body)

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    const user = await getShafxUser(req)
    if (!user) return json(res, 401, { ok: false, error: 'SHAFX sign-in is required.' })

    if (req.method === 'GET') {
      return json(res, 200, { ok: true, connections: await listProviderConnections(user.id) })
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'object' && req.body ? req.body : {}
      const action = String(body.action || '')
      const connectionId = String(body.connectionId || '')
      if (!connectionId) return json(res, 400, { ok: false, error: 'Provider connection id is required.' })

      if (action === 'disconnect') {
        await disconnectProviderConnection({ userId: user.id, connectionId })
        await recordProviderAudit({
          userId: user.id,
          connectionId,
          eventType: 'connection_disconnected',
          metadata: { source: 'user' },
        })
        return json(res, 200, { ok: true })
      }

      if (action === 'touch') {
        await touchProviderConnection({ userId: user.id, connectionId })
        return json(res, 200, { ok: true })
      }

      return json(res, 400, { ok: false, error: 'Unsupported provider connection action.' })
    }

    return json(res, 405, { ok: false, error: 'Method not allowed' })
  } catch (error) {
    return json(res, 500, { ok: false, error: error instanceof Error ? error.message : 'Provider connection service failed.' })
  }
}
