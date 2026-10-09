// `FileDropzone` on React Native (#151): a button that opens a picker the
// application has -- `pickFiles` here, standing in for `expo-document-picker`
// -- sorts what comes back by the same rules as the Web, and announces it.
// Against the RN stub; no picker is opened on a device.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import type { Tree } from './native-render.ts'
import './native-render.ts'

const require = createRequire(import.meta.url)
const react = require('react')
const renderer = require('react-test-renderer')
const stub = require('react-native')

async function mount(props: Record<string, unknown>) {
  const { FileDropzone } = require('../../form/src/file-dropzone.native.tsx') as {
    FileDropzone: unknown
  }
  let root: ReturnType<typeof renderer.create> | undefined
  renderer.act(() => {
    root = renderer.create(
      react.createElement(
        FileDropzone,
        { accessibilityLabel: 'Upload photo', ...props },
        'Add a photo',
      ),
    )
  })
  return root
}
const button = (root: ReturnType<typeof renderer.create>) =>
  root.root.findAll((node: Tree) => node.type === 'Pressable')[0]

test('a picked file is sorted, handed over and announced; a refused one says why', async () => {
  const announced: string[] = []
  const original = stub.AccessibilityInfo.announceForAccessibility
  stub.AccessibilityInfo.announceForAccessibility = (text: string) => announced.push(text)
  try {
    const selected: unknown[] = []
    const refused: unknown[] = []
    const asked: unknown[] = []
    const root = await mount({
      accept: ['image/png'],
      maxSize: 5_000_000,
      multiple: true,
      pickFiles: async (options: unknown) => {
        asked.push(options)
        return [
          { name: 'photo.png', size: 2_400_000, type: 'image/png', uri: 'file:///photo.png' },
          { name: 'anim.gif', size: 10, type: 'image/gif', uri: 'file:///anim.gif' },
        ]
      },
      onFilesSelected: (files: unknown[]) => selected.push(...files),
      onRejected: (rejections: unknown[]) => refused.push(...rejections),
    })
    assert.equal(button(root).props.accessibilityRole, 'button')
    assert.equal(button(root).props.accessibilityLabel, 'Upload photo')
    await renderer.act(async () => {
      await (button(root).props.onPress as () => Promise<void>)()
    })
    assert.deepEqual(asked, [{ accept: ['image/png'], multiple: true }])
    assert.deepEqual(
      selected.map((file) => (file as { name: string }).name),
      ['photo.png'],
    )
    assert.deepEqual(
      refused.map((r) => (r as { reason: string }).reason),
      ['type'],
    )
    assert.equal(announced.length, 1)
    assert.match(
      announced[0] as string,
      /^photo\.png selected, 2\.4 MB\. anim\.gif is not an accepted kind of file$/,
    )
    renderer.act(() => root.unmount())
  } finally {
    stub.AccessibilityInfo.announceForAccessibility = original
  }
})

test('a cancelled pick hands over nothing and says nothing', async () => {
  const announced: string[] = []
  const original = stub.AccessibilityInfo.announceForAccessibility
  stub.AccessibilityInfo.announceForAccessibility = (text: string) => announced.push(text)
  try {
    let called = false
    const root = await mount({
      pickFiles: async () => null,
      onFilesSelected: () => {
        called = true
      },
    })
    await renderer.act(async () => {
      await (button(root).props.onPress as () => Promise<void>)()
    })
    assert.equal(called, false)
    assert.deepEqual(announced, [])
    renderer.act(() => root.unmount())
  } finally {
    stub.AccessibilityInfo.announceForAccessibility = original
  }
})

test('with no picker at all the button is unavailable and says so, rather than doing nothing', async () => {
  const warn = console.warn
  const warnings: string[] = []
  console.warn = (text: string) => warnings.push(text)
  try {
    const root = await mount({})
    assert.equal(button(root).props.disabled, true)
    assert.equal(button(root).props.accessibilityHint, 'No file picker is available')
    assert.ok(
      warnings.some((text) => text.includes('expo-document-picker')),
      String(warnings),
    )
    renderer.act(() => root.unmount())
  } finally {
    console.warn = warn
  }
})
