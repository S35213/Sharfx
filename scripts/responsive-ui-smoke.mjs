import { chromium } from 'playwright'

const baseUrl = process.env.SHAFX_TEST_URL || 'https://sharfx-deriv-render.onrender.com'

const viewports = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet-portrait', width: 768, height: 1024 },
  { name: 'tablet-landscape', width: 1024, height: 768 },
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'tv', width: 1920, height: 1080 },
]

const browser = await chromium.launch({ headless: true })
try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } })
    await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForSelector('#root', { timeout: 10000 })
    await page.waitForTimeout(1700)

    const createAccount = page.getByRole('button', { name: 'Create account', exact: true })
    await createAccount.click()
    await page.getByRole('heading', { name: 'Create your SHARFX account', exact: true }).waitFor({ state: 'visible', timeout: 10000 })

    const signup = page.locator('form')
    const requiredInputs = signup.locator('input:not([aria-hidden="true"])')
    if (await requiredInputs.count() < 3) throw new Error(viewport.name + ': signup form did not expose the expected account inputs')

    const scrollState = await page.evaluate(() => {
      const root = document.documentElement
      const body = document.body
      return {
        viewportHeight: window.innerHeight,
        documentHeight: Math.max(root.scrollHeight, body.scrollHeight),
        bodyOverflowY: getComputedStyle(body).overflowY,
      }
    })

    const submitButton = signup.getByRole('button', { name: /Create SHARFX account/i })
    await submitButton.scrollIntoViewIfNeeded()
    const rect = await submitButton.boundingBox()
    if (!rect || rect.top < 0 || rect.bottom > viewport.height) {
      throw new Error(viewport.name + ': account-create button could not be scrolled into the viewport')
    }

    if (viewport.height <= 844 && scrollState.documentHeight <= scrollState.viewportHeight + 1) {
      throw new Error(viewport.name + ': expected a scrollable page for the signup form')
    }

    if (scrollState.bodyOverflowY === 'hidden') throw new Error(viewport.name + ': body overflow-y remained hidden')

    console.log(
      'SHAFX_RESPONSIVE_PASS:',
      viewport.name,
      viewport.width + 'x' + viewport.height,
      'signup inputs=', await requiredInputs.count(),
      'docHeight=', scrollState.documentHeight,
      'viewportHeight=', scrollState.viewportHeight,
    )

    await page.close()
  }
} finally {
  await browser.close()
}
