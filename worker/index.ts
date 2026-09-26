import auth from '../api/auth.js'
import botStore from '../api/bot/store.js'
import botUsage from '../api/bot/usage.js'
import derivAccounts from '../api/deriv/accounts.js'
import derivCallback from '../api/deriv/callback.js'
import derivLogin from '../api/deriv/login.js'
import derivStream from '../api/deriv/stream.js'
import derivOrder from '../api/deriv/order.js'
import paystack from '../api/paystack.js'
import providerConnections from '../api/providers/connections.js'
import adminAuth from '../api/admin/auth.js'
import adminLogout from '../api/admin/logout.js'
import adminOverview from '../api/admin/overview.js'

type LegacyRequest = {
  method: string
  url: string
  headers: Record<string, string>
  query: Record<string, string>
  body: unknown
}

type LegacyResponse = {
  status: (status: number) => LegacyResponse
  setHeader: (name: string, value: string | string[]) => LegacyResponse
  json: (body: unknown) => LegacyResponse
  send: (body: unknown) => LegacyResponse
  redirect: (status: number, location: string) => LegacyResponse
}

type LegacyHandler = (req: LegacyRequest, res: LegacyResponse) => Promise<unknown> | unknown


const handleDerivPublicMarketWebSocket = async (request: Request): Promise<Response> => {
  if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') {
    return new Response('Expected Upgrade: websocket', { status: 426 })
  }

  const pair = new WebSocketPair()
  const client = pair[0]
  const server = pair[1]
  server.accept()

  const upstreamResponse = await fetch('https://api.derivws.com/trading/v1/options/ws/public', {
    headers: { Upgrade: 'websocket' },
  })
  const upstream = upstreamResponse.webSocket

  if (!upstream) {
    server.close(1011, 'Deriv market stream unavailable')
    return new Response(null, { status: 101, webSocket: client })
  }

  upstream.accept()

  const closeBoth = (code = 1000, reason = 'closed'): void => {
    try { if (server.readyState === WebSocket.OPEN || server.readyState === WebSocket.CLOSING) server.close(code, reason) } catch (error) { void error }
    try { if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CLOSING) upstream.close(code, reason) } catch (error) { void error }
  }

  server.addEventListener('message', (event) => {
    if (upstream.readyState === WebSocket.OPEN) upstream.send(event.data)
  })
  upstream.addEventListener('message', (event) => {
    if (server.readyState === WebSocket.OPEN) server.send(event.data)
  })
  server.addEventListener('close', (event) => closeBoth(event.code || 1000, event.reason || 'client closed'))
  upstream.addEventListener('close', (event) => closeBoth(event.code || 1000, event.reason || 'upstream closed'))
  server.addEventListener('error', () => closeBoth(1011, 'client websocket error'))
  upstream.addEventListener('error', () => closeBoth(1011, 'Deriv websocket error'))

  return new Response(null, {
    status: 101,
    webSocket: client,
  })
}

const handlers: Record<string, LegacyHandler> = {
  '/api/auth': auth,
  '/api/bot/store': botStore,
  '/api/bot/usage': botUsage,
  '/api/deriv/accounts': derivAccounts,
  '/api/deriv/callback': derivCallback,
  '/api/deriv/login': derivLogin,
  '/api/deriv/stream': derivStream,
  '/api/deriv/order': derivOrder,
  '/api/paystack': paystack,
  '/api/providers/connections': providerConnections,
  '/api/admin/auth': adminAuth,
  '/api/admin/logout': adminLogout,
  '/api/admin/overview': adminOverview,
}

const parseBody = async (request: Request): Promise<unknown> => {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined
  const text = await request.text()
  if (!text) return {}
  const contentType = request.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    try { return JSON.parse(text) } catch { return text }
  }
  return text
}

const invokeLegacyHandler = async (handler: LegacyHandler, request: Request): Promise<Response> => {
  const url = new URL(request.url)
  const headers = Object.fromEntries(request.headers.entries())
  const query: Record<string, string> = {}
  url.searchParams.forEach((value, key) => { query[key] = value })

  const legacyRequest = {
    method: request.method,
    url: request.url,
    headers,
    query,
    body: await parseBody(request),
  }

  let statusCode = 200
  const responseHeaders = new Headers()
  let responseBody: BodyInit | null = null

  const response = {
    status(status: number) {
      statusCode = status
      return response
    },
    setHeader(name: string, value: string | string[]) {
      if (Array.isArray(value)) {
        for (const item of value) responseHeaders.append(name, item)
      } else {
        responseHeaders.set(name, value)
      }
      return response
    },
    json(body: unknown) {
      if (!responseHeaders.has('Content-Type')) responseHeaders.set('Content-Type', 'application/json; charset=utf-8')
      responseBody = JSON.stringify(body)
      return response
    },
    send(body: unknown) {
      responseBody = typeof body === 'string' ? body : String(body ?? '')
      return response
    },
    redirect(status: number, location: string) {
      statusCode = status
      responseHeaders.set('Location', location)
      return response
    },
  }

  await handler(legacyRequest, response)

  return new Response(responseBody, {
    status: statusCode,
    headers: responseHeaders,
  })
}

export default {
  async fetch(request: Request, env: {
    ASSETS: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    }
  }): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/api/deriv/public-market' && request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      try {
        return await handleDerivPublicMarketWebSocket(request)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Deriv market WebSocket proxy failed.'
        return new Response(message, { status: 502 })
      }
    }

    if (url.pathname === '/owner') {
      const ownerUrl = new URL('/owner.html', request.url)
      return env.ASSETS.fetch(ownerUrl.toString(), { headers: request.headers })
    }

    const handler = handlers[url.pathname]
    if (handler) {
      try {
        return await invokeLegacyHandler(handler, request)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'SHAFX server error.'
        return Response.json({ ok: false, error: message }, { status: 500 })
      }
    }

    return env.ASSETS.fetch(request)
  },
}
