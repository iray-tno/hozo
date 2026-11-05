import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createCompiler, openCandidateCache, prepareFinalTailwindContext } from '@hozo/compiler'
import { chromium } from 'playwright-core'
import { compile } from 'tailwindcss'
import {
  loadTheme,
  prepareTailwindOrder,
  stylesheetPath,
} from '../../../packages/tailwind/src/theme.ts'

const executablePath = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((file) => file && existsSync(file))
if (process.env.CI) assert.ok(executablePath, 'CI must exercise theme alias scope')

test('theme aliases match Tailwind root and descendant scopes on every Web emission path', {
  skip: !executablePath,
  timeout: 120_000,
}, async () => {
  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] })
  try {
    const page = await browser.newPage()
    const names = ['bg-alias', 'bg-alias/50', 'bg-chain', 'bg-external', 'bg-escaped']
    const states = [
      ['', ''],
      ['--color-base:#0000ff;--app-color:#0000ff', ''],
      ['', '--color-base:#006600;--app-color:#006600'],
      ['--color-base:#0000ff;--app-color:#0000ff', '--color-base:#006600;--app-color:#006600'],
      ['--color-alias:initial', '--color-base:#006600;--app-color:#006600'],
      [
        '--color-base:#0000ff;--app-color:#0000ff',
        '--color-base:#006600;--app-color:#006600',
        'base',
      ],
    ]
    let compared = 0
    for (const mode of ['', 'inline', 'reference', 'inline reference']) {
      const input = `@import "tailwindcss";
        @theme { --color-base:#ff0000; --color-unused:#00ff00; }
        @theme ${mode} {
          --color-alias:var(--color-base);
          --color-chain:var(--color-alias);
          --color-external:var(--app-color);
          --color-escaped:var(--color-\\62 ase);
        }`
      const base = import.meta.dirname
      const theme = await loadTheme(input, base)
      const compiler = createCompiler(theme)
      const context = prepareFinalTailwindContext(
        JSON.stringify((await prepareTailwindOrder(input, base, names)).snapshot),
      )
      const incomplete = prepareFinalTailwindContext(
        JSON.stringify((await prepareTailwindOrder(input, base, [])).snapshot),
      )
      const oracle = await compile(input, {
        base,
        loadStylesheet: async (id, from) => {
          const file = stylesheetPath(id, from)
          return { path: file, base: path.dirname(file), content: readFileSync(file, 'utf8') }
        },
      })
      const oracleCss = oracle.build(names)
      for (const name of names) {
        const source = `import {View} from '@hozo/core';export const App=()=> <View className="${name}"/>`
        const direct = compiler.compileWebOrPrepare(source, context)
        assert.ok(Array.isArray(direct), 'complete context must emit directly')
        const retained = compiler.compileWebOrPrepare(source, incomplete)
        assert.ok(!Array.isArray(retained), 'incomplete context must retain its parse')
        const preview = retained.preview()
        const final = retained.emit(context)
        const owned = compiler.prepareWebModule(source, undefined, { ownerClass: true })
        const owner = owned.emit(context)[0].ownerClass
        assert.ok(owner)
        assert.doesNotMatch(owner.css, /hozo-view/)
        const outputs = [
          ['ordinary', compiler.compile(source)],
          ['ready', direct],
          ['preview', preview],
          ['retained', final],
        ].map(([route, parts]) => ({
          route,
          css: parts.map((part) => part.css).join('\n'),
          classes: parts[0].jsx.match(/className="([^"]+)"/)[1],
        }))
        const cache = openCandidateCache()
        cache.scanFile('classes.ts', JSON.stringify(name), 1)
        outputs.push({ route: 'candidate', css: cache.renderCss(theme), classes: name })
        outputs.push({ route: 'owner', css: owner.css, classes: owner.className })
        for (const output of outputs) {
          assert.doesNotMatch(output.css, /--color-unused/)
          for (const first of [true, false]) {
            const document = (css, classes) =>
              `${(first ? [`<style>${css}</style>`, '<style id="runtime"></style>'] : ['<style id="runtime"></style>', `<style>${css}</style>`]).join('')}
                <section id="scope"><div id="probe" class="${classes}">Color</div></section>`
            // Separate documents keep Tailwind's declarations from supplying
            // a missing dependency in the Hozo-only theme setup.
            await page.setContent('<iframe id="oracle"></iframe><iframe id="actual"></iframe>')
            for (const [id, html] of [
              ['oracle', document(oracleCss, name)],
              ['actual', document(output.css, output.classes)],
            ]) {
              await page.locator(`#${id}`).evaluate((frame, html) => {
                frame.srcdoc = html
              }, html)
            }
            const read = (id) =>
              page
                .frameLocator(`#${id}`)
                .locator('#probe')
                .evaluate((node) => getComputedStyle(node).backgroundColor)
            for (const [root, scope, layer] of states) {
              const rules = `:root{${root}} #scope{${scope}}`
              const overrides = layer ? `@layer ${layer}{${rules}}` : rules
              for (const id of ['oracle', 'actual']) {
                await page
                  .frameLocator(`#${id}`)
                  .locator('#runtime')
                  .evaluate((node, css) => {
                    node.textContent = css
                  }, overrides)
              }
              const expected = await read('oracle')
              assert.equal(
                await read('actual'),
                expected,
                JSON.stringify({ mode, name, route: output.route, root, scope, layer, first }),
              )
              if (
                name === 'bg-alias' &&
                root.startsWith('--color-base') &&
                scope &&
                !layer &&
                !mode.includes('reference')
              ) {
                assert.equal(
                  expected,
                  mode.includes('inline') ? 'rgb(0, 102, 0)' : 'rgb(0, 0, 255)',
                )
              }
              compared++
            }
          }
        }
      }
      const native = compiler
        .compileNative(
          'import {View} from "@hozo/core";export const A=()=> <View className="bg-alias"/>;export const B=()=> <View className="bg-external"/>',
        )
        .map((part) => part.styles)
        .join('\n')
      assert.match(native, /backgroundColor: '#ff0000'/)
      assert.match(native, /hozo-unresolved:external/)
      assert.doesNotMatch(native, /var\(--/)
    }
    console.log(
      `[theme-alias] ${compared} isolated Tailwind comparisons across scope, source order and emission paths`,
    )
  } finally {
    await browser.close()
  }
})
