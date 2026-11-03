import assert from 'node:assert/strict'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { chromium } from 'playwright-core'
import { evidenceSource } from '../../../scripts/style-slots/evidence-source.mjs'
import { handleRoot } from '../../../scripts/style-slots/handle-publication.mjs'
import { prepareWebHandle } from '../../../scripts/style-slots/handle-web.mjs'
import {
  prepareWebHandleInputPublication,
  prepareWebHandlePublication,
} from '../../../scripts/style-slots/handle-web-publication.mjs'
import {
  handleInputCases,
  handleInputClasses,
} from '../../../scripts/style-slots/owner-input-cases.mjs'

const executablePath = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((file) => file && existsSync(file))
if (process.env.CI) assert.ok(executablePath, 'CI requires real owner-handle browser evidence')

test('handle Web oracle and candidate fixture include the actual state selectors', async () => {
  const fixture = await prepareWebHandle()
  const prepared = await prepareWebHandlePublication()
  assert.ok(fixture.candidateCss.length && fixture.oracleCss.length)
  for (const css of [fixture.candidateCss, fixture.oracleCss, prepared.css]) {
    assert.match(css, /hover/)
    assert.match(css, /focus/)
    assert.match(css, /active/)
  }
  const bundle = await lifetimeBundle(fixture.rest)
  assert.equal(bundle.outputFiles.length, 1)
  assert.ok(
    Object.keys(bundle.metafile.inputs).some((file) =>
      file.endsWith('patterns/dist/bottom-sheet.js'),
    ),
  )
  const preparedBundle = await stateBundle(fixture, prepared.code)
  const lifetime = await prepareWebHandlePublication(true)
  const lifetimePreparedBundle = await lifetimeBundle(fixture.rest, lifetime.code)
  const inputs = await prepareWebHandleInputPublication()
  const inputPreparedBundle = await inputBundle(inputs.code)
  for (const output of [preparedBundle, lifetimePreparedBundle, inputPreparedBundle]) {
    assert.ok(
      Object.keys(output.metafile.inputs).some((file) =>
        file.endsWith('patterns/dist/bottom-sheet.js'),
      ),
    )
    assert.ok(
      !Object.keys(output.metafile.inputs).some((file) =>
        /packages\/(compiler|tailwind)\//.test(file.replaceAll('\\', '/')),
      ),
    )
  }
})

async function inputBundle(prepared) {
  return build({
    stdin: {
      contents: `${prepared ?? "import {BottomSheet} from '@hozo/patterns';"}
import {BottomSheet as RawHandle, HozoBottomSheet as RawHandleAlias} from '@hozo/patterns';
window.handleAliasesSameOwner = RawHandle === RawHandleAlias;
import {handleInputCases} from '../../scripts/style-slots/owner-input-cases.mjs';
import {useState} from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
function App(){const [detents,setDetents]=useState();window.setInput=at=>flushSync(()=>setDetents(handleInputCases[at].detents));return <${prepared ? 'HandleInputFixture' : 'BottomSheet'} detents={detents} ${prepared ? '' : `open portal={false} accessibilityLabel="Input evidence" sheetClassName="input-panel" handleStyle={{rowGap:16,columnGap:16}} handleClassName={${JSON.stringify(handleInputClasses)}}`}><button>Body</button></${prepared ? 'HandleInputFixture' : 'BottomSheet'}>}
flushSync(()=>createRoot(document.querySelector('#root')).render(<App/>));`,
      resolveDir: fileURLToPath(new URL('../', import.meta.url)),
      loader: 'tsx',
    },
    bundle: true,
    write: false,
    metafile: true,
    minify: true,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
  })
}

test('real Web handle delivery follows normalized live detents on the actual Owner', {
  skip: !executablePath,
}, async () => {
  const evidence = {
    schema: 1,
    ...evidenceSource(),
    passed: false,
    scope: 'web-handle-normalized-live-inputs',
    observations: [],
    controls: [],
    prepared: null,
    aliasesSameOwner: false,
  }
  let browser
  try {
    const fixture = await prepareWebHandle()
    const prepared = await prepareWebHandleInputPublication()
    const { code: _code, css: _css, ...provenance } = prepared
    evidence.prepared = provenance
    const opaque = await inputBundle()
    const compiled = await inputBundle(prepared.code)
    browser = await chromium.launch({ executablePath, args: ['--no-sandbox', '--disable-gpu'] })
    const errors = []
    for (const [kind, css, app] of [
      ['candidate', fixture.candidateCss, opaque],
      ['tailwind', fixture.oracleCss, opaque],
      ['prepared', prepared.css, compiled],
    ]) {
      const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
      page.on('pageerror', (error) => errors.push(error.message))
      try {
        await page.setContent(
          `<style>@layer base{button{border:0 solid;box-sizing:border-box}}</style><style data-candidates>${css}</style><div id="root"></div>`,
        )
        await page.addScriptTag({ content: app.outputFiles[0].text })
        assert.equal(await page.evaluate(() => window.handleAliasesSameOwner), true)
        await page.mouse.move(800, 650)
        let previousShape = false
        for (const [at, input] of handleInputCases.entries()) {
          const actual = await page.evaluate((at) => {
            const before = document.querySelector('.input-panel > :first-child')
            window.setInput(at)
            const node = document.querySelector('.input-panel > :first-child')
            const style = getComputedStyle(node)
            const rgb = style.backgroundColor.match(/\d+/g).slice(0, 3)
            return {
              sameHost: node === before,
              selected: {
                host: node.tagName,
                padding: Number.parseFloat(style.paddingTop),
                opacity: Number(style.opacity),
                rowGap: Number.parseFloat(style.rowGap),
                columnGap: Number.parseFloat(style.columnGap),
                background: `#${rgb.map((value) => Number(value).toString(16).padStart(2, '0')).join('')}`,
              },
            }
          }, at)
          assert.equal(
            actual.sameHost,
            previousShape === input.interactive,
            `${kind}/${input.id}: host lifetime`,
          )
          assert.deepEqual(actual.selected, {
            host: input.interactive ? 'BUTTON' : 'DIV',
            padding: 8,
            opacity: 1,
            rowGap: 16,
            columnGap: 16,
            background: '#ffffff',
          })
          evidence.observations.push({ kind, input: input.id, ...actual })
          previousShape = input.interactive
        }
        const owner = page.locator('.input-panel > :first-child')
        const before = await read(owner)
        await page.locator('style[data-candidates]').evaluate((node) => node.remove())
        assert.notDeepEqual(
          await read(owner),
          before,
          'missing stylesheet must invalidate the probe',
        )
        evidence.controls.push({ kind, absentStylesheetDetected: true })
      } finally {
        await page.close()
      }
    }
    assert.deepEqual(errors, [])
    assert.equal(evidence.observations.length, 27)
    assert.equal(evidence.controls.length, 3)
    evidence.aliasesSameOwner = true
    evidence.passed = true
  } catch (error) {
    evidence.error = String(error)
    throw error
  } finally {
    await browser?.close()
    const destination = path.join(
      handleRoot,
      'artifacts/style-fact-model/handle-inputs-browser.json',
    )
    mkdirSync(path.dirname(destination), { recursive: true })
    writeFileSync(destination, `${JSON.stringify(evidence, null, 2)}\n`)
  }
})

async function lifetimeBundle(classes, prepared) {
  return build({
    stdin: {
      contents: `${prepared ?? "import {BottomSheet} from '@hozo/patterns';"}
import {useState} from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
function App({interactive}) {const [open,setOpen]=useState(false);window.show=(value)=>flushSync(()=>setOpen(value));
return <${prepared ? 'HandleFixture' : 'BottomSheet'} open={open} ${prepared ? 'interactive={interactive}' : `portal={false} detents={interactive?[.5,1]:[1]} handleClassName={${JSON.stringify(classes)}}`} accessibilityLabel="Lifetime evidence" sheetClassName="lifetime-panel"><button>Body</button></${prepared ? 'HandleFixture' : 'BottomSheet'}>}
window.mount=(interactive)=>{window.fixtureRoot=createRoot(document.querySelector('#root'));flushSync(()=>fixtureRoot.render(<App interactive={interactive}/>))};
window.finishExit=()=>flushSync(()=>document.querySelector('.lifetime-panel').dispatchEvent(new TransitionEvent('transitionend',{bubbles:true,propertyName:'transform'})));`,
      resolveDir: fileURLToPath(new URL('../', import.meta.url)),
      loader: 'tsx',
    },
    bundle: true,
    write: false,
    metafile: true,
    minify: true,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
  })
}

async function stateBundle(fixture, prepared) {
  return build({
    stdin: {
      contents: `${prepared ?? "import {BottomSheet} from '@hozo/patterns';"}
import {useState} from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
function App({interactive}) {const [open,setOpen]=useState(true);const [tick,setTick]=useState(0);const [author,setAuthor]=useState();window.setAuthor=value=>flushSync(()=>setAuthor(value));window.setOpen=setOpen;window.bump=()=>setTick(x=>x+1);
return <${prepared ? 'HandleFixture' : 'BottomSheet'} open={open} onClose={()=>setOpen(false)} handleStyle={author} ${prepared ? 'interactive={interactive}' : `portal={false} detents={interactive?[.5,1]:[1]} handleClassName={interactive?${JSON.stringify(fixture.interactive)}:${JSON.stringify(fixture.rest)}}`} accessibilityLabel="Owner evidence" sheetClassName="owner-panel"><button>Content</button><span>{tick}</span></${prepared ? 'HandleFixture' : 'BottomSheet'}>}
window.mount=(interactive)=>{window.fixtureRoot=createRoot(document.querySelector('#root'));fixtureRoot.render(<App interactive={interactive}/>)};`,
      resolveDir: fileURLToPath(new URL('../', import.meta.url)),
      loader: 'tsx',
    },
    bundle: true,
    write: false,
    metafile: true,
    minify: true,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
  })
}

test('real Web handle computed rest/hover/focus/pressed styles match Tailwind on each actual host', {
  skip: !executablePath,
}, async () => {
  const evidence = {
    schema: 1,
    ...evidenceSource(),
    passed: false,
    scope: 'web-computed-style-real-pointer-focus',
    observations: [],
    authorObservations: [],
    controls: [],
    prepared: null,
  }
  const destination = path.join(handleRoot, 'artifacts/style-fact-model/handle-browser.json')
  let browser
  try {
    const fixture = await prepareWebHandle()
    const prepared = await prepareWebHandlePublication()
    evidence.prepared = {
      identity: prepared.identity,
      fingerprint: prepared.fingerprint,
      preparations: prepared.preparations,
      ordinaryParses: prepared.ordinaryParses,
      delivery: prepared.delivery,
    }
    const bundle = await stateBundle(fixture)
    const instanceBundle = await stateBundle(fixture, prepared.code)
    browser = await chromium.launch({ executablePath, args: ['--no-sandbox', '--disable-gpu'] })
    const errors = []
    for (const interactive of [false, true]) {
      const pages = []
      try {
        for (const [kind, css, app] of [
          ['candidate', fixture.candidateCss, bundle],
          ['tailwind', fixture.oracleCss, bundle],
          ['prepared', prepared.css, instanceBundle],
        ]) {
          const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
          pages.push(page)
          page.on('pageerror', (error) => errors.push(error.message))
          // Normalize the UA border on both subjects, as preflight does.
          // Padding32 + border4 otherwise forces used width36 despite width32.
          await page.setContent(
            `<style>.owner-panel{width:300px;height:400px}.owner-panel > :first-child{border:0;box-sizing:border-box}</style><style data-candidates>${css}</style><div id="root"></div>`,
          )
          await page.addScriptTag({ content: app.outputFiles[0].text })
          await page.evaluate((value) => window.mount(value), interactive)
          await page.getByRole('dialog', { name: 'Owner evidence' }).waitFor()
          const handle = page.locator('.owner-panel > :first-child')
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
            () => !document.querySelector('.owner-panel > :first-child').matches(':focus'),
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
              () =>
                getComputedStyle(document.querySelector('.owner-panel > :first-child')).opacity ===
                '0.5',
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
              () =>
                getComputedStyle(document.querySelector('.owner-panel > :first-child'))
                  .paddingTop === '12px',
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
                getComputedStyle(document.querySelector('.owner-panel > :first-child'))
                  .backgroundColor === 'rgb(255, 0, 0)',
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
          const beforeAuthor = await read(handle)
          evidence.authorObservations.push({
            kind,
            interactive,
            phase: 'before-author',
            selected: beforeAuthor,
          })
          await page.evaluate(() =>
            window.setAuthor({ paddingTop: 20, opacity: 0.8, backgroundColor: '#abcdef' }),
          )
          const withAuthor = await read(handle)
          assert.deepEqual(withAuthor, {
            ...beforeAuthor,
            paddingTop: '20px',
            opacity: '0.8',
            backgroundColor: 'rgb(171, 205, 239)',
          })
          assert.equal(await handle.evaluate((node) => node === window.ownerBefore), true)
          assert.equal(await handle.evaluate((node) => getComputedStyle(node).touchAction), 'none')
          evidence.authorObservations.push({
            kind,
            interactive,
            phase: 'with-author',
            selected: withAuthor,
          })
          await page.mouse.move(800, 650)
          await page.getByRole('button', { name: 'Content', exact: true }).focus()
          assert.deepEqual(
            await read(handle),
            withAuthor,
            'author box styles survive losing hover/focus',
          )
          evidence.authorObservations.push({
            kind,
            interactive,
            phase: 'with-author-rest',
            selected: await read(handle),
          })
          await page.evaluate(() => window.setAuthor(undefined))
          const afterAuthor = await read(handle)
          assert.deepEqual(
            afterAuthor,
            rest,
            'removing author styles restores the new current state, not the earlier focus snapshot',
          )
          assert.equal(await handle.evaluate((node) => node === window.ownerBefore), true)
          evidence.authorObservations.push({
            kind,
            interactive,
            phase: 'after-removal',
            selected: afterAuthor,
          })
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
          evidence.controls.push({ kind, interactive, absentStylesheetDetected: true })
        }
        const rows = evidence.observations.filter((row) => row.interactive === interactive)
        assert.deepEqual(
          rows
            .filter((row) => row.kind === 'prepared')
            .map(({ state, selected }) => ({ state, selected })),
          rows
            .filter((row) => row.kind === 'tailwind')
            .map(({ state, selected }) => ({ state, selected })),
        )
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
    assert.equal(evidence.observations.length, 15)
    assert.equal(evidence.authorObservations.length, 24)
    for (const kind of ['candidate', 'prepared'])
      assert.deepEqual(
        evidence.authorObservations
          .filter((row) => row.kind === kind)
          .map(({ kind, ...row }) => row),
        evidence.authorObservations
          .filter((row) => row.kind === 'tailwind')
          .map(({ kind, ...row }) => row),
      )
    assert.equal(evidence.controls.length, 6)
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

test('real Web handle styles follow owner presence rather than the open request', {
  skip: !executablePath,
}, async () => {
  const evidence = {
    schema: 1,
    ...evidenceSource(),
    passed: false,
    scope: 'web-owner-presence-controlled-clock',
    observations: [],
    earlyExitControls: [],
    prepared: null,
  }
  const destination = path.join(
    handleRoot,
    'artifacts/style-fact-model/handle-browser-lifetime.json',
  )
  let browser
  try {
    const fixture = await prepareWebHandle()
    const prepared = await prepareWebHandlePublication(true)
    evidence.prepared = {
      identity: prepared.identity,
      fingerprint: prepared.fingerprint,
      preparations: prepared.preparations,
      ordinaryParses: prepared.ordinaryParses,
      delivery: prepared.delivery,
    }
    const bundle = await lifetimeBundle(fixture.rest)
    const instanceBundle = await lifetimeBundle(fixture.rest, prepared.code)
    browser = await chromium.launch({ executablePath, args: ['--no-sandbox', '--disable-gpu'] })
    const errors = []
    for (const interactive of [false, true]) {
      for (const [kind, css, app] of [
        ['candidate', fixture.candidateCss, bundle],
        ['tailwind', fixture.oracleCss, bundle],
        ['prepared', prepared.css, instanceBundle],
      ]) {
        const page = await browser.newPage()
        page.on('pageerror', (error) => errors.push(error.message))
        try {
          await page.clock.install()
          await page.setContent(
            `<style>.lifetime-panel{width:300px;height:400px;transition:transform 1s linear}.lifetime-panel[data-state=closed]{transform:translateY(100%) !important}.lifetime-panel > :first-child{border:0;box-sizing:border-box}</style><style>${css}</style><div id="root"></div>`,
          )
          await page.addScriptTag({ content: app.outputFiles[0].text })
          await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000))
          await page.evaluate((value) => window.mount(value), interactive)
          const record = async (phase) => {
            const selected = await page.evaluate(() => {
              const handle = document.querySelector('.lifetime-panel > :first-child')
              if (!handle) return null
              const style = getComputedStyle(handle)
              const panel = document.querySelector('.lifetime-panel')
              const leaving = handle.closest('[inert]')
              return {
                tag: handle.tagName,
                state: panel.dataset.state,
                sameHost: handle === window.ownerBefore,
                inert: !!leaving,
                pointerEvents: leaving ? getComputedStyle(leaving).pointerEvents : null,
                style: {
                  paddingTop: style.paddingTop,
                  width: style.width,
                  opacity: style.opacity,
                  backgroundColor: style.backgroundColor,
                },
              }
            })
            evidence.observations.push({ kind, interactive, phase, selected })
            return selected
          }
          assert.equal(await record('initial-hidden'), null)
          await page.evaluate(() => window.show(true))
          await page.locator('.lifetime-panel > :first-child').waitFor({ state: 'attached' })
          await page.evaluate(() => {
            window.ownerBefore = document.querySelector('.lifetime-panel > :first-child')
          })
          const opened = await record('open')
          assert.deepEqual(opened, {
            tag: interactive ? 'BUTTON' : 'DIV',
            state: 'open',
            sameHost: true,
            inert: false,
            pointerEvents: null,
            style: {
              paddingTop: '16px',
              width: '32px',
              opacity: '1',
              backgroundColor: 'rgb(34, 51, 68)',
            },
          })
          await page.evaluate(() => window.show(false))
          assert.deepEqual(await record('exiting'), {
            ...opened,
            state: 'closed',
            inert: true,
            pointerEvents: 'none',
          })
          // The real hook rejects an early completion event. Advance only the
          // JS clock, then complete explicitly before its 100ms fallback timer.
          // This proves DOM/style lifetime, not physical animation smoothness.
          await page.evaluate(() => window.finishExit())
          assert.equal(await page.locator('.lifetime-panel > :first-child').count(), 1)
          evidence.earlyExitControls.push({ kind, interactive, retained: true })
          await page.clock.runFor(1000)
          await page.evaluate(() => window.finishExit())
          assert.equal(await record('absent'), null)
          await page.evaluate(() => window.show(true))
          await page.locator('.lifetime-panel > :first-child').waitFor({ state: 'attached' })
          assert.deepEqual(await record('reopened'), { ...opened, sameHost: false })
        } finally {
          await page.close()
        }
      }
      const rows = evidence.observations.filter((row) => row.interactive === interactive)
      assert.deepEqual(
        rows
          .filter((row) => row.kind === 'prepared')
          .map(({ phase, selected }) => ({ phase, selected })),
        rows
          .filter((row) => row.kind === 'tailwind')
          .map(({ phase, selected }) => ({ phase, selected })),
      )
      assert.deepEqual(
        rows
          .filter((row) => row.kind === 'candidate')
          .map(({ phase, selected }) => ({ phase, selected })),
        rows
          .filter((row) => row.kind === 'tailwind')
          .map(({ phase, selected }) => ({ phase, selected })),
      )
    }
    assert.deepEqual(errors, [])
    assert.equal(evidence.observations.length, 30)
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
