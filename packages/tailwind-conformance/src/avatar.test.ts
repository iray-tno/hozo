// `Avatar` (#144): one image named for the person, whatever is drawn; the
// picture falling back to initials; the status read after the name. The
// same source compiled for both platforms, each class list on its own part.
// The Native half renders against the RN stub, not a device.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { loadNativeModule, type Tree } from './native-render.ts'
import { renderWeb } from './render.ts'

const require = createRequire(import.meta.url)
const react = require('react')
const renderer = require('react-test-renderer')
const stub = require('react-native')
const { compile } = require('@hozo/compiler') as {
  compile: (source: string, filename?: string) => { jsx: string; css: string }[]
}
const webPatterns = require('../../patterns/dist/avatar.js') as { HozoAvatar: unknown }
const flat = (node: { props: Record<string, unknown> } | undefined) =>
  stub.StyleSheet.flatten([node?.props.style].flat(Infinity))

const SOURCE = `
  import { Avatar } from '@hozo/core'
  export function C({ src, name, status }) {
    return <Avatar src={src} name={name} status={status}
      className="size-10 rounded-full bg-slate-200 text-slate-700"
      imageClassName="opacity-90" fallbackClassName="p-1" statusClassName="size-3 bg-green-500" />
  }`

test('on the Web, one image named for the person, and every part has its compiled class', () => {
  const [web] = compile(SOURCE, 'C.tsx')
  assert.ok(web, 'the Web compiler lowered nothing')
  const scope = {
    HozoAvatar: webPatterns.HozoAvatar,
    src: undefined,
    name: 'Ada Lovelace',
    status: 'online',
  }
  const [{ html }] = renderWeb([{ name: 'C', jsx: web.jsx }], scope)
  assert.match(html, /^<span role="img" aria-label="Ada Lovelace, online" class="hozo-0"/, html)
  // No picture, so the initials, hidden: the name is already said.
  assert.match(html, /<span aria-hidden="true" class="hozo-2">AL<\/span>/, html)
  assert.match(
    html,
    /<span aria-hidden="true" class="hozo-3" data-hozo-status="online"><\/span>/,
    html,
  )
  for (const name of ['hozo-0', 'hozo-2', 'hozo-3'])
    assert.ok(web.css.includes(`.${name} {`), web.css)
})

test('with no name the avatar is decoration, hidden on both platforms', () => {
  const [web] = compile(SOURCE, 'C.tsx')
  const [{ html }] = renderWeb([{ name: 'C', jsx: web.jsx }], {
    HozoAvatar: webPatterns.HozoAvatar,
    src: 'a.png',
    name: undefined,
    status: undefined,
  })
  assert.match(html, /<span aria-hidden="true" class="hozo-0"/, html)
  assert.doesNotMatch(html, /role="img"/, html)

  const { C } = loadNativeModule(SOURCE)
  let root: ReturnType<typeof renderer.create> | undefined
  renderer.act(() => {
    root = renderer.create(react.createElement(C, { src: 'a.png' }))
  })
  const [outer] = root.root.findAll((node: Tree) => node.type === 'View')
  assert.equal(outer.props.importantForAccessibility, 'no-hide-descendants')
  assert.equal(outer.props.accessibilityRole, undefined)
  renderer.act(() => root.unmount())
})

test('on Native, one image element; each part gets its own style; the initials get the text colour', () => {
  const { C } = loadNativeModule(SOURCE)
  let root: ReturnType<typeof renderer.create> | undefined
  renderer.act(() => {
    root = renderer.create(react.createElement(C, { name: 'Ada Lovelace', status: 'busy' }))
  })
  const views = root.root.findAll((node: Tree) => node.type === 'View')
  const outer = views[0]
  assert.equal(outer.props.accessible, true)
  assert.equal(outer.props.accessibilityRole, 'image')
  assert.equal(outer.props.accessibilityLabel, 'Ada Lovelace, busy')
  assert.equal(flat(outer).width, 40)
  assert.equal(flat(outer).borderRadius, 9999)
  assert.equal(flat(outer).color, undefined, 'a View cannot draw a text colour')
  const [initials] = root.root.findAll((node: Tree) => node.type === 'Text')
  assert.equal(initials.props.children, 'AL')
  assert.ok(flat(initials).color, 'the avatar text colour missed the initials')
  const fallback = views.find(
    (node: Tree) => flat(node).padding === 4 || flat(node).paddingTop === 4,
  )
  assert.ok(fallback, 'fallbackClassName reached nothing')
  const dot = views.find((node: Tree) => flat(node).width === 12)
  assert.ok(dot, 'statusClassName reached nothing')
  assert.equal(dot.props.importantForAccessibility, 'no-hide-descendants')
  renderer.act(() => root.unmount())
})

test('a picture that fails shows the initials, and a new picture tries again', () => {
  const { C } = loadNativeModule(SOURCE)
  let root: ReturnType<typeof renderer.create> | undefined
  renderer.act(() => {
    root = renderer.create(react.createElement(C, { src: 'broken.png', name: 'Ada Lovelace' }))
  })
  const images = () => root.root.findAll((node: Tree) => node.type === 'Image')
  assert.equal(images().length, 1)
  assert.equal(flat(images()[0]).opacity, 0.9, 'imageClassName missed the picture')
  renderer.act(() => (images()[0].props.onError as () => void)())
  assert.equal(images().length, 0)
  assert.equal(root.root.findAll((node: Tree) => node.type === 'Text')[0]?.props.children, 'AL')
  renderer.act(() =>
    root.update(react.createElement(C, { src: 'fixed.png', name: 'Ada Lovelace' })),
  )
  assert.equal(images().length, 1)
  renderer.act(() => root.unmount())
})

test("the status words are the project's when it translates them", async () => {
  const { HozoI18nProvider } = (await import('@hozo/behaviors')) as { HozoI18nProvider: unknown }
  const { C } = loadNativeModule(SOURCE)
  const translate = (key: string, params: Record<string, unknown>, fallback: string) =>
    key === 'hozo.avatar.statusOnline'
      ? 'オンライン'
      : key === 'hozo.avatar.label'
        ? `${params.name}（${params.status}）`
        : fallback
  let root: ReturnType<typeof renderer.create> | undefined
  renderer.act(() => {
    root = renderer.create(
      react.createElement(
        HozoI18nProvider,
        { value: { translate } },
        react.createElement(C, { name: '田中太郎', status: 'online' }),
      ),
    )
  })
  const [outer] = root.root.findAll((node: Tree) => node.type === 'View')
  assert.equal(outer.props.accessibilityLabel, '田中太郎（オンライン）')
  assert.equal(root.root.findAll((node: Tree) => node.type === 'Text')[0]?.props.children, '田')
  renderer.act(() => root.unmount())
})
