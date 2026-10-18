import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createCompiler } from '@hozo/compiler'
import { loadTheme } from '@hozo/tailwind'
import { transformHozoSource } from './transform.ts'

test('every actual UI TSX module reached from the public root can pass Native lowering', async (t) => {
  const ui = new URL('../../ui/', import.meta.url)
  const theme = await loadTheme(
    '@import "tailwindcss"; @import "./src/theme.css";',
    fileURLToPath(ui),
  )
  const compiler = createCompiler(theme)
  const original = console.warn
  console.warn = () => {}
  t.after(() => {
    console.warn = original
  })
  const failures: string[] = []
  let transformed = 0
  const files = readdirSync(new URL('src/', ui)).filter((name) => name.endsWith('.tsx'))
  assert.ok(files.length >= 30, 'the probe must cover the source-distributed wrappers')
  for (const name of files) {
    const file = fileURLToPath(new URL(`src/${name}`, ui))
    try {
      // null is valid: some wrappers deliberately stay on the owner-aware
      // runtime class path. A successful transform need not rewrite them.
      const output = transformHozoSource(
        readFileSync(file, 'utf8'),
        file,
        fileURLToPath(ui),
        compiler,
      )
      if (output) transformed++
      if (['combobox.tsx', 'listbox.tsx', 'dialog.tsx', 'command-palette.tsx'].includes(name)) {
        assert.ok(output, `${name} must take the actual compiler path`)
        assert.match(output, /hozo(?:List)?ScrollY=\{true\}/)
      }
    } catch (error) {
      failures.push(`${name}: ${(error as Error).message}`)
    }
  }
  assert.deepEqual(failures, [])
  assert.ok(transformed >= 10, 'disabling every transform must not make this check green')
})

test('the actual UI Combobox wrapper lowers placeholder and validation to the input owner', async () => {
  const ui = new URL('../../ui/', import.meta.url)
  const file = fileURLToPath(new URL('src/combobox.tsx', ui))
  const theme = await loadTheme(
    '@import "tailwindcss"; @import "./src/theme.css";',
    fileURLToPath(ui),
  )
  const compiler = createCompiler(theme, [
    '@hozo/core',
    '@hozo/primitives',
    '@hozo/typography',
    '@hozo/patterns',
  ])
  const output = transformHozoSource(readFileSync(file, 'utf8'), file, fileURLToPath(ui), compiler)
  assert.ok(output)
  assert.match(output, /hozoInputPlaceholderTextColor=\{/)
  assert.match(output, /'aria-invalid': __hozoSlotAriaInvalid/)
  assert.match(output, /__hozoSlotAriaInvalid &&/)
  assert.match(output, /'aria-selected': __hozoSlotAriaSelected/)
  assert.match(output, /hozoOptionStyle=/)
  assert.doesNotMatch(output, /inputClassName=|optionClassName=/)
})
