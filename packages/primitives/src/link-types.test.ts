import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import { build } from 'esbuild'
import { type ComponentRef, createRef } from 'react'
import type { Pressable } from 'react-native'
import type { HozoLinkProps } from './link.native.tsx'
import type { HozoPressable } from './pressable.native.tsx'

test('selected Link hosts preserve RN refs and extended style callback types', () => {
  const ref = createRef<ComponentRef<typeof Pressable>>()
  const plain: HozoLinkProps = {
    href: '/docs',
    ref,
    style: ({ pressed }) => ({ opacity: pressed ? 0.5 : 1 }),
  }
  const enhanced: HozoLinkProps<typeof HozoPressable>['style'] = ({ hovered, focusVisible }) => ({
    opacity: hovered || focusVisible ? 1 : 0.5,
  })
  // Ordinary links cannot silently promise state the RN host never supplies.
  const unsupported: HozoLinkProps['style'] =
    // @ts-expect-error RN's default callback has no hovered binding
    ({ hovered }) => ({ opacity: hovered ? 1 : 0.5 })
  assert.equal(plain.ref, ref)
  assert.equal(ref.current, null)
  assert.equal(typeof enhanced, 'function')
  assert.equal(typeof unsupported, 'function')
})

test('ordinary Link does not retain the enhanced host in its module graph', async () => {
  const graph = async (enhanced: boolean) => {
    const result = await build({
      stdin: {
        contents: `import { HozoLink } from './link.native.tsx'
          ${enhanced ? "import { HozoPressable } from './pressable.native.tsx'" : ''}
          export const C = () => <HozoLink href="/docs" ${enhanced ? 'hozoLinkComponent={HozoPressable}' : ''}>Docs</HozoLink>`,
        resolveDir: resolve('src'),
        loader: 'tsx',
      },
      bundle: true,
      packages: 'external',
      write: false,
      metafile: true,
      format: 'esm',
    })
    return Object.keys(result.metafile.inputs)
  }
  const retainsOwner = (inputs: string[]) =>
    inputs.some((input) => input.endsWith('pressable.native.tsx'))
  assert.equal(retainsOwner(await graph(false)), false)
  assert.equal(
    retainsOwner(await graph(true)),
    true,
    'the graph assertion also sees a selected owner',
  )
})
