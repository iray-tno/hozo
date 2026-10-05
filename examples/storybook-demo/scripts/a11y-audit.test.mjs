import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { auditPage, waitForSettledStory } from './a11y-audit.mjs'

const executablePath = [
  process.env.CHROME_PATH,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((file) => file && existsSync(file))
if (process.env.CI) assert.ok(executablePath, 'CI must run the browser regressions')
const axeSource = readFileSync(fileURLToPath(import.meta.resolve('axe-core/axe.min.js')), 'utf8')
let browser
before(async () => {
  if (executablePath)
    browser = await chromium.launch({
      executablePath,
      headless: true,
      args: ['--no-sandbox', '--disable-gpu'],
    })
})
after(async () => {
  await browser?.close()
})

const content = `<style>
body { background: #f8fafc }
#panel { background: #fff; color: #475569; padding: 24px }
@media (prefers-color-scheme: dark) { #panel { background: #0f172a; color: #cbd5e1 } }
</style><div id="storybook-root"><div id="panel"><p>Shipping takes two days.</p></div></div>`

for (const scheme of ['light', 'dark']) {
  test(`a ${scheme} entrance is audited at its final colours, without restyling it`, {
    skip: !executablePath,
  }, async () => {
    const page = await browser.newPage({ colorScheme: scheme })
    try {
      await page.setContent(content)
      // Hold a finite entrance mid-fade: the same blended-colour failure the
      // virtual-time driver reported, made deterministic rather than retried.
      await page.evaluate(() => {
        window.entrance = document
          .getElementById('panel')
          .animate([{ opacity: 0.2 }, { opacity: 1 }], { duration: 800, fill: 'both' })
        entrance.pause()
        entrance.currentTime = 100
      })
      await page.addScriptTag({ content: `${axeSource}\nwindow.__hozoAuditAxe = window.axe;` })
      const midFade = await page.evaluate(
        async () =>
          (await __hozoAuditAxe.run(document.getElementById('storybook-root'))).violations,
      )
      assert.ok(midFade.some((violation) => violation.id === 'color-contrast'))
      await page.evaluate(() => entrance.play())
      const result = await auditPage(page, axeSource)
      assert.equal(result.dark, scheme === 'dark')
      assert.deepEqual(result.found, [])
      assert.equal(
        await page.locator('#panel').evaluate((element) => getComputedStyle(element).opacity),
        '1',
      )
      assert.equal(await page.evaluate(() => entrance.effect.getTiming().duration), 800)
    } finally {
      await page.close()
    }
  })
}

test('a persistent contrast defect still fails after readiness', {
  skip: !executablePath,
}, async () => {
  const page = await browser.newPage({ colorScheme: 'light' })
  try {
    await page.setContent(`${content}<style>#panel { color: #ddd }</style>`)
    const result = await auditPage(page, axeSource)
    const failure = result.found.find((violation) => violation.rule === 'color-contrast')
    assert.ok(failure)
    assert.match(failure.details, /insufficient color contrast/)
  } finally {
    await page.close()
  }
})

test('a paused finite entrance fails within the original bound', {
  skip: !executablePath,
}, async () => {
  const page = await browser.newPage()
  try {
    await page.setContent(content)
    await page.evaluate(() => {
      const animation = document
        .getElementById('panel')
        .animate([{ opacity: 0 }, { opacity: 1 }], { duration: 800 })
      animation.pause()
    })
    await assert.rejects(page.evaluate(waitForSettledStory, 100), /story did not settle/)
  } finally {
    await page.close()
  }
})

test('a missing story cannot pass as an empty accessibility tree', {
  skip: !executablePath,
}, async () => {
  const page = await browser.newPage()
  try {
    await page.setContent('<div id="storybook-root"></div>')
    await assert.rejects(page.evaluate(waitForSettledStory, 100), /story did not settle/)
  } finally {
    await page.close()
  }
})

test('the hidden Storybook error template is not mistaken for a render failure', {
  skip: !executablePath,
}, async () => {
  const page = await browser.newPage()
  try {
    await page.setContent(
      '<div class="sb-errordisplay" hidden></div><div id="storybook-root"></div>',
    )
    await page.evaluate(() => {
      setTimeout(() => {
        document.getElementById('storybook-root').innerHTML = '<p>Rendered</p>'
      }, 50)
    })
    await page.evaluate(waitForSettledStory, 1000)
  } finally {
    await page.close()
  }
})

test('an active Storybook error is reported rather than audited as an empty tree', {
  skip: !executablePath,
}, async () => {
  const page = await browser.newPage()
  try {
    await page.setContent(
      '<body class="sb-show-errordisplay"><div class="sb-errordisplay">Render failed</div><div id="storybook-root"></div></body>',
    )
    await assert.rejects(page.evaluate(waitForSettledStory, 1000), /Storybook failed to render/)
  } finally {
    await page.close()
  }
})

test('a decorative infinite spinner remains running without blocking the audit', {
  skip: !executablePath,
}, async () => {
  const page = await browser.newPage()
  try {
    await page.setContent(`${content}<div aria-hidden="true" id="spinner"></div>`)
    await page.evaluate(() => {
      window.spinnerAnimation = document
        .getElementById('spinner')
        .animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], {
          duration: 800,
          iterations: Infinity,
        })
    })
    await page.evaluate(waitForSettledStory, 1000)
    assert.equal(await page.evaluate(() => spinnerAnimation.playState), 'running')
  } finally {
    await page.close()
  }
})
