// #943. A destination-bearing Button or Link that is disabled renders an
// anchor: announced unavailable (`aria-disabled`, never the `disabled`
// attribute an anchor does not have), not followed, still carrying the
// styling hook, and out of the keyboard focus order (docs/decisions/001).
// Asked of a real browser, for the compiled anchor and the fallback alike.
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { createCompiler } from '@hozo/compiler'
import { Button as FallbackButton, Link as FallbackLink } from '@hozo/primitives'
import { transformSync } from 'esbuild'
import { chromium } from 'playwright-core'
import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const executablePath = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((file) => file && existsSync(file))
if (process.env.CI) assert.ok(executablePath, 'CI must run the disabled link browser test')

let browser
before(async () => {
  if (executablePath) {
    browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] })
  }
})
after(async () => {
  await browser?.close()
})

function evaluate(code, globals = {}) {
  const module = { exports: {} }
  const js = transformSync(code, {
    loader: 'tsx',
    format: 'cjs',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code
  runInNewContext(js, { module, h: createElement, Fragment, ...globals })
  return module.exports
}

const compiler = createCompiler()
const compiled = (jsx, globals = {}) => {
  const [web] = compiler.compile(`import { Button, Link } from '@hozo/core'\nconst el = ${jsx}`)
  return renderToStaticMarkup(evaluate(`module.exports = (${web.jsx})`, globals))
}

const cases = {
  'compiled Button': (disabled) =>
    compiled('<Button href="/docs" disabled={off}>Docs</Button>', { off: disabled }),
  'compiled Link': (disabled) =>
    compiled('<Link href="/docs" disabled={off}>Docs</Link>', { off: disabled }),
  'fallback Button': (disabled) =>
    renderToStaticMarkup(createElement(FallbackButton, { href: '/docs', disabled }, 'Docs')),
  'fallback Link': (disabled) =>
    renderToStaticMarkup(createElement(FallbackLink, { href: '/docs', disabled }, 'Docs')),
}

for (const [name, render] of Object.entries(cases)) {
  test(`${name}: a disabled destination is announced, styled and skipped by Tab`, {
    skip: !executablePath,
  }, async () => {
    const page = await browser.newPage()
    try {
      for (const disabled of [true, false]) {
        await page.setContent(
          `<button id="before">before</button>${render(disabled)}<button id="after">after</button>`,
        )
        const link = page.locator('a')
        assert.equal(await link.getAttribute('href'), '/docs', 'navigation remains a link')
        assert.equal(await link.getAttribute('disabled'), null, 'an anchor has no disabled')
        // Enabled, `aria-disabled="false"` and no attribute say the same.
        assert.equal((await link.getAttribute('aria-disabled')) === 'true', disabled)
        assert.equal(
          (await link.getAttribute('data-hozo-disabled')) !== null,
          disabled,
          'the styling hook follows the state',
        )
        await page.focus('#before')
        await page.keyboard.press('Tab')
        assert.equal(
          await page.evaluate(() => document.activeElement?.tagName.toLowerCase()),
          disabled ? 'button' : 'a',
          disabled ? 'Tab skips the disabled link' : 'Tab reaches the enabled link',
        )
      }
    } finally {
      await page.close()
    }
  })
}

test('an author who wrote tabIndex keeps it, disabled or not', () => {
  const html = compiled('<Link href="/docs" disabled={true} tabIndex={0}>Docs</Link>')
  assert.match(html, /tabindex="0"/i, html)
})

test('a Button without a destination keeps its native disabled', () => {
  const html = compiled('<Button disabled={true}>Save</Button>')
  assert.match(html, /<button[^>]* disabled=""/, html)
  assert.doesNotMatch(html, /aria-disabled/, html)
})
