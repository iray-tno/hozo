import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { buildManifest, serializeManifest, writeManifest } from './manifest.ts'

const button = `import { cx } from '@hozo/core'
import { Button as Host } from '@hozo/primitives'
export function HozoButton({ tone = 'neutral', className, ...rest }) {
  if (tone === 'accent') return <Host {...rest} className={cx('text-white', className)} />
  return <Host {...rest} className={cx('text-black', className)} />
}
`

// Keyed by POSIX path; on Windows, `path.resolve` adds the current drive.
function memory(files: Record<string, string>) {
  return (file: string) =>
    files[
      file
        .split(path.sep)
        .join('/')
        .replace(/^[A-Za-z]:/, '')
    ]
}

test('a manifest follows the entry to each component, under every name it is published as', () => {
  const manifest = buildManifest({
    entry: '/pkg/src/index.ts',
    readSource: memory({
      '/pkg/src/index.ts': `export { HozoButton as Button, HozoButton } from './button.tsx'
export { Badge } from './more'
export { Thing } from 'another-package'
`,
      '/pkg/src/button.tsx': button,
      // Re-exported again from a directory index, and renamed on the way.
      '/pkg/src/more/index.ts': `export { Inner as Badge } from './inner'`,
      '/pkg/src/more/inner.tsx': button.replace('HozoButton', 'Inner'),
    }),
  })
  assert.deepEqual(Object.keys(manifest.textForwarding), ['Badge', 'Button', 'HozoButton'])
  const entry = manifest.textForwarding.Button
  assert.deepEqual(entry.props, [
    { name: 'tone', default: 'neutral', values: ['accent', 'neutral'] },
  ])
  assert.deepEqual(entry.variants, [
    { when: ['accent'], classes: 'text-white' },
    { when: ['neutral'], classes: 'text-black' },
  ])
  // `disabled` stays in the rest, so the caller's own reaches the host.
  assert.equal(entry.disabledProp, 'disabled')
  // A pressable primitive shares its state with a Text inside it (#974).
  assert.equal(entry.hostStates, true)
})

test('a component exported but not published by the entry is left out', () => {
  const manifest = buildManifest({
    entry: '/pkg/index.ts',
    readSource: memory({
      '/pkg/index.ts': `export { Other } from './button.tsx'`,
      '/pkg/button.tsx': button,
    }),
  })
  assert.deepEqual(manifest.textForwarding, {})
})

test('arrows, React wrappers and prop aliases preserve manifests across re-exports and Native callers', async () => {
  const { createCompiler } = await import('./index.ts')
  const { DEFAULT_PRIMITIVE_SOURCES } = await import('./sources.ts')
  const { textForwardingModule } = await import('./manifest.ts')
  const imports = `import React, { memo as cached, forwardRef as withRef } from 'react'
import { Checkbox as Host } from '@hozo/patterns'`
  const params = `{ tone = 'quiet', children, className, ...rest }`
  const host = `<Host {...rest} className={tone === 'loud' ? 'font-bold hover:text-red-500 disabled:text-gray-400' : 'text-sm'}>{children}</Host>`
  const withRef = host.replace('<Host ', '<Host ref={ref} ')
  const declarations = [
    `${imports}\nexport function Inner(${params}) { return (${host}) }`,
    `${imports}\nexport const Inner = (${params}) => { return (${host}) }`,
    `${imports}\nconst Inner = (${params}) => (${host}); export { Inner }`,
    `${imports}\nexport const Inner = cached((${params}) => (${host}))`,
    `${imports}\nexport const Inner = cached(function Render(${params}) { return (${host}) }, () => false)`,
    `${imports}\nexport const Inner = withRef<Element, Props>((${params}, ref) => (${withRef}))`,
    `${imports}\nexport const Inner = React.memo(React.forwardRef(function Render(${params}, ref) { return (${withRef}) }))`,
    `${imports}\nexport const Inner = cached(withRef(({tone: t = 'quiet', children: label, className: classes, disabled: off, ...rest}, ref) =>
      <Host ref={ref} {...rest} disabled={off} className={t === 'loud' ? 'font-bold hover:text-red-500 disabled:text-gray-400' : 'text-sm'}>{label}</Host>))`,
  ]
  const manifests = declarations.map((source) =>
    buildManifest({
      entry: '/pkg/index.ts',
      readSource: memory({
        '/pkg/index.ts': `export { Inner as Check } from './check.tsx'`,
        '/pkg/check.tsx': source,
      }),
    }),
  )
  const expected = manifests[0]
  assert.deepEqual(Object.keys(expected.textForwarding), ['Check'])
  assert.equal(expected.textForwarding.Check.hostStates, true)
  assert.equal(expected.textForwarding.Check.disabledProp, 'disabled')
  for (const manifest of manifests) assert.deepEqual(manifest, expected)

  const compiler = createCompiler(undefined, [...DEFAULT_PRIMITIVE_SOURCES])
  for (const source of declarations) {
    // Checkbox is a prebuilt runtime boundary, not a primitive this API
    // lowers. The primitive equivalent checks that wrapped renderers also
    // compile their host's state owner, not just a caller's manifest JSON.
    const producer = source.replace(
      "Checkbox as Host } from '@hozo/patterns'",
      "Pressable as Host } from '@hozo/primitives'",
    )
    const roots = compiler.compileNative(producer)
    assert.equal(roots.length, 1, source)
    assert.match(roots[0].jsx, /HozoPressable/)
    assert.match(roots[0].jsx, /hovered/)
    if (source.includes('ref={ref}')) assert.match(roots[0].jsx, /ref=\{ref\}/)
  }
  const caller = `import { Text } from '@hozo/core'
import { Check } from 'example-controls'
export const Terms = () => <Check tone="loud" disabled={off}><Text>I agree</Text></Check>`
  const baseline = compiler.compileNative(caller)[0]
  assert.doesNotMatch(baseline.styles, /fontWeight/)
  const outputs = manifests.map((manifest) => {
    compiler.setTextForwarding([textForwardingModule('example-controls', manifest)])
    return compiler.compileNative(caller)[0]
  })
  assert.match(outputs[0].styles, /fontWeight: '700'/)
  assert.match(outputs[0].jsx, /\(off\) && hozoStyles\.\w+/)
  assert.match(outputs[0].jsx, /hovered/)
  for (const output of outputs) assert.deepEqual(output, outputs[0])
  // Local implementation names are not public props. With no authored tone,
  // the public default is quiet, even if an unrelated `t` prop says loud.
  const defaulted = compiler.compileNative(caller.replace('tone="loud"', 't="loud"'))[0]
  assert.match(defaulted.styles, /fontSize: 14/)
  assert.doesNotMatch(defaulted.styles, /fontWeight: '700'/)
})

test('a same-named non-React wrapper stays out of the published manifest', () => {
  const source = `import { memo } from 'not-react'
import { Button as Host } from '@hozo/primitives'
export const Inner = memo(({children}) => <Host className="text-sm">{children}</Host>)`
  const manifest = buildManifest({
    entry: '/pkg/index.ts',
    readSource: memory({
      '/pkg/index.ts': `export { Inner as Check } from './check.tsx'`,
      '/pkg/check.tsx': source,
    }),
  })
  assert.deepEqual(manifest.textForwarding, {})
})

test('a renamed disabled source drives caller styles through its public prop, not its local alias', async () => {
  const { createCompiler } = await import('./index.ts')
  const { DEFAULT_PRIMITIVE_SOURCES } = await import('./sources.ts')
  const { textForwardingModule } = await import('./manifest.ts')
  const manifest = buildManifest({
    entry: '/pkg/index.ts',
    readSource: memory({
      '/pkg/index.ts': `export { Inner as Control } from './inner.tsx'`,
      '/pkg/inner.tsx': `import {Button as Host} from '@hozo/primitives'
export const Inner = ({inactive: off, children: label}) =>
  <Host disabled={off} className="text-sm disabled:text-gray-400">{label}</Host>`,
    }),
  })
  assert.equal(manifest.textForwarding.Control.disabledProp, 'inactive')
  const compiler = createCompiler(undefined, [...DEFAULT_PRIMITIVE_SOURCES])
  compiler.setTextForwarding([textForwardingModule('example-controls', manifest)])
  const output = compiler.compileNative(`import {Text} from '@hozo/core'
import {Control} from 'example-controls'
export const Save = () => <Control inactive={locked}><Text>Save</Text></Control>`)[0]
  assert.match(output.styles, /fontSize: 14/)
  assert.match(output.jsx, /\(locked\) && hozoStyles\.\w+/)
  assert.doesNotMatch(output.jsx, /\boff\b/)
})

test('the package directory form writes the file package.json names, and --check compares it', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'hozo-manifest-'))
  mkdirSync(path.join(dir, 'src'))
  writeFileSync(path.join(dir, 'src', 'button.tsx'), button)
  writeFileSync(path.join(dir, 'src', 'index.ts'), `export { HozoButton } from './button.tsx'`)
  writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ exports: { '.': './src/index.ts' }, hozo: { manifest: './meta.json' } }),
  )
  assert.equal(writeManifest(dir, { check: true }).current, false)
  const written = writeManifest(dir)
  assert.equal(written.file, path.join(dir, 'meta.json'))
  assert.equal(readFileSync(written.file, 'utf8'), serializeManifest(JSON.parse(written.text)))
  assert.equal(writeManifest(dir, { check: true }).current, true)
})

test("a caller's nested Text gets what @hozo/ui's own manifest says Button hands down", async () => {
  const { createCompiler } = await import('./index.ts')
  const { DEFAULT_PRIMITIVE_SOURCES } = await import('./sources.ts')
  const { textForwardingModule } = await import('./manifest.ts')
  const manifestFile = new URL('../../ui/hozo.manifest.json', import.meta.url)
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'))
  const compiler = createCompiler(undefined, [...DEFAULT_PRIMITIVE_SOURCES])
  const source = `import { View, Text } from '@hozo/core'
import { Button } from '@hozo/ui'
export const Save = () => <Button tone="accent"><View><Text>Save</Text></View></Button>
`
  const before = compiler.compileNative(source)[0].styles
  compiler.setTextForwarding([textForwardingModule('@hozo/ui', manifest)])
  const after = compiler.compileNative(source)[0].styles
  // `font-semibold` and `text-sm` need no theme to resolve.
  assert.doesNotMatch(before, /fontWeight/)
  assert.match(after, /fontWeight: '600'/)
  assert.match(after, /fontSize: 14/)
})

test('and what Alert hands down, through a View and its named class lists', async () => {
  const { createCompiler } = await import('./index.ts')
  const { DEFAULT_PRIMITIVE_SOURCES } = await import('./sources.ts')
  const { textForwardingModule } = await import('./manifest.ts')
  const manifestFile = new URL('../../ui/hozo.manifest.json', import.meta.url)
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'))
  const compiler = createCompiler(undefined, [...DEFAULT_PRIMITIVE_SOURCES])
  const source = `import { Text } from '@hozo/core'
import { Alert } from '@hozo/ui'
export const Saved = () => <Alert tone="danger"><Text>Not saved</Text></Alert>
`
  const before = compiler.compileNative(source)[0].styles
  compiler.setTextForwarding([textForwardingModule('@hozo/ui', manifest)])
  const after = compiler.compileNative(source)[0].styles
  assert.doesNotMatch(before, /fontSize/)
  assert.match(after, /fontSize: 14/)
})

test('and what Checkbox hands its label, with the caller deciding `disabled:`', async () => {
  const { createCompiler } = await import('./index.ts')
  const { DEFAULT_PRIMITIVE_SOURCES } = await import('./sources.ts')
  const { textForwardingModule } = await import('./manifest.ts')
  const manifestFile = new URL('../../ui/hozo.manifest.json', import.meta.url)
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'))
  const compiler = createCompiler(undefined, [...DEFAULT_PRIMITIVE_SOURCES])
  const source = `import { Text } from '@hozo/core'
import { Checkbox } from '@hozo/ui'
export const Terms = () => <Checkbox disabled={off}><Text>I agree</Text></Checkbox>
`
  const before = compiler.compileNative(source)[0]
  compiler.setTextForwarding([textForwardingModule('@hozo/ui', manifest)])
  const after = compiler.compileNative(source)[0]
  assert.doesNotMatch(before.styles, /lineHeight/)
  assert.match(after.styles, /fontSize: 14/)
  assert.match(after.styles, /lineHeight: 24/)
  // `disabled` reaches the pattern through Checkbox's rest, so the caller's
  // own `off` switches the label to the disabled colour.
  assert.match(after.jsx, /\(off\) && hozoStyles\.\w+/)
})
