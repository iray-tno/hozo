import assert from 'node:assert/strict'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { chromium } from 'playwright-core'
import { handleRoot } from '../../../scripts/style-slots/handle-publication.mjs'
import { prepareWebHandle } from '../../../scripts/style-slots/handle-web.mjs'

const executablePath = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((file) => file && existsSync(file))
if (process.env.CI) assert.ok(executablePath, 'CI requires real owner-handle browser evidence')

test('handle Web oracle and candidate fixture include the actual state selectors', async () => {
  const fixture = await prepareWebHandle()
  assert.ok(fixture.candidateCss.length && fixture.oracleCss.length)
  for (const css of [fixture.candidateCss, fixture.oracleCss]) {
    assert.match(css, /hover/)
    assert.match(css, /focus/)
    assert.match(css, /active/)
  }
})

test('real Web handle computed rest/hover/focus/pressed styles match Tailwind on each actual host', {
  skip: !executablePath,
}, async () => {
  const evidence = {
    schema: 1,
    passed: false,
    scope: 'web-computed-style-real-pointer-focus',
    observations: [],
  }
  const destination = path.join(handleRoot, 'artifacts/style-fact-model/handle-browser.json')
  let browser
  try {
    const fixture = await prepareWebHandle()
    const bundle = await build({
      stdin: {
        contents: `import {useState} from 'react'; import {createRoot} from 'react-dom/client'; import {BottomSheet} from '@hozo/patterns';
function App({interactive}) {const [open,setOpen]=useState(true);const [tick,setTick]=useState(0);window.setOpen=setOpen;window.bump=()=>setTick(x=>x+1);
return <BottomSheet open={open} portal={false} onClose={()=>setOpen(false)} detents={interactive?[.5,1]:[1]} accessibilityLabel="Owner evidence" sheetClassName="owner-panel" handleClassName={"owner-handle "+(interactive?${JSON.stringify(fixture.interactive)}:${JSON.stringify(fixture.rest)} )}><button>Content</button><span>{tick}</span></BottomSheet>}
window.mount=(interactive)=>{window.fixtureRoot=createRoot(document.querySelector('#root'));fixtureRoot.render(<App interactive={interactive}/>)};`,
        resolveDir: fileURLToPath(new URL('../', import.meta.url)),
        loader: 'tsx',
      },
      bundle: true,
      write: false,
      minify: true,
      format: 'iife',
      platform: 'browser',
      jsx: 'automatic',
      define: { 'process.env.NODE_ENV': '"production"' },
    })
    browser = await chromium.launch({ executablePath, args: ['--no-sandbox', '--disable-gpu'] })
    const errors = []
    for (const interactive of [false, true]) {
      const pages = []
      try {
        for (const [kind, css] of [
          ['candidate', fixture.candidateCss],
          ['tailwind', fixture.oracleCss],
        ]) {
          const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
          pages.push(page)
          page.on('pageerror', (error) => errors.push(error.message))
          // Normalize the UA border on both subjects, as preflight does.
          // Padding32 + border4 otherwise forces used width36 despite width32.
          await page.setContent(
            `<style>.owner-panel{width:300px;height:400px}.owner-handle{border:0;box-sizing:border-box}</style><style data-candidates>${css}</style><div id="root"></div>`,
          )
          await page.addScriptTag({ content: bundle.outputFiles[0].text })
          await page.evaluate((value) => window.mount(value), interactive)
          await page.getByRole('dialog', { name: 'Owner evidence' }).waitFor()
          const handle = page.locator('.owner-handle')
          assert.equal(await handle.count(), 1)
          assert.equal(
            await handle.evaluate((node) => node.tagName),
            interactive ? 'BUTTON' : 'DIV',
          )
          if (interactive) assert.equal(await handle.getAttribute('aria-label'), 'Resize')
          else assert.equal(await handle.getAttribute('aria-hidden'), 'true')
          await page.mouse.move(800, 650)
          await page.getByRole('button', { name: 'Content', exact: true }).focus()
          await handle.evaluate((node) => {
            window.ownerBefore = node
          })
          await page.waitForFunction(
            () => !document.querySelector('.owner-handle').matches(':focus'),
          )
          const rest = await read(handle)
          assert.deepEqual(rest, {
            paddingTop: '16px',
            width: '32px',
            opacity: '1',
            backgroundColor: 'rgb(34, 51, 68)',
          })
          evidence.observations.push({ kind, interactive, state: 'rest', selected: rest })
          await page.evaluate(() => window.bump())
          await page.waitForFunction(
            () => document.querySelector('[role=dialog] span')?.textContent === '1',
          )
          assert.equal(await handle.evaluate((node) => node === window.ownerBefore), true)
          if (interactive) {
            await handle.hover()
            await page.waitForFunction(
              () => getComputedStyle(document.querySelector('.owner-handle')).opacity === '0.5',
            )
            evidence.observations.push({
              kind,
              interactive,
              state: 'hover',
              selected: await read(handle),
            })
            await page.mouse.move(800, 650)
            await page.getByRole('button', { name: 'Content', exact: true }).focus()
            await page.keyboard.press('Shift+Tab')
            assert.equal(await handle.evaluate((node) => node === document.activeElement), true)
            await page.waitForFunction(
              () => getComputedStyle(document.querySelector('.owner-handle')).paddingTop === '12px',
            )
            evidence.observations.push({
              kind,
              interactive,
              state: 'focus',
              selected: await read(handle),
            })
            await handle.hover()
            await page.mouse.down()
            await page.waitForFunction(
              () =>
                getComputedStyle(document.querySelector('.owner-handle')).backgroundColor ===
                'rgb(255, 0, 0)',
            )
            evidence.observations.push({
              kind,
              interactive,
              state: 'pressed',
              selected: await read(handle),
            })
            await page.mouse.up()
            await page.waitForFunction(
              () => document.querySelector('[role=dialog]').style.transform === 'translateY(50%)',
            )
            assert.equal(await handle.evaluate((node) => node === window.ownerBefore), true)
          }
          await page.evaluate(() => window.setOpen(false))
          await page.getByRole('dialog', { name: 'Owner evidence' }).waitFor({ state: 'detached' })
          await page.evaluate(() => window.setOpen(true))
          await page.getByRole('dialog', { name: 'Owner evidence' }).waitFor()
          await page.mouse.move(800, 650)
          await page.getByRole('button', { name: 'Content', exact: true }).focus()
          // Negative control: removing this exact candidate sheet must be seen.
          const before = await read(handle)
          await page.locator('style[data-candidates]').evaluate((node) => node.remove())
          assert.notDeepEqual(
            await read(handle),
            before,
            'an absent stylesheet must not certify delivery',
          )
        }
        const rows = evidence.observations.filter((row) => row.interactive === interactive)
        assert.deepEqual(
          rows
            .filter((row) => row.kind === 'candidate')
            .map(({ state, selected }) => ({ state, selected })),
          rows
            .filter((row) => row.kind === 'tailwind')
            .map(({ state, selected }) => ({ state, selected })),
        )
      } finally {
        for (const page of pages) await page.close()
      }
    }
    assert.deepEqual(errors, [])
    assert.equal(evidence.observations.length, 10)
    evidence.passed = true
  } catch (error) {
    evidence.error = String(error)
    throw error
  } finally {
    await browser?.close()
    mkdirSync(path.dirname(destination), { recursive: true })
    writeFileSync(destination, `${JSON.stringify(evidence, null, 2)}\n`)
  }
})

async function read(handle) {
  return handle.evaluate((node) => {
    const style = getComputedStyle(node)
    return {
      paddingTop: style.paddingTop,
      width: style.width,
      opacity: style.opacity,
      backgroundColor: style.backgroundColor,
    }
  })
}
