import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createCompiler } from './index.ts'

const compiler = createCompiler()
const sourceOf = (element: string) =>
  `import { Button, Link, Heading } from '@hozo/core'; const Example = () => ${element}`
const refused = (source: string, native: boolean) => {
  const results = native ? compiler.compileNative(source) : compiler.compile(source)
  return results.flatMap((result) =>
    result.diagnostics.filter((diagnostic) => diagnostic.code === 'ARIA_PROP_NOT_ALLOWED'),
  )
}

for (const native of [false, true]) {
  test(`implicit role state warnings reach the ${native ? 'Native' : 'Web'} compiler`, () => {
    for (const element of [
      '<Button onPress={go} accessibilityState={{ selected: selected }}>Choose</Button>',
      '<Button onPress={go} accessibilityState={{ checked: checked }}>Choose</Button>',
      '<Link href="/docs" accessibilityState={{ selected: selected }}>Docs</Link>',
      '<Heading accessibilityState={{ checked: checked }}>Title</Heading>',
    ]) {
      const diagnostics = refused(sourceOf(element), native)
      assert.equal(diagnostics.length, 1, element)
      assert.equal(diagnostics[0].severity, 'warning')
    }
    for (const element of [
      '<Button onPress={go} accessibilityState={{ expanded: expanded }}>Open</Button>',
      '<Button onPress={go} accessibilityRole="checkbox" accessibilityState={{ checked: checked }}>Choose</Button>',
      '<Button {...props} accessibilityState={{ selected: selected }}>Choose</Button>',
      '<Button accessibilityRole={role} accessibilityState={{ selected: selected }}>Choose</Button>',
      '<Button accessibilityState={state}>Choose</Button>',
    ])
      assert.equal(refused(sourceOf(element), native).length, 0, element)
  })
}

test('an invalid state is reported, not removed or given a different role', () => {
  const source = sourceOf(
    '<Button onPress={go} accessibilityState={{ selected: selected }}>Choose</Button>',
  )
  const web = compiler.compile(source)[0]
  assert.match(web.jsx, /<button /)
  assert.match(web.jsx, /aria-selected=/)
  const native = compiler.compileNative(source)[0]
  assert.match(native.jsx, /accessibilityState=/)
  assert.match(native.jsx, /accessibilityRole="button"/)
})
