import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createCompiler } from '@hozo/compiler'
import { loadTheme } from '@hozo/tailwind'
import { codeText, normalizeCodeLines } from '@hozo/typography/code/model'
import { buildCodeShowcase, CODE_SHOWCASE_SOURCE } from '../src/lib/code-showcase.ts'
import { buildCodeSnippet, CODE_SNIPPETS, type CodeSnippet } from '../src/lib/code-snippets.ts'
import { formatJsx } from '../src/scripts/format-jsx.ts'

const css = readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf8')
const samples = await buildCodeShowcase(css)
const snippets: CodeSnippet[] = []
for (const name of Object.keys(CODE_SNIPPETS) as (keyof typeof CODE_SNIPPETS)[]) {
  snippets.push(await buildCodeSnippet(name, css))
}

test('authoring examples retain literal JSX, imports and whitespace through highlighting', () => {
  for (const [index, source] of Object.values(CODE_SNIPPETS).entries()) {
    const snippet = snippets[index]!
    assert.equal(snippet.title, source.title)
    assert.equal(snippet.code, source.code)
    assert.equal(codeText(snippet.lines), source.code)
  }
})

test('showcase tokens preserve the source and the actual Web/Native compiler output', async () => {
  const compiler = createCompiler(await loadTheme(css, process.cwd()))
  const [web] = compiler.compile(CODE_SHOWCASE_SOURCE)
  const [native] = compiler.compileNative(CODE_SHOWCASE_SOURCE)
  assert.ok(web && native)
  assert.equal(samples.source.code, CODE_SHOWCASE_SOURCE)
  assert.equal(samples.web.code.split('\n').slice(1).join('\n'), formatJsx(web.jsx))
  assert.equal(samples.native.code.split('\n').slice(1).join('\n'), formatJsx(native.jsx))
  for (const sample of Object.values(samples)) assert.equal(codeText(sample.lines), sample.code)
  assert.match(samples.web.code, /<h2\b/)
  assert.match(samples.web.code, /onClick=\{onDismiss\}/)
  assert.match(samples.native.code, /<Pressable\b/)
  assert.match(samples.native.code, /onPress=\{onDismiss\}/)
})

function luminance(hex: string) {
  assert.match(hex, /^#[\da-f]{6}$/i)
  const values = [1, 3, 5].map((at) => {
    const channel = Number.parseInt(hex.slice(at, at + 2), 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return values[0]! * 0.2126 + values[1]! * 0.7152 + values[2]! * 0.0722
}

test('every highlighted token meets normal-text contrast on both landing code backgrounds', async () => {
  const theme = await loadTheme(css, process.cwd())
  const colors = new Set<string>()
  for (const sample of [...Object.values(samples), ...snippets]) {
    for (const line of normalizeCodeLines(sample.lines))
      for (const token of line.tokens) {
        assert.equal(typeof token.color, 'string')
        colors.add(token.color as string)
      }
  }
  assert.ok(colors.size >= 4, 'the source is highlighted rather than painted one colour')
  for (const name of ['yakisugi-900', 'yakisugi-950']) {
    const background = theme.colors.find((color) => color.token === name)!.hex
    for (const foreground of colors) {
      const a = luminance(foreground)
      const b = luminance(background)
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
      assert.ok(ratio >= 4.5, `${foreground} on ${background}: ${ratio.toFixed(2)}:1`)
    }
  }
})

test('an incomplete application theme fails the build instead of silently losing colours', async () => {
  await assert.rejects(
    buildCodeShowcase('@import "tailwindcss";'),
    /Landing code theme is missing yakisugi-950/,
  )
  await assert.rejects(
    buildCodeSnippet('philosophy', '@import "tailwindcss";'),
    /Landing code theme is missing/,
  )
})
