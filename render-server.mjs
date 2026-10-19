import { createServer } from 'node:http'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import auth from './api/auth.js'
import botStore from './api/bot/store.js'
import botUsage from './api/bot/usage.js'
import derivAccounts from './api/deriv/accounts.js'
import derivCallback from './api/deriv/callback.js'
import derivLogin from './api/deriv/login.js'
import derivStream from './api/deriv/stream.js'
import derivOrder from './api/deriv/order.js'
import paystack from './api/paystack.js'
import providerConnections from './api/providers/connections.js'
import ctrader from './api/providers/ctrader.js'
import adminAuth from './api/admin/auth.js'
import adminLogout from './api/admin/logout.js'
import adminOverview from './api/admin/overview.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const clientRoot = path.join(__dirname, 'dist', 'client')

const handlers = {
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
  '/api/providers/ctrader': ctrader,
  '/api/admin/auth': adminAuth,
  '/api/admin/logout': adminLogout,
  '/api/admin/overview': adminOverview,
}

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

const sendJsonError = (res, status, error) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify({ ok: false, error }))
}

const readBody = async (req) => {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined
  const chunks = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk))
  const text = Buffer.concat(chunks).toString('utf8')
  if (!text) return {}
  const contentType = String(req.headers['content-type'] || '')
  if (contentType.includes('application/json')) {
    try { return JSON.parse(text) } catch { return text }
  }
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(text))
  }
  return text
}

const invokeHandler = async (handler, req, res, requestUrl) => {
  const body = await readBody(req)
  const headers = Object.fromEntries(
    Object.entries(req.headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : value ?? '']),
  )
  const query = Object.fromEntries(requestUrl.searchParams.entries())

  const legacyReq = {
    method: req.method || 'GET',
    url: requestUrl.toString(),
    headers,
    query,
    body,
  }

  let statusCode = 200
  const responseHeaders = new Map()
  let responseBody = null

  const legacyRes = {
    status(status) {
      statusCode = status
      return legacyRes
    },
    setHeader(name, value) {
      responseHeaders.set(name, value)
      return legacyRes
    },
    json(value) {
      if (!responseHeaders.has('Content-Type')) {
        responseHeaders.set('Content-Type', 'application/json; charset=utf-8')
      }
      responseBody = JSON.stringify(value)
      return legacyRes
    },
    send(value) {
      responseBody = typeof value === 'string' ? value : String(value ?? '')
      return legacyRes
    },
    redirect(status, location) {
      statusCode = status
      responseHeaders.set('Location', location)
      responseBody = ''
      return legacyRes
    },
  }

  await handler(legacyReq, legacyRes)

  res.statusCode = statusCode
  for (const [name, value] of responseHeaders) res.setHeader(name, value)
  if (responseBody === null && statusCode >= 200 && statusCode < 300) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    responseBody = JSON.stringify({ ok: true })
  }
  res.end(responseBody ?? '')
}

const stripRenderBase = (pathname) => {
  for (const prefix of ['/Sharfx', '/sharfx']) {
    if (pathname === prefix) return '/'
    if (pathname.startsWith(prefix + '/')) return pathname.slice(prefix.length)
  }
  return pathname
}

const safeClientPath = (pathname) => {
  const decoded = decodeURIComponent(pathname)
  const normalized = path.normalize(decoded).replace(/^[/\\]+/, '')
  const segments = normalized.split(/[\\/]+/).filter(Boolean)
  if (segments.includes('..')) return null
  return segments.join('/')
}

const serveClient = async (requestUrl, req, res) => {
  const normalizedPathname = stripRenderBase(requestUrl.pathname)
  let relative = safeClientPath(normalizedPathname)
  const isOwnerRoute = normalizedPathname === '/owner' || normalizedPathname === '/owner/'

  if (!relative || relative === '') relative = isOwnerRoute ? 'owner.html' : 'index.html'
  if (relative === 'owner') relative = 'owner.html'

  let filePath = path.join(clientRoot, relative)

  try {
    const stat = await fs.stat(filePath)
    if (stat.isDirectory()) filePath = path.join(filePath, 'index.html')
  } catch {
    const requestedExtension = path.extname(relative)
    const canUseSpaFallback = normalizedPathname === '/' || normalizedPathname.endsWith('/') || !requestedExtension

    if (!canUseSpaFallback) {
      sendJsonError(res, 404, 'SHAFX client asset not found.')
      return
    }

    filePath = path.join(clientRoot, isOwnerRoute ? 'owner.html' : 'index.html')
  }

  try {
    const body = await fs.readFile(filePath)
    const ext = path.extname(filePath).toLowerCase()
    res.statusCode = 200
    res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream')
    res.setHeader('Cache-Control', ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    if (req.method === 'HEAD') res.end()
    else res.end(body)
  } catch {
    sendJsonError(res, 404, 'SHAFX client asset not found.')
  }
}

const verifyClientBuild = async () => {
  const indexPath = path.join(clientRoot, 'index.html')
  const html = await fs.readFile(indexPath, 'utf8')
  if (!html.includes('<div id="root"></div>')) throw new Error('SHAFX client index.html is missing #root.')

  const refs = Array.from(html.matchAll(/(?:src|href)="([^"]+)"/g), (match) => match[1])
  const localRefs = refs.filter((ref) => ref && !ref.startsWith('data:') && !ref.startsWith('http:') && !ref.startsWith('https:') && !ref.startsWith('//'))

  for (const ref of localRefs) {
    const normalizedPathname = stripRenderBase(new URL(ref, 'http://127.0.0.1/').pathname)
    const relative = safeClientPath(normalizedPathname)
    if (!relative) continue
    const candidate = path.join(clientRoot, relative)
    await fs.access(candidate)
  }

  console.log('SHAFX_CLIENT_STATIC_PASS: ' + localRefs.length + ' local client references verified')
}

const server = createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url || '/', 'http://127.0.0.1:' + (process.env.PORT || '10000'))
    const handler = handlers[requestUrl.pathname]

    if (handler) {
      if (req.method === 'OPTIONS') {
        res.statusCode = 204
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*')
        res.setHeader('Access-Control-Allow-Credentials', 'true')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
        res.end()
        return
      }
      await invokeHandler(handler, req, res, requestUrl)
      return
    }

    if (requestUrl.pathname === '/__shafx/health') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ ok: true, service: 'sharfx-deriv-render', clientStatic: true }))
      return
    }

    if (requestUrl.pathname.startsWith('/api/')) {
      sendJsonError(res, 404, 'SHAFX API route not found.')
      return
    }

    await serveClient(requestUrl, req, res)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'SHAFX server error.'
    if (!res.headersSent) sendJsonError(res, 500, message)
    else res.end()
  }
})

const port = Number(process.env.PORT || 10000)
verifyClientBuild()
  .then(() => {
    server.listen(port, '0.0.0.0', () => {
      console.log('SHAFX Render server listening on 0.0.0.0:' + port)
    })
  })
  .catch((error) => {
    console.error('SHAFX_CLIENT_STATIC_FAIL:', error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
