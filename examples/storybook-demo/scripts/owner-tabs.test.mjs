import assert from 'node:assert/strict'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { chromium } from 'playwright-core'
import { evidenceSource } from '../../../scripts/style-slots/evidence-source.mjs'
import {
  expectedIdleTabInputs,
  expectedTabContainer,
  expectedTabLabels,
  expectedTabModality,
  tabContainerCases,
  tabInputCases,
  tabLabelCases,
  tabModalityCases,
} from '../../../scripts/style-slots/owner-input-cases.mjs'
import {
  expectedTabRows,
  prepareTabsProbe,
  tabLabelClasses,
  tabPhases,
  tabsProbeRoot,
} from '../../../scripts/style-slots/tabs-probe.mjs'
import { prepareWebTabsPublication } from '../../../scripts/style-slots/tabs-web-publication.mjs'

const executablePath = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((file) => file && existsSync(file))
if (process.env.CI) assert.ok(executablePath, 'CI requires real Tabs browser evidence')

async function appBundle(classes, prepared) {
  return build({
    stdin: {
      contents: `${prepared ?? "import {Tabs} from '@hozo/patterns';"}
import {useState} from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
import {Tabs as RawAuditTabs,HozoTabs as RawAuditAlias} from '@hozo/patterns';window.aliasesSameOwner=RawAuditTabs===RawAuditAlias;
window.changes=[];
const containers={array:['before',0,'after'],'nested-array':['before',[0,-7],'after'],fragment:<>before{0}after</>,'nested-fragment':<>before<>{[0,-7]}</><div data-testid="opaque-label-leaf" style={{opacity:.7}}/>after</>};
window.setContainer=id=>window.setInput({tabs:[{label:'A',content:'one'},{label:containers[id],content:'two'},{label:'C',content:'three'}],index:1});
function App(){const [index,setIndex]=useState(0);const [items,setItems]=useState([{label:'A',content:'one'},{label:'B',content:'two'},{label:'C',content:'three',disabled:true}]);const [author,setAuthor]=useState();window.setInput=input=>flushSync(()=>{setItems(input.tabs);setIndex(input.index)});window.setAuthor=value=>flushSync(()=>setAuthor(value));window.select=at=>flushSync(()=>setIndex(at));return <${prepared ? 'TabsFixture' : 'Tabs'} index={index} tabStyle={author} onIndexChange={at=>{changes.push(at);setIndex(at)}} ${prepared ? '' : `tabClassName={${JSON.stringify(classes)}}`} tabs={items}/>}
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

test('Tabs evidence prepares independent CSS and bundles the actual Web owner', async () => {
  const fixture = await prepareTabsProbe([], tabLabelClasses)
  assert.ok(fixture.candidateCss.length && fixture.oracleCss.length && fixture.native.length)
  assert.ok(fixture.fingerprint)
  const bundle = await appBundle(fixture.classes)
  assert.ok(
    Object.keys(bundle.metafile.inputs).some((file) => file.endsWith('patterns/dist/tabs.js')),
  )
  assert.equal(bundle.outputFiles.length, 1)
  const prepared = await prepareWebTabsPublication()
  const instanceBundle = await appBundle(fixture.classes, prepared.code)
  assert.ok(prepared.fingerprint && prepared.css)
  assert.ok(
    Object.keys(instanceBundle.metafile.inputs).some((file) =>
      file.endsWith('patterns/dist/tabs.js'),
    ),
  )
  assert.ok(
    !Object.keys(instanceBundle.metafile.inputs).some((file) =>
      /packages\/(compiler|tailwind)\//.test(file.replaceAll('\\', '/')),
    ),
  )
})

test('real Web candidate and instance-prepared tabs match Tailwind across owner states and label styles', {
  skip: !executablePath,
  timeout: 60_000,
}, async () => {
  const evidence = {
    schema: 1,
    ...evidenceSource(),
    passed: false,
    scope: 'web-tabs-real-pointer-focus',
    fingerprint: '',
    observations: [],
    authorObservations: [],
    inputObservations: [],
    modalityObservations: [],
    labelObservations: [],
    containerObservations: [],
    aliasesSameOwner: false,
    controls: [],
    prepared: null,
  }
  const destination = path.join(tabsProbeRoot, 'artifacts/style-fact-model/tabs-browser.json')
  let browser
  try {
    const fixture = await prepareTabsProbe([], tabLabelClasses)
    const prepared = await prepareWebTabsPublication()
    evidence.prepared = {
      identity: prepared.identity,
      fingerprint: prepared.fingerprint,
      preparations: prepared.preparations,
      ordinaryParses: prepared.ordinaryParses,
      delivery: prepared.delivery,
    }
    evidence.fingerprint = fixture.fingerprint
    const bundle = await appBundle(fixture.classes)
    const instanceBundle = await appBundle(fixture.classes, prepared.code)
    browser = await chromium.launch({ executablePath, args: ['--no-sandbox', '--disable-gpu'] })
    const errors = []
    for (const [kind, css, app] of [
      ['candidate', fixture.candidateCss, bundle],
      ['tailwind', fixture.oracleCss, bundle],
      ['prepared', prepared.css, instanceBundle],
    ]) {
      const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
      page.on('pageerror', (error) => errors.push(error.message))
      try {
        // Match preflight's layer as well as its solid-border baseline. An
        // unlayered border reset would outrank the candidate utilities' layer.
        // Keep width 3 as the expectation, rather than accepting zero.
        // Used width/height are not authored auto values.
        // Labels A/B/C have natural dimensions strictly below the test's 96/80.
        await page.setContent(
          `<style>@layer base{button{border:0 solid;box-sizing:border-box;font:16px/20px sans-serif}}</style><style>${css}</style><div id="root"></div>`,
        )
        await page.addScriptTag({ content: app.outputFiles[0].text })
        assert.equal(await page.evaluate(() => window.aliasesSameOwner), true)
        evidence.aliasesSameOwner = true
        const tabs = page.getByRole('tab')
        assert.equal(await tabs.count(), 3)
        await page.evaluate(() => {
          window.originalTabs = [...document.querySelectorAll('[role=tab]')]
        })
        const record = async (phase) => {
          const selected = await tabs.evaluateAll((nodes) =>
            nodes.map((node, at) => {
              if (node !== window.originalTabs[at]) throw new Error('Tab owner identity changed')
              const style = getComputedStyle(node)
              const rgb = style.backgroundColor.match(/\d+/g).slice(0, 3)
              return {
                selected: node.getAttribute('aria-selected') === 'true',
                disabled: node.disabled,
                padding: Number.parseFloat(style.paddingTop),
                background: `#${rgb.map((value) => Number(value).toString(16).padStart(2, '0')).join('')}`,
                opacity: Number(style.opacity),
                border: Number.parseFloat(style.borderTopWidth),
                radius: Number.parseFloat(style.borderTopLeftRadius),
                width: style.width === '96px' ? 96 : null,
                height: style.height === '80px' ? 80 : null,
                color: style.color,
                fontSize: Number.parseFloat(style.fontSize),
                fontWeight: style.fontWeight,
                letterSpacing: Number.parseFloat(style.letterSpacing) || 0,
                rowGap: Number.parseFloat(style.rowGap),
                columnGap: Number.parseFloat(style.columnGap),
              }
            }),
          )
          evidence.observations.push({ kind, phase, selected })
          assert.deepEqual(
            selected,
            expectedTabRows(phase).map((row, at) => ({
              ...row,
              color: row.selected ? 'rgb(68, 85, 102)' : 'rgb(51, 68, 85)',
              fontSize: 18,
              fontWeight: row.disabled ? '700' : '400',
              letterSpacing: at === 1 && phase !== 'initial' ? 1 : 0,
              rowGap: 3,
              columnGap: 2,
            })),
          )
        }
        await page.mouse.move(800, 650)
        await record(tabPhases[0])
        await tabs.nth(1).hover()
        await record(tabPhases[1])
        await tabs.nth(1).focus()
        await record(tabPhases[2])
        await page.mouse.down()
        await record(tabPhases[3])
        await page.mouse.up()
        await page.waitForFunction(
          () => document.querySelectorAll('[role=tab]')[1].getAttribute('aria-selected') === 'true',
        )
        await record(tabPhases[4])
        assert.deepEqual(await page.evaluate(() => window.changes), [1])
        await page.evaluate(() => window.select(2))
        await record(tabPhases[5])
        await tabs.nth(2).evaluate((node) => {
          node.focus()
          node.click()
        })
        assert.equal(await tabs.nth(1).evaluate((node) => node === document.activeElement), true)
        assert.deepEqual(await page.evaluate(() => window.changes), [1])
        const recordAuthor = async (phase, overridden) => {
          const rows = await tabs.evaluateAll((nodes) =>
            nodes.map((node, at) => {
              if (node !== window.originalTabs[at]) throw new Error('author style remounted a tab')
              const style = getComputedStyle(node)
              const rgb = style.backgroundColor.match(/\d+/g).slice(0, 3)
              return {
                rowGap: Number.parseFloat(style.rowGap),
                columnGap: Number.parseFloat(style.columnGap),
                background: `#${rgb.map((value) => Number(value).toString(16).padStart(2, '0')).join('')}`,
                opacity: Number(style.opacity),
              }
            }),
          )
          assert.deepEqual(
            rows,
            expectedTabRows('selected-disabled').map((row) => ({
              rowGap: overridden ? 5 : 3,
              columnGap: overridden ? 7 : 2,
              background: overridden ? '#abcdef' : row.background,
              opacity: overridden ? 0.8 : row.opacity,
            })),
          )
          evidence.authorObservations.push({ kind, phase, rows })
        }
        // Match the same common box values as the existing Native author
        // gate, including removal while the selected owner is disabled.
        await recordAuthor('before-author', false)
        await page.evaluate(() =>
          window.setAuthor({ rowGap: 5, columnGap: 7, backgroundColor: '#abcdef', opacity: 0.8 }),
        )
        await recordAuthor('with-author', true)
        await page.evaluate(() => window.select(0))
        assert.equal(await tabs.nth(0).getAttribute('aria-selected'), 'true')
        await recordAuthor('with-author-selected-enabled', true)
        await page.evaluate(() => window.select(2))
        await page.evaluate(() => window.setAuthor(undefined))
        await recordAuthor('after-removal', false)
        await page.mouse.move(800, 650)
        await tabs.nth(1).evaluate((node) => node.blur())
        for (const input of tabInputCases) {
          await page.evaluate((input) => {
            window.previousTabs = [...document.querySelectorAll('[role=tab]')]
            window.setInput(input)
          }, input)
          const rows = await tabs.evaluateAll((nodes) =>
            nodes.map((node, at) => {
              if (at < window.previousTabs.length && node !== window.previousTabs[at])
                throw new Error('live input replaced a retained positional Owner')
              const style = getComputedStyle(node)
              const hex = (value) =>
                `#${value
                  .match(/\d+/g)
                  .slice(0, 3)
                  .map((part) => Number(part).toString(16).padStart(2, '0'))
                  .join('')}`
              return {
                label: node.textContent,
                selected: node.getAttribute('aria-selected') === 'true',
                disabled: node.disabled,
                padding: Number.parseFloat(style.paddingTop),
                background: hex(style.backgroundColor),
                opacity: Number(style.opacity),
                border: Number.parseFloat(style.borderTopWidth),
                color: hex(style.color),
                size: Number.parseFloat(style.fontSize),
                weight: style.fontWeight,
                spacing: Number.parseFloat(style.letterSpacing) || 0,
              }
            }),
          )
          assert.deepEqual(rows, expectedIdleTabInputs(input), `${kind}: ${input.id}`)
          const changes = await page.evaluate(() => window.changes.length)
          await tabs.evaluateAll((nodes) => {
            for (const node of nodes) if (node.disabled) node.click()
          })
          assert.equal(await page.evaluate(() => window.changes.length), changes)
          evidence.inputObservations.push({ kind, input: input.id, rows })
        }
        const recordModality = async (at) => {
          const input = tabModalityCases[at]
          const rows = await tabs.evaluateAll((nodes) =>
            nodes.map((node) => {
              const style = getComputedStyle(node)
              return {
                width: style.width === '96px' ? 96 : null,
                bottom: Number.parseFloat(style.borderBottomWidth),
                decoration: style.textDecorationLine,
              }
            }),
          )
          const visible = await tabs.nth(1).evaluate((node) => node.matches(':focus-visible'))
          // Selectors permits UA heuristics. Chrome retains indication when
          // clicking the already keyboard-focused button; Native deliberately
          // clears it (also asserted by primitive/Chip tests). Keep that case,
          // but compare CSS delivery to the UA's actual fact and report the
          // difference instead of changing either platform to fake equality.
          const uaConditioned = input.id === 'pointer-while-focused'
          assert.deepEqual(
            rows,
            expectedTabModality({ ...input, visible: uaConditioned ? visible : input.visible }),
            `${kind}: ${input.id}`,
          )
          assert.equal(
            await tabs.nth(1).evaluate((node) => node === document.activeElement),
            input.focused,
          )
          if (!uaConditioned) assert.equal(visible, input.visible)
          evidence.modalityObservations.push({ kind, input: input.id, visible, rows })
        }
        await recordModality(0)
        // Real keyboard input establishes browser modality; focus() mirrors
        // the widget's roving-focus delivery, without guessing its tab stop.
        await page.keyboard.press('Tab')
        await tabs.nth(1).focus()
        await recordModality(1)
        await tabs.nth(1).click()
        await recordModality(2)
        await page.keyboard.press('a')
        await recordModality(3)
        await tabs.nth(1).evaluate((node) => node.blur())
        await recordModality(4)
        await tabs.nth(1).click()
        await recordModality(5)
        await tabs.nth(1).evaluate((node) => node.blur())
        await page.keyboard.press('Tab')
        await tabs.nth(1).focus()
        await recordModality(6)
        await page.evaluate((input) => {
          window.setInput({ tabs: [], index: 0 })
          window.setInput(input)
        }, tabInputCases.at(-1))
        await recordModality(7)
        await page.evaluate(() => {
          window.labelOwners = [...document.querySelectorAll('[role=tab]')]
        })
        for (const input of tabLabelCases) {
          await page.evaluate(
            (input) =>
              window.setInput({
                tabs: [
                  { label: 'A', content: 'one' },
                  { label: input.label, content: 'two', disabled: input.disabled },
                  { label: 'C', content: 'three' },
                ],
                index: 1,
              }),
            input,
          )
          const rows = await tabs.evaluateAll((nodes) =>
            nodes.map((node, at) => {
              if (node !== window.labelOwners[at])
                throw new Error('label update remounted an Owner')
              const style = getComputedStyle(node)
              const rgb = style.color.match(/\d+/g).slice(0, 3)
              return {
                label: node.textContent,
                color: `#${rgb.map((value) => Number(value).toString(16).padStart(2, '0')).join('')}`,
                size: Number.parseFloat(style.fontSize),
                weight: style.fontWeight,
              }
            }),
          )
          assert.deepEqual(rows, expectedTabLabels(input), `${kind}: ${input.id}`)
          evidence.labelObservations.push({ kind, input: input.id, rows })
        }
        for (const input of tabContainerCases) {
          await page.evaluate((id) => window.setContainer(id), input.id)
          const rows = await tabs.nth(1).evaluate((node) => {
            if (node !== window.labelOwners[1])
              throw new Error('container label remounted an Owner')
            const style = getComputedStyle(node)
            const rgb = style.color.match(/\d+/g).slice(0, 3)
            return [
              {
                label: node.textContent,
                color: `#${rgb.map((value) => Number(value).toString(16).padStart(2, '0')).join('')}`,
                size: Number.parseFloat(style.fontSize),
              },
            ]
          })
          assert.deepEqual(rows, expectedTabContainer(input), `${kind}: ${input.id}`)
          if (input.id === 'nested-fragment') {
            assert.equal(await tabs.nth(1).getByTestId('opaque-label-leaf').count(), 1)
            assert.equal(
              await tabs
                .nth(1)
                .getByTestId('opaque-label-leaf')
                .evaluate((node) => getComputedStyle(node).opacity),
              '0.7',
            )
          }
          evidence.containerObservations.push({ kind, input: input.id, rows })
        }
        await page.evaluate(() =>
          window.setInput({
            tabs: [
              { label: 'A', content: 'one' },
              { label: 'B', content: 'two' },
              { label: 'C', content: 'three', disabled: true },
            ],
            index: 2,
          }),
        )
        // Without actual unavailable hooks, ARIA alone must not certify the
        // disabled: contribution. Keep aria-disabled to distinguish the two.
        await tabs.nth(2).evaluate((node) => {
          node.disabled = false
          node.removeAttribute('data-hozo-disabled')
        })
        assert.equal(await tabs.nth(2).evaluate((node) => getComputedStyle(node).opacity), '1')
        assert.equal(await tabs.nth(2).evaluate((node) => getComputedStyle(node).fontWeight), '400')
        evidence.controls.push({
          kind,
          blockedDisabledFocusAndClick: true,
          absentDisabledHooksDetected: true,
        })
      } finally {
        await page.close()
      }
    }
    assert.deepEqual(errors, [])
    assert.equal(evidence.observations.length, 18)
    assert.equal(evidence.controls.length, 3)
    assert.equal(evidence.authorObservations.length, 12)
    assert.equal(evidence.inputObservations.length, 24)
    assert.equal(evidence.modalityObservations.length, 24)
    assert.equal(evidence.labelObservations.length, 15)
    assert.equal(evidence.containerObservations.length, 12)
    for (const kind of ['candidate', 'prepared'])
      assert.deepEqual(
        evidence.authorObservations
          .filter((row) => row.kind === kind)
          .map(({ kind, ...row }) => row),
        evidence.authorObservations
          .filter((row) => row.kind === 'tailwind')
          .map(({ kind, ...row }) => row),
      )
    assert.deepEqual(
      evidence.observations
        .filter((row) => row.kind === 'prepared')
        .map(({ phase, selected }) => ({ phase, selected })),
      evidence.observations
        .filter((row) => row.kind === 'tailwind')
        .map(({ phase, selected }) => ({ phase, selected })),
    )
    assert.deepEqual(
      evidence.observations
        .filter((row) => row.kind === 'candidate')
        .map(({ phase, selected }) => ({ phase, selected })),
      evidence.observations
        .filter((row) => row.kind === 'tailwind')
        .map(({ phase, selected }) => ({ phase, selected })),
    )
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
