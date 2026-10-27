import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { normalizeCodeLines } from '@hozo/typography/code/model'
import { chromium } from 'playwright-core'
import { htmlToHast, markdownToMdast, mdxToMdast } from 'satteri'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.resolve(root, process.argv[2] ?? 'dist')
const docs = path.join(root, 'src/content/docs')
const artifacts = path.resolve(root, '../../artifacts/docs-code-blocks')
mkdirSync(artifacts, { recursive: true })
const walk = (node, visit) => {
  visit(node)
  for (const child of node.children ?? []) walk(child, visit)
}
const property = (node, name) =>
  node.properties?.[name] ??
  node.properties?.[name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())]
const codeText = (node) => {
  if (node.type === 'text') return node.value
  if (property(node, 'aria-hidden') || node.properties?.style?.includes('clip-path:inset(50%)'))
    return ''
  return (node.children ?? []).map(codeText).join('')
}
let fenceCount = 0
let exampleCount = 0
const sourceFiles = readdirSync(docs, { recursive: true }).filter((file) => /\.mdx?$/.test(file))
for (const file of sourceFiles) {
  const source = readFileSync(path.join(docs, file), 'utf8')
  const fences = []
  let expectedExamples = 0
  walk(file.endsWith('.mdx') ? mdxToMdast(source) : markdownToMdast(source), (node) => {
    if (node.type === 'code') fences.push(node.value)
    if (node.type === 'mdxJsxFlowElement' && node.name === 'UiExample') expectedExamples++
    if (node.type === 'mdxJsxFlowElement' && node.name === 'CompiledExample') expectedExamples += 5
  })
  const slug = file.replace(/\.mdx?$/, '').replace(/[/\\]index$/, '')
  const html = readFileSync(path.join(dist, slug, 'index.html'), 'utf8')
  const hosts = []
  walk(htmlToHast(html, { fragment: true }), (node) => {
    if (property(node, 'data-hozo-docs-code')) hosts.push(node)
  })
  const actualFences = []
  const ids = []
  for (const host of hosts) {
    const data = JSON.parse(property(host, 'data-hozo-docs-code'))
    const prefix = property(host, 'data-code-prefix')
    if (prefix.startsWith('docs-fence-')) actualFences.push(data.code)
    else exampleCount++
    let code
    walk(host, (node) => {
      if (node.type !== 'element') return
      assert.notEqual(node.tagName, 'button', `${file}: Copy must wait for its client connection`)
      assert.notEqual(node.tagName, 'script', `${file}: source must stay literal`)
      if (node.tagName === 'code') code = node
      if (node.properties?.id) ids.push(node.properties.id)
    })
    assert.ok(code, `${file}: no readable pre/code in the initial HTML`)
    assert.equal(
      code.children.map(codeText).join('\n'),
      normalizeCodeLines(data.lines)
        .map((line) => line.tokens.map((token) => token.text).join(''))
        .join('\n'),
      file,
    )
  }
  assert.deepEqual(actualFences, fences, `${file}: every parsed fence must use the shared renderer`)
  assert.equal(ids.length, new Set(ids).size, `${file}: duplicate code caption IDs`)
  assert.equal(
    hosts.length - actualFences.length,
    expectedExamples,
    `${file}: source/compiled listings missing`,
  )
  assert.ok(!html.includes('class="expressive-code"'), `${file}: a legacy renderer remains`)
  fenceCount += fences.length
}
assert.ok(fenceCount > 0 && exampleCount > 0)
writeFileSync(
  path.join(artifacts, 'inventory.json'),
  JSON.stringify(
    { files: sourceFiles.length, fences: fenceCount, exampleListings: exampleCount },
    null,
    2,
  ),
)
console.log(
  `Docs: all ${fenceCount} parsed Markdown/MDX fences and ${exampleCount} source/generated listings render readable CodeBlock HTML across ${sourceFiles.length} pages`,
)

const executablePath = [
  process.env.CHROME_PATH,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((file) => file && existsSync(file))
if (!executablePath) {
  if (process.env.CI) throw new Error('Docs: browser required in CI')
  console.log('Docs: no browser available; interactive checks skipped')
  process.exit(0)
}
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
}
const server = createServer((req, res) => {
  const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(
    /^\/hozo\/?/,
    '',
  )
  let file = path.resolve(dist, relative || 'index.html')
  if (!path.extname(file)) file = path.join(file, 'index.html')
  if (!file.startsWith(`${dist}${path.sep}`) || !existsSync(file)) return res.writeHead(404).end()
  res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' })
  res.end(readFileSync(file))
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
const timeout = setTimeout(() => {
  console.error('Docs: timed out after 3 minutes')
  process.exit(1)
}, 180_000)
let browser
const payloads = []
try {
  browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] })
  for (const width of [320, 768, 1280]) {
    for (const route of ['getting-started/astro', 'components/code-block', '']) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: 'dark' })
      const errors = []
      const scripts = new Set()
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('dialog', (dialog) => {
        errors.push(`Unexpected dialog: ${dialog.message()}`)
        void dialog.dismiss()
      })
      page.on('console', (message) => {
        if (message.type() === 'error' && !message.text().includes('Failed to load resource'))
          errors.push(message.text())
      })
      page.on('request', (request) => {
        const url = new URL(request.url())
        if (url.origin === origin && url.pathname.endsWith('.js')) scripts.add(url.pathname)
      })
      await page.route('**/*', (request) =>
        request.request().url().startsWith(origin) ? request.continue() : request.abort(),
      )
      await page.addInitScript(() => {
        window.docsCopies = []
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: {
            writeText: async (text) => {
              if (window.docsDenyCopy) throw new Error('clipboard denied')
              window.docsCopies.push(text)
            },
          },
        })
      })
      await page.goto(`${origin}/hozo/docs/${route ? `${route}/` : ''}`)
      const hosts = page.locator('[data-hozo-docs-code]')
      const visible =
        route === 'components/code-block'
          ? hosts.filter({ has: page.getByRole('figure', { name: 'App.tsx', exact: true }) })
          : hosts.first()
      const copy = visible.getByRole('button', { name: 'Copy code', exact: true })
      await copy.waitFor()
      const expected = await visible.evaluate((node) => JSON.parse(node.dataset.hozoDocsCode).code)
      await copy.focus()
      await copy.press('Enter')
      await page.waitForFunction(() => window.docsCopies.length === 1)
      assert.equal(await page.evaluate(() => window.docsCopies[0]), expected)
      const notice = visible.locator('[aria-live]')
      await visible.getByText('Copied', { exact: true }).first().waitFor({ state: 'attached' })
      const firstNotice = await notice.allTextContents()
      await copy.press('Enter')
      await page.waitForFunction(() => window.docsCopies.length === 2)
      await page.waitForFunction(
        ({ prefix, previous }) => {
          const host = document.querySelector(`[data-code-prefix="${prefix}"]`)
          return (
            JSON.stringify(
              [...host.querySelectorAll('[aria-live]')].map((node) => node.textContent),
            ) !== JSON.stringify(previous)
          )
        },
        { prefix: await visible.getAttribute('data-code-prefix'), previous: firstNotice },
      )
      assert.notDeepEqual(
        await notice.allTextContents(),
        firstNotice,
        'repeated Copy must update its announcement channel',
      )
      await page.evaluate(() => {
        window.docsDenyCopy = true
      })
      await copy.press('Enter')
      await visible.getByText('Could not copy code', { exact: true }).waitFor({ state: 'attached' })
      assert.equal(await copy.evaluate((node) => document.activeElement === node), true)
      for (const theme of ['light', 'dark']) {
        await page
          .locator('starlight-theme-select select')
          .first()
          .evaluate((select, value) => {
            select.value = value
            select.dispatchEvent(new Event('change', { bubbles: true }))
          }, theme)
        assert.equal(await page.locator('html').getAttribute('data-theme'), theme)
        assert.equal(await copy.evaluate((node) => document.activeElement === node), true)
        const contrast = await hosts.evaluateAll((nodes) => {
          const rgb = (color) => color.match(/[\d.]+/g).map(Number)
          const light = (color) =>
            rgb(color)
              .slice(0, 3)
              .map((value) => {
                const v = value / 255
                return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
              })
              .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0)
          const failures = []
          for (const host of nodes)
            for (const token of host.querySelectorAll(
              'code span[style*="color"], .hozo-docs-code-gutter, figcaption, button',
            )) {
              if (!token.textContent.trim()) continue
              let background = token
              while (
                background.parentElement &&
                rgb(getComputedStyle(background).backgroundColor)[3] === 0
              )
                background = background.parentElement
              const a = light(getComputedStyle(token).color),
                b = light(getComputedStyle(background).backgroundColor)
              const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
              if (ratio < 4.5) failures.push({ text: token.textContent.slice(0, 30), ratio })
            }
          return failures
        })
        assert.deepEqual(contrast, [], `${route}/${width}/${theme}: text contrast`)
        if (theme === 'light' && route === 'components/code-block' && width !== 768)
          await visible.screenshot({ path: path.join(artifacts, `code-${width}-light.png`) })
      }
      if (width === 320) {
        const overflow = hosts.locator('[role="region"][tabindex="0"]').first()
        assert.ok(await overflow.count(), `${route}: a long code region must have a keyboard stop`)
        await overflow.focus()
        await overflow.press('ArrowRight')
        await page.waitForFunction(() =>
          [...document.querySelectorAll('[data-hozo-docs-code] [role="region"]')].some(
            (node) => node.scrollLeft > 0,
          ),
        )
        assert.ok(
          await overflow.evaluate(
            (node) => Number.parseFloat(getComputedStyle(node).outlineWidth) >= 2,
          ),
        )
      }
      if (route === '') {
        await page.getByText('What the React Native build writes', { exact: true }).click()
        await page
          .getByRole('figure', { name: 'Components', exact: true })
          .getByRole('button', { name: 'Copy code' })
          .waitFor()
      }
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `${route}/${width}: page overflow`,
      )
      assert.deepEqual(errors, [], `${route}/${width}: browser errors`)
      if (width === 1280 && route === 'getting-started/astro') {
        const files = [...scripts].map((url) => {
          const bytes = readFileSync(path.join(dist, url.replace(/^\/hozo\//, '')))
          return { url, raw: bytes.length, gzip: gzipSync(bytes).length }
        })
        payloads.push({
          page: route,
          scope:
            'First-party JS requested by a fresh browser before search interaction; gzip is local compression, not observed HTTP transfer',
          files,
          raw: files.reduce((sum, file) => sum + file.raw, 0),
          gzip: files.reduce((sum, file) => sum + file.gzip, 0),
        })
      }
      await page.close()
    }
  }
  const noScript = await browser.newPage({
    javaScriptEnabled: false,
    viewport: { width: 320, height: 900 },
  })
  await noScript.route('**/*', (route) =>
    route.request().url().startsWith(origin) ? route.continue() : route.abort(),
  )
  await noScript.goto(`${origin}/hozo/docs/components/code-block/`)
  const staticFigure = noScript.getByRole('figure', { name: 'App.tsx', exact: true })
  assert.ok((await staticFigure.locator('code').textContent()).includes('const highlighted = true'))
  assert.equal(await staticFigure.getByRole('button').count(), 0)
  assert.ok(await noScript.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await noScript.close()
  const unavailable = await browser.newPage({ viewport: { width: 320, height: 900 } })
  await unavailable.route('**/*', (route) =>
    route.request().url().startsWith(origin) ? route.continue() : route.abort(),
  )
  await unavailable.addInitScript(() =>
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }),
  )
  await unavailable.goto(`${origin}/hozo/docs/getting-started/astro/`)
  await unavailable.locator('[data-hozo-docs-code] [role="region"][tabindex="0"]').first().waitFor()
  assert.equal(await unavailable.locator('[data-hozo-docs-code] button').count(), 0)
  await unavailable.close()
  const codeModules = payloads[0].files
    .filter(({ url }) =>
      readFileSync(path.join(dist, url.replace(/^\/hozo\//, '')), 'utf8').includes(
        'dataset.codePrefix',
      ),
    )
    .map(({ url }) => url)
  assert.ok(
    codeModules.length,
    'identify the actual hydrated code module before checking its absence',
  )
  const empty = await browser.newPage()
  const emptyRequests = []
  empty.on('request', (request) => emptyRequests.push(new URL(request.url()).pathname))
  await empty.route('**/*', (route) =>
    route.request().url().startsWith(origin) ? route.continue() : route.abort(),
  )
  await empty.goto(`${origin}/hozo/docs/status/`, { waitUntil: 'networkidle' })
  assert.equal(await empty.locator('[data-hozo-docs-code]').count(), 0)
  assert.ok(
    codeModules.every((url) => !emptyRequests.includes(url)),
    'a page without listings must not load their renderer',
  )
  await empty.close()
  writeFileSync(path.join(artifacts, 'payload.json'), JSON.stringify(payloads, null, 2))
  console.log(
    'Docs: Copy/repeated feedback/denial/unavailable clipboard, independent light/dark contrast, focus/overflow and closed disclosures pass at 320/768/1280px; code remains readable without JavaScript',
  )
} finally {
  clearTimeout(timeout)
  await browser?.close()
  await new Promise((resolve) => server.close(resolve))
}
