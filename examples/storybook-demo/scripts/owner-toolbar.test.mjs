// Actual built Toolbar and independent Tailwind CSS; never a manifest's own proof.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { chromium } from 'playwright-core'
import { createCompiler, openCandidateCache } from '../../../packages/compiler/src/index.ts'
import { previewOwnerLiteralCallers } from '../../../packages/compiler/src/owner-caller-plan.ts'
import { tailwindPackageDir } from '../../../packages/tailwind/src/theme.ts'
import { evidenceSource } from '../../../scripts/style-slots/evidence-source.mjs'
import { ownerFixtureShadow } from '../../../scripts/style-slots/owner-fixture.mjs'
import { prepareWebOwnerPublication } from '../../../scripts/style-slots/web-owner-publication.mjs'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const names = 'p-[8px] gap-x-[4px] gap-y-[6px] w-[96px] bg-[#112233]'
const source = `import {Toolbar} from '@hozo/patterns';
export function ToolbarFixture({items}){return <Toolbar accessibilityLabel="Tools" items={items} className="${names}"/>}`
const require = createRequire(import.meta.url)
const executablePath = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((file) => file && existsSync(file))
if (process.env.CI) assert.ok(executablePath, 'CI requires actual Toolbar browser evidence')

async function fixture() {
  const prepared = await prepareWebOwnerPublication(source, {
    fixture: 'OwnerToolbarFixture',
    imported: 'Toolbar',
    classProp: 'className',
    owner: 'Toolbar.root',
    sites: 1,
  })
  const cache = openCandidateCache()
  cache.scanFile('Toolbar.tsx', source, 1)
  const { compile } = require('tailwindcss')
  const oracle = await compile(
    `${readFileSync(path.join(tailwindPackageDir(), 'theme.css'), 'utf8')}\n@tailwind utilities;`,
  )
  return { prepared, candidateCss: cache.renderCss(), oracleCss: oracle.build(names.split(' ')) }
}

async function appBundle(input) {
  return build({
    stdin: {
      contents: `${input}
import {Toolbar as Raw,HozoToolbar as Alias} from '@hozo/patterns';
import {useState} from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
window.aliasesSameOwner=Raw===Alias;window.actions=[];
function App(){const [revision,setRevision]=useState(0);window.refresh=()=>flushSync(()=>setRevision(v=>v+1));
return <ToolbarFixture items={['One','Two'].map(label=>({render:props=><button {...props} onClick={()=>window.actions.push(label)}>{label+revision}</button>}))}/>}
flushSync(()=>createRoot(document.querySelector('#root')).render(<App/>));`,
      resolveDir: fileURLToPath(new URL('../', import.meta.url)),
      loader: 'tsx',
    },
    bundle: true,
    write: false,
    minify: true,
    metafile: true,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
  })
}

test('Toolbar publication bundles the actual Web owner without compiler or manifest machinery', async () => {
  const f = await fixture()
  for (const input of [source, f.prepared.code]) {
    const bundle = await appBundle(input)
    const files = Object.keys(bundle.metafile.inputs).map((file) => file.replaceAll('\\', '/'))
    assert.ok(files.some((file) => file.endsWith('patterns/dist/toolbar.js')))
    assert.ok(!files.some((file) => /packages\/(compiler|tailwind)\//.test(file)))
    assert.doesNotMatch(
      bundle.outputFiles[0].text,
      /rfc010-owner-shadow-0|explicit-instance-owner-preview/,
    )
  }
  assert.equal(f.prepared.identity.owner, 'Toolbar.root')
  assert.equal(f.prepared.delivery, 'composed-ordinary-lowering')
  assert.equal(f.prepared.preparations, 1)
  assert.equal(f.prepared.ordinaryParses, 1)
  const unresolved = source.replace(names, 'hover:opacity-50')
  // Web can express hover on a div, but this Native shape cannot: the contract
  // does not manufacture a shared event capability or change default routing.
  assert.equal(
    previewOwnerLiteralCallers(unresolved, createCompiler(), {
      source: '@hozo/patterns',
      imported: 'Toolbar',
      shadow: ownerFixtureShadow('Toolbar.root'),
    }).code,
    unresolved,
  )
})

test('real Toolbar candidate and prepared root styles agree with Tailwind while item wiring stays intact', {
  skip: !executablePath,
  timeout: 60_000,
}, async () => {
  const evidence = {
    schema: 1,
    ...evidenceSource(),
    scope: 'web-toolbar-root-computed-style',
    passed: false,
    audit: 'unknown',
    identity: null,
    fingerprint: '',
    observations: [],
    controls: [],
  }
  let browser
  try {
    const f = await fixture()
    evidence.identity = f.prepared.identity
    evidence.fingerprint = f.prepared.fingerprint
    browser = await chromium.launch({ executablePath, args: ['--no-sandbox', '--disable-gpu'] })
    const expected = {
      padding: ['8px', '8px', '8px', '8px'],
      rowGap: '6px',
      columnGap: '4px',
      width: '96px',
      background: 'rgb(17, 34, 51)',
    }
    for (const [kind, css, input] of [
      ['candidate', f.candidateCss, source],
      ['tailwind', f.oracleCss, source],
      ['prepared', f.prepared.css, f.prepared.code],
    ]) {
      const page = await browser.newPage()
      const errors = []
      page.on('pageerror', (error) => errors.push(error.message))
      try {
        const bundle = await appBundle(input)
        await page.setContent(
          '<style>*{box-sizing:border-box}</style><style id="sheet"></style><div id="root"></div>',
        )
        await page.locator('#sheet').evaluate((node, css) => {
          node.textContent = css
        }, css)
        await page.addScriptTag({ content: bundle.outputFiles[0].text })
        assert.equal(await page.evaluate(() => window.aliasesSameOwner), true)
        const owner = page.getByRole('toolbar', { name: 'Tools' })
        assert.equal(await owner.count(), 1)
        assert.equal(await owner.getAttribute('tabindex'), null)
        const read = () =>
          owner.evaluate((node) => {
            const look = getComputedStyle(node)
            return {
              padding: [look.paddingTop, look.paddingRight, look.paddingBottom, look.paddingLeft],
              rowGap: look.rowGap,
              columnGap: look.columnGap,
              width: look.width,
              background: look.backgroundColor,
            }
          })
        const observe = async (phase) => {
          const style = await read()
          assert.deepEqual(style, expected, `${kind}/${phase}`)
          evidence.observations.push({ kind, phase, style })
        }
        await owner.evaluate((node) => {
          window.originalToolbar = node
        })
        await observe('rest')
        const buttons = owner.getByRole('button')
        assert.equal(await buttons.count(), 2)
        await buttons.nth(0).focus()
        await observe('child-focus')
        await page.keyboard.press('ArrowRight')
        assert.equal(await buttons.nth(1).evaluate((node) => node === document.activeElement), true)
        await page.keyboard.press('Enter')
        assert.deepEqual(await page.evaluate(() => window.actions), ['Two'])
        await observe('child-action')
        await page.evaluate(() => window.refresh())
        assert.equal(await owner.evaluate((node) => node === window.originalToolbar), true)
        await observe('rerender')
        await page.locator('#sheet').evaluate((node) => {
          node.textContent = ''
        })
        assert.notDeepEqual(
          await read(),
          expected,
          'Removing the actual stylesheet must break equality',
        )
        evidence.controls.push({ kind, phase: 'removed', passed: true })
        await page.locator('#sheet').evaluate((node, css) => {
          node.textContent = css
        }, css)
        assert.deepEqual(await read(), expected)
        evidence.controls.push({ kind, phase: 'restored', passed: true })
        evidence.observations[evidence.observations.length - 1].bundleSha256 = createHash('sha256')
          .update(bundle.outputFiles[0].text)
          .digest('hex')
        assert.deepEqual(errors, [])
      } finally {
        await page.close()
      }
    }
    assert.equal(evidence.observations.length, 12)
    assert.equal(evidence.controls.length, 6)
    evidence.passed = true
  } finally {
    await browser?.close()
    const file = path.join(root, 'artifacts/style-fact-model/toolbar-browser.json')
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, `${JSON.stringify(evidence, null, 2)}\n`)
  }
})
