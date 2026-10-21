// Shared compiler/candidate composition, not Native pixels or event delivery.
// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Fixtures retain authored TSX interpolation.
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { createCompiler, openCandidateCache } from '@hozo/compiler'
import { createClassResolver } from '@hozo/engine'
import { Chip } from '@hozo/patterns'
import { transformSync } from 'esbuild'
import { chromium } from 'playwright-core'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { compile } from 'tailwindcss'

const executablePath = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((file) => file && existsSync(file))
if (process.env.CI) assert.ok(executablePath, 'CI must exercise class-composition browser checks')
const directory = mkdtempSync(path.join(tmpdir(), 'hozo-caller-composition-'))
const compiler = createCompiler()
const own = 'rounded-[6px] p-2 text-[#dd1100] text-[20px] leading-[24px] font-semibold'
const caller = 'rounded-[48px] p-8 text-[#0011dd] text-[28px] leading-[36px] font-normal'
const cache = openCandidateCache(path.join(directory, 'candidates.json'))
cache.scanFile('all.ts', JSON.stringify(`${own} ${caller}`), 1)
// Deliberately emit own candidates last. If they leak back onto the owner,
// both lists have caller specificity and this order exposes the regression.
const candidates = cache.renderCss(undefined, `${caller} ${own}`.split(' '))
let browser, oracleCss

function evaluate(code, context) {
  const module = { exports: {} }
  runInNewContext(transformSync(code, { loader: 'tsx', jsxFactory: 'h', format: 'cjs' }).code, {
    module,
    ...context,
  })
  return module.exports
}
const { hozoClasses } = evaluate(cache.renderNativeModule().replace(/^import .*$/gm, ''), {
  createClassResolver,
})

before(async () => {
  oracleCss = (
    await compile(
      '@theme { --spacing: .25rem; --font-weight-normal: 400; --font-weight-semibold: 600; } @tailwind utilities;',
    )
  ).build(`${own} ${caller}`.split(' '))
  if (executablePath)
    browser = await chromium.launch({
      executablePath,
      headless: true,
      args: ['--no-sandbox', '--disable-gpu'],
    })
})
after(async () => {
  await browser?.close()
  // Only this test's exact mkdtemp directory is owned here.
  rmSync(directory, { recursive: true, force: true })
})

for (const host of ['View', 'Text', 'Chip root', 'Chip remove']) {
  test(`a mixed ternary keeps own classes below caller classes on ${host}`, {
    skip: !executablePath,
  }, async () => {
    const secondary = host === 'Chip remove'
    const tag = host.startsWith('Chip') ? 'Chip' : host
    const input = 'selected ? `${own} ${caller}` : own'
    const usage = secondary
      ? `<Chip onRemove={remove} removeClassName={${input}}>Label</Chip>`
      : `<${tag} className={${input}}>Label</${tag}>`
    const source = `import {${tag}} from '@hozo/core'; const own=${JSON.stringify(own)}; const el=${usage}`
    const web = compiler.compile(source)[0]
    const native = compiler.compileNative(source)[0]
    const page = await browser.newPage()
    const oracle = await browser.newPage()
    const select = secondary ? 'button' : tag === 'View' ? 'div' : 'span'
    const read = (p) =>
      p
        .locator(select)
        .first()
        .evaluate((e) => {
          const s = getComputedStyle(e)
          return {
            padding: s.paddingTop,
            radius: s.borderTopLeftRadius,
            color: s.color,
            weight: s.fontWeight,
            size: s.fontSize,
            leading: s.lineHeight,
          }
        })
    try {
      for (const selected of [false, true]) {
        const nativeProps = evaluate(
          `const hozoStyles=${native.styles};module.exports=(${native.jsx})`,
          {
            selected,
            own,
            caller,
            remove() {},
            hozoClasses,
            StyleSheet: { create: (s) => s },
            View: 'View',
            Text: 'Text',
            HozoChip: 'Chip',
            h: (_type, props) => props,
          },
        )
        const style = secondary
          ? nativeProps.hozoRemoveStyle
          : tag === 'Chip'
            ? nativeProps.hozoStyle
            : nativeProps.style
        const nativeStyle = Object.assign(
          {},
          ...[typeof style === 'function' ? style({}) : style].flat(Infinity).filter(Boolean),
        )
        assert.equal(nativeStyle.paddingTop, selected ? 32 : 8)
        assert.equal(nativeStyle.borderRadius, selected ? 48 : 6)
        // A Native View cannot draw typography; descendant propagation is
        // RFC 006's separate integration gate, not certified by a box style.
        if (tag !== 'View') {
          assert.equal(nativeStyle.color, selected ? '#0011dd' : '#dd1100')
          assert.equal(String(nativeStyle.fontWeight), selected ? '400' : '600')
          assert.equal(nativeStyle.fontSize, selected ? 28 : 20)
          assert.equal(nativeStyle.lineHeight, selected ? 36 : 24)
        }
        const html = renderToStaticMarkup(
          evaluate(`module.exports=(${web.jsx})`, {
            selected,
            own,
            caller,
            remove() {},
            HozoChip: Chip,
            h: createElement,
          }),
        )
        // The oracle has only the independently expected winning class set,
        // not the same conflicting expression or Hozo's generated CSS.
        await oracle.setContent(
          `<style>${oracleCss}</style><${secondary ? 'button' : tag === 'View' ? 'div' : 'span'} class="${selected ? caller : own}">Label</${secondary ? 'button' : tag === 'View' ? 'div' : 'span'}>`,
        )
        const expected = await read(oracle)
        for (const sheets of [
          [web.css, candidates],
          [candidates, web.css],
        ]) {
          await page.setContent(`${sheets.map((css) => `<style>${css}</style>`).join('')}${html}`)
          assert.deepEqual(await read(page), expected)
          if (selected) {
            // Reintroduce precisely #1152's leak. The same candidate sheet
            // must expose it, or this fixture could pass before the fix too.
            await page
              .locator(select)
              .first()
              .evaluate((element, classes) => {
                element.classList.add(...classes.split(' '))
              }, own)
            assert.notDeepEqual(
              await read(page),
              expected,
              'leaked own candidates must fail the oracle',
            )
            await page
              .locator(select)
              .first()
              .evaluate((element, classes) => {
                element.classList.remove(...classes.split(' '))
              }, own)
            assert.deepEqual(await read(page), expected)
            await page.evaluate(() => {
              for (const style of document.querySelectorAll('style'))
                if (style.textContent.includes(':not(hozo-none)')) style.remove()
            })
            assert.notDeepEqual(
              await read(page),
              expected,
              'the caller candidate sheet must actually contribute',
            )
          }
        }
      }
    } finally {
      await page.close()
      await oracle.close()
    }
  })
}
