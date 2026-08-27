import assert from 'node:assert/strict'
import { test } from 'node:test'

import { transformSync } from '@babel/core'
import stylexPlugin from '@stylexjs/babel-plugin'

import { lowerModule } from './lower.ts'

const filename = '/app/Card.tsx'
const source = `import * as stylex from '@stylexjs/stylex'
import { View } from '@hozo/core'

const styles = stylex.create({
  root: { color: 'red' },
})

export function Card() {
  return <View className="p-4" {...stylex.props(styles.root)}>Card</View>
}
`

function officialStylex(code: string): string {
  const result = transformSync(code, {
    filename,
    babelrc: false,
    configFile: false,
    parserOpts: {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
    },
    plugins: [[stylexPlugin, { runtimeInjection: false }]],
  })
  assert.ok(result?.code)
  return result.code
}

test('StyleX before Hozo cannot preserve JSX last-wins styling semantics', () => {
  const stylexFirst = officialStylex(source)
  assert.match(stylexFirst, /className="p-4" className="[^" ]+"/)

  const hozoSecond = lowerModule(stylexFirst, filename, filename, undefined)
  assert.ok(hozoSecond)

  // The source JSX says the second className replaces the first. Once both
  // are just attributes, however, Hozo compiles its known Tailwind class and
  // carries StyleX's hash beside it. The result now applies both styles and
  // is therefore deterministic but not the program React would have rendered
  // without Hozo.
  assert.match(hozoSecond.css, /padding-top: 16px/)
  assert.match(hozoSecond.code, /className="hozo-view hozo-r0-0 [^" ]+"/)
})

test('Hozo before StyleX leaves a later StyleX className that replaces Hozo at runtime', () => {
  const hozoFirst = lowerModule(source, filename, filename, undefined)
  assert.ok(hozoFirst)
  const stylexSecond = officialStylex(hozoFirst.code)

  // Hozo's class is present, but the StyleX spread became a later className.
  // JSX duplicate-prop resolution is last-wins, so the padding class has CSS
  // but no longer reaches the DOM. Ordering alone therefore cannot make the
  // two frontends safe on the same element.
  assert.match(stylexSecond, /className="hozo-view hozo-r0-0" className="[^" ]+"/)
  assert.match(hozoFirst.css, /padding-top: 16px/)
})
