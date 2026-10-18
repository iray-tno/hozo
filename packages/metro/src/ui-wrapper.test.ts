import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createCompiler } from '@hozo/compiler'
import { loadTheme } from '@hozo/tailwind'
import { transformHozoSource } from './transform.ts'

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
