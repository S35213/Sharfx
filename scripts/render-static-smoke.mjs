import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'

const port = 18080
const baseUrl = 'http://127.0.0.1:' + port
const child = spawn(process.execPath, ['render-server.mjs'], {
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let output = ''
child.stdout.on('data', (chunk) => {
  output += chunk.toString()
})
child.stderr.on('data', (chunk) => {
  output += chunk.toString()
})

const stop = () => {
  if (!child.killed) child.kill('SIGTERM')
}

try {
  const startedAt = Date.now()
  while (Date.now() - startedAt < 30000) {
    if (output.includes('SHAFX Render server listening')) break
    if (output.includes('SHAFX_CLIENT_STATIC_FAIL')) throw new Error(output.trim())
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  if (!output.includes('SHAFX Render server listening')) throw new Error('Render server did not start.\n' + output)

  const home = await fetch(baseUrl + '/')
  if (home.status !== 200) throw new Error('Homepage returned HTTP ' + home.status)
  const homeHtml = await home.text()
  if (!homeHtml.includes('<div id="root"></div>')) throw new Error('Homepage did not return the SHAFX root element.')

  const builtIndex = await fs.readFile('dist/client/index.html', 'utf8')
  const refs = Array.from(builtIndex.matchAll(/(?:src|href)="([^"]+)"/g), (match) => match[1])
  const localRefs = refs.filter((ref) => ref && !ref.startsWith('data:') && !ref.startsWith('http:') && !ref.startsWith('https:') && !ref.startsWith('//'))

  for (const ref of localRefs) {
    const pathname = new URL(ref, baseUrl + '/').pathname
    const response = await fetch(baseUrl + pathname)
    if (response.status !== 200) throw new Error('Client asset ' + ref + ' returned HTTP ' + response.status)
    const contentType = response.headers.get('content-type') || ''
    if (/\.js$/i.test(ref) && !contentType.includes('javascript')) throw new Error('JS asset ' + ref + ' returned ' + contentType)
    if (/\.css$/i.test(ref) && !contentType.includes('css')) throw new Error('CSS asset ' + ref + ' returned ' + contentType)
  }

  const missing = await fetch(baseUrl + '/assets/__shafx_missing_asset__.js')
  if (missing.status !== 404) throw new Error('Missing JS asset returned HTTP ' + missing.status + ' instead of 404')

  const health = await fetch(baseUrl + '/__shafx/health')
  if (health.status !== 200) throw new Error('Health endpoint returned HTTP ' + health.status)

  console.log('SHAFX_RENDER_STATIC_PASS: homepage, built client assets, missing-asset 404, and health endpoint verified')
} finally {
  stop()
}
