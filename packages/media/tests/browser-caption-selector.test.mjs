import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { chromium } from 'playwright-core'

const executablePath = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((candidate) => candidate && existsSync(candidate))

test('browser caption radios use trusted keyboard actions, skip disabled tracks and keep groups independent', async (t) => {
  if (!executablePath) {
    if (process.env.CI) throw new Error('Caption keyboard checks require Chrome; set CHROME_PATH')
    t.skip('Chrome not installed; no browser keyboard evidence')
    return
  }
  const result = await build({
    stdin: {
      contents: `
        import React, {useState} from 'react'
        import {createRoot} from 'react-dom/client'
        import {MediaCaptionSelector, MediaCaptions} from './src/captions-index.ts'
        window.requests = []
        const options = [{id:'en',label:'English'}, {id:'fr',label:'French',disabled:true}, {id:'ja',label:'日本語'}]
        const status = {src:'clip',status:'ready',playing:false,buffering:false,currentTime:1,duration:4,error:null}
        function App() {
          const [value, set] = useState('en')
          const [disabled, configure] = useState(false)
          const [reversed, reorder] = useState(false)
          window.configure = configure; window.reorder = reorder
          return <>
            <button>Before</button>
            <MediaCaptionSelector options={reversed ? [...options].reverse() : options} value={value}
              disabled={disabled} onValueChange={v => {window.requests.push(v);set(v)}} />
            <MediaCaptions src="clip" status={status} enabled={value !== null} accessibilityLabel="Media captions"
              cues={[{start:0,end:2,text:value === 'ja' ? '日本語の字幕' : 'English caption'}]} />
            <MediaCaptionSelector options={options} value="en" onValueChange={v => window.requests.push('second:'+v)}
              accessibilityLabel="Other recording" />
            <button>After</button>
          </>
        }
        createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>)`,
      resolveDir: fileURLToPath(new URL('../', import.meta.url)),
      sourcefile: 'caption-browser-fixture.tsx',
      loader: 'tsx',
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    metafile: true,
  })
  assert.equal(
    Object.keys(result.metafile.inputs).some((file) => /expo-|react-native/.test(file)),
    false,
  )
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', request.url === '/app.js' ? 'text/javascript' : 'text/html')
    response.end(
      request.url === '/app.js'
        ? result.outputFiles[0].contents
        : '<!doctype html><div id="root"></div><script src="/app.js"></script>',
    )
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  let browser
  try {
    browser = await chromium.launch({ executablePath, headless: true })
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`http://127.0.0.1:${server.address().port}`)
    const group = page.getByRole('group', { name: 'Caption language', exact: true })
    const english = group.getByRole('radio', { name: 'English', exact: true })
    const japanese = group.getByRole('radio', { name: '日本語', exact: true })
    const off = group.getByRole('radio', { name: 'Captions off', exact: true })
    const otherEnglish = page
      .getByRole('group', { name: 'Other recording' })
      .getByRole('radio', { name: 'English' })
    await page.getByRole('button', { name: 'Before', exact: true }).focus()
    await page.keyboard.press('Tab')
    assert.equal(await english.evaluate((node) => node === document.activeElement), true)
    await page.keyboard.press('ArrowRight')
    assert.equal(await japanese.isChecked(), true, 'browser arrows skip disabled French')
    assert.equal(await otherEnglish.isChecked(), true)
    assert.equal(
      await page.getByRole('group', { name: 'Media captions', exact: true }).textContent(),
      '日本語の字幕',
    )
    await page.keyboard.press('ArrowRight')
    assert.equal(await off.isChecked(), true, 'browser wraps to Off')
    assert.equal(await page.getByRole('group', { name: 'Media captions', exact: true }).count(), 0)
    await english.focus()
    await page.keyboard.press('Space')
    assert.equal(await english.isChecked(), true)
    await page.keyboard.press('Space')
    assert.deepEqual(await page.evaluate(() => window.requests), ['ja', null, 'en'])
    await page.evaluate(() => {
      window.englishHost = document.querySelector('input[value=en]')
      window.reorder(true)
    })
    await page.waitForFunction(() => document.querySelectorAll('fieldset input')[1].value === 'ja')
    assert.equal(
      await english.evaluate(
        (node) => node === window.englishHost && node === document.activeElement,
      ),
      true,
    )
    await page.evaluate(() => window.configure(true))
    await page.waitForFunction(() => document.querySelector('input').disabled)
    assert.equal(await english.isChecked(), true)
    assert.equal(await group.getByRole('radio', { name: 'French' }).isEnabled(), false)
    assert.deepEqual(await page.evaluate(() => window.requests), ['ja', null, 'en'])
    assert.deepEqual(errors, [])
  } finally {
    await browser?.close()
    await new Promise((resolve) => server.close(resolve))
  }
})
