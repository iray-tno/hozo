// `Pagination` (#150) on both platforms from the same source: a named
// navigation of page controls, the current one marked, the ends disabled
// rather than removed, and -- with `getPageHref` -- links. State is styled by
// class lists the pattern applies, so the same look reaches React Native,
// which has no selector to read the state with. The Native half renders
// against the RN stub, not a device.

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
const webPagination = require('../../patterns/dist/pagination.js') as { HozoPagination: unknown }
const flat = (node: { props: Record<string, unknown> } | undefined) =>
  stub.StyleSheet.flatten([node?.props.style].flat(Infinity))

const source = (extra = '') => `
  import { Pagination } from '@hozo/core'
  export function C({ page, onPageChange, getPageHref }) {
    return <Pagination page={page} pageCount={20} onPageChange={onPageChange}${extra}
      className="gap-1 text-slate-700" itemClassName="px-2" currentItemClassName="bg-blue-600 text-white"
      disabledItemClassName="opacity-50" ellipsisClassName="px-1" />
  }`

const web = (props: Record<string, unknown>, extra = '') => {
  const [out] = compile(source(extra), 'C.tsx')
  assert.ok(out, 'the Web compiler lowered nothing')
  const [rendered] = renderWeb([{ name: 'C', jsx: out.jsx }], {
    HozoPagination: webPagination.HozoPagination,
    onPageChange: undefined,
    getPageHref: undefined,
    ...props,
  })
  return { html: rendered?.html ?? '', css: out.css }
}

test('on the Web: a named navigation, the current page marked, the ends disabled', () => {
  const { html, css } = web({ page: 1 })
  assert.match(
    html,
    /^<nav aria-label="Pagination"><ul class="hozo-0" style="list-style:none">/,
    html,
  )
  // Previous is disabled on page 1 and keeps its place.
  assert.match(
    html,
    /<button type="button" aria-label="Previous page" disabled="" class="hozo-1 hozo-3">/,
    html,
  )
  assert.match(
    html,
    /<button type="button" aria-label="Page 1" aria-current="page" class="hozo-1 hozo-2">1<\/button>/,
    html,
  )
  assert.match(html, /<button type="button" aria-label="Page 2" class="hozo-1">2<\/button>/, html)
  assert.match(html, /<li aria-hidden="true" class="hozo-4">…<\/li>/, html)
  assert.match(html, /aria-label="Page 20"/, html)
  for (const name of ['hozo-0', 'hozo-1', 'hozo-2', 'hozo-3', 'hozo-4']) {
    assert.ok(css.includes(`.${name} {`), `${name} has no rule:\n${css}`)
  }
})

test('on the Web with getPageHref: links, and the end with nowhere to go is a disabled link', () => {
  const { html } = web(
    { page: 20, getPageHref: (p: number) => `/catalog?page=${p}` },
    ' getPageHref={getPageHref}',
  )
  assert.match(
    html,
    /<a href="\/catalog\?page=20" aria-label="Page 20" aria-current="page" class="hozo-1 hozo-2">20<\/a>/,
    html,
  )
  assert.match(
    html,
    /<a href="\/catalog\?page=19" aria-label="Previous page" class="hozo-1">/,
    html,
  )
  assert.match(
    html,
    /<a href="\/catalog\?page=20" aria-label="Next page" aria-disabled="true" data-hozo-disabled="" class="hozo-1 hozo-3">/,
    html,
  )
  assert.doesNotMatch(html, /<button/, html)
})

function mount(props: Record<string, unknown>, extra = '') {
  const { C } = loadNativeModule(source(extra))
  let root: ReturnType<typeof renderer.create> | undefined
  renderer.act(() => {
    root = renderer.create(react.createElement(C, props))
  })
  return root
}
const controls = (root: ReturnType<typeof renderer.create>) =>
  root.root.findAll((node: Tree) => node.type === 'Pressable')

test('on Native: the current page is selected and styled, the ends disabled and styled', () => {
  const root = mount({ page: 5 })
  const all = controls(root)
  const byLabel = (label: string) =>
    all.find((node: Tree) => node.props.accessibilityLabel === label)
  assert.deepEqual(
    all.map((node: Tree) => node.props.accessibilityLabel),
    ['Previous page', 'Page 1', 'Page 4', 'Page 5', 'Page 6', 'Page 20', 'Next page'],
  )
  const current = byLabel('Page 5')
  assert.equal(current.props.accessibilityRole, 'button')
  assert.deepEqual(current.props.accessibilityState, { selected: true, disabled: false })
  assert.ok(flat(current).backgroundColor, 'currentItemClassName missed the current page')
  assert.equal(
    flat(current).paddingStart ?? flat(current).paddingLeft,
    8,
    'itemClassName missed it',
  )
  const [label] = current.findAll((node: Tree) => node.type === 'Text')
  assert.equal(flat(label).color, '#fff', "the current page's text colour missed its label")
  const other = byLabel('Page 4')
  assert.equal(flat(other).backgroundColor, undefined)
  const [otherLabel] = other.findAll((node: Tree) => node.type === 'Text')
  assert.ok(flat(otherLabel).color, "the row's text colour missed an ordinary page")
  renderer.act(() => root.unmount())

  const first = mount({ page: 1 })
  const previous = controls(first)[0]
  assert.equal(previous.props.disabled, true)
  assert.equal(flat(previous).opacity, 0.5, 'disabledItemClassName missed the disabled end')
  renderer.act(() => first.unmount())
})

test('on Native: a press changes the page, and the ellipses say nothing', () => {
  const pages: number[] = []
  const root = mount({ page: 5, onPageChange: (p: number) => pages.push(p) })
  const next = controls(root).at(-1)
  renderer.act(() => (next.props.onPress as () => void)())
  assert.deepEqual(pages, [6])
  const hidden = root.root.findAll(
    (node: Tree) =>
      node.type === 'View' && node.props.importantForAccessibility === 'no-hide-descendants',
  )
  assert.equal(hidden.length, 2, 'one hidden ellipsis on each side of page 5')
  renderer.act(() => root.unmount())
})

test('on Native with getPageHref: links, which open their address when there is no router', () => {
  const opened: string[] = []
  const original = stub.Linking.openURL
  stub.Linking.openURL = async (url: string) => {
    opened.push(url)
  }
  try {
    const root = mount(
      { page: 2, getPageHref: (p: number) => `myapp://catalog/${p}` },
      ' getPageHref={getPageHref}',
    )
    const page3 = controls(root).find((node: Tree) => node.props.accessibilityLabel === 'Page 3')
    assert.equal(page3.props.accessibilityRole, 'link')
    renderer.act(() => (page3.props.onPress as () => void)())
    assert.deepEqual(opened, ['myapp://catalog/3'])
    renderer.act(() => root.unmount())
  } finally {
    stub.Linking.openURL = original
  }
})
