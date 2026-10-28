import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { Button, Image, Link, Pressable, Text, TextInput, View } from './index.ts'

const testRenderer = createRequire(new URL('../../core/package.json', import.meta.url))(
  'react-test-renderer',
) as {
  act(callback: () => void | Promise<void>): Promise<void>
  create(
    element: unknown,
    options?: { createNodeMock?: (element: { type: unknown }) => unknown },
  ): {
    root: { findByType: (type: string) => { props: Record<string, unknown> } }
    update: (element: unknown) => void
    unmount: () => void
  }
}
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

test('the canonical package directly renders every foundational Web primitive', () => {
  const html = renderToStaticMarkup(
    createElement(
      View,
      { accessibilityLabel: 'Card' },
      createElement(Text, null, 'Body'),
      createElement(Button, { onPress() {} }, 'Save'),
      createElement(Link, { href: '/docs' }, 'Docs'),
      createElement(Pressable, { onPress() {} }, 'Open'),
      createElement(Image, { src: '/avatar.png', alt: 'Avatar' }),
      createElement(TextInput, { accessibilityLabel: 'Query' }),
    ),
  )

  assert.match(html, /<div[^>]*aria-label="Card"/)
  assert.match(html, /<span>Body<\/span>/)
  assert.match(html, /<button type="button" data-hozo-pressable="">Save<\/button>/)
  assert.match(html, /<a href="\/docs">Docs<\/a>/)
  assert.match(html, /<div[^>]*>Open<\/div>/)
  assert.match(html, /<img src="\/avatar.png" alt="Avatar"/)
  assert.match(html, /<input[^>]*aria-label="Query"/)
  assert.match(html, /<div class="hozo-view"/)
  assert.match(html, /data-href="hozo-view-base"/)
})

test('a fallback native button reflects the same disabled fact for ARIA utilities', () => {
  for (const disabled of [undefined, false, true]) {
    const rendered = renderToStaticMarkup(createElement(Button, { disabled }, 'Save'))
    const html = rendered.slice(rendered.lastIndexOf('<button'))
    if (disabled === undefined) assert.doesNotMatch(html, /aria-disabled=/)
    else assert.match(html, new RegExp(`aria-disabled="${disabled}"`))
    assert.equal(/\sdisabled=""/.test(html), Boolean(disabled))
  }
})

test('Button keeps typed host IDs and scalar DOM metadata on its actual action or navigation host', () => {
  for (const href of [undefined, '/docs']) {
    const html = renderToStaticMarkup(
      createElement(
        Button,
        {
          href,
          nativeID: 'winget-copy',
          testID: 'copy-test',
          disabled: true,
          'data-copy-label': 'コピー',
          'data-copied-label': '完了',
          'data-attempt': 3,
          'data-ready': false,
        },
        'Copy',
      ),
    )
    assert.match(html, href ? /<a\b/ : /<button\b/)
    assert.match(html, /id="winget-copy"/)
    assert.match(html, /data-testid="copy-test"/)
    assert.match(html, /data-copy-label="コピー"/)
    assert.match(html, /data-copied-label="完了"/)
    assert.match(html, /data-attempt="3"/)
    assert.match(html, /data-ready="false"/)
    assert.match(html, href ? /aria-disabled="true"/ : /disabled=""/)
    if (!href) assert.match(html, /type="button"/)
  }
})

test('uncompiled Image falls back to defaultSource on pre-hydration failure, skips widthless SVGs, and handles src changes', async () => {
  const renderWithMock = async (
    initialSrc: string,
    mock: { complete: boolean; naturalWidth: number; decode?: () => Promise<void> },
  ) => {
    let root: ReturnType<typeof testRenderer.create> | undefined
    await testRenderer.act(async () => {
      root = testRenderer.create(
        createElement(Image, {
          src: initialSrc,
          defaultSource: { uri: '/fallback.png' },
          alt: 'Cover',
        }),
        { createNodeMock: () => mock },
      )
    })
    return root!
  }

  // 1. Still loading when ref attaches: stays on src.
  const pending = await renderWithMock('/pending.png', { complete: false, naturalWidth: 0 })
  assert.equal(pending.root.findByType('img').props.src, '/pending.png')
  await testRenderer.act(async () => pending.unmount())

  // 2. Already loaded when ref attaches: stays on src.
  const loaded = await renderWithMock('/ok.png', { complete: true, naturalWidth: 150 })
  assert.equal(loaded.root.findByType('img').props.src, '/ok.png')
  await testRenderer.act(async () => loaded.unmount())

  // 3. Widthless SVG (complete && naturalWidth === 0, but decode() resolves): stays on src.
  const svg = await renderWithMock('/icon.svg', {
    complete: true,
    naturalWidth: 0,
    decode: () => Promise.resolve(),
  })
  assert.equal(svg.root.findByType('img').props.src, '/icon.svg')
  await testRenderer.act(async () => svg.unmount())

  // 4. Failed before hydration (complete && naturalWidth === 0, decode() rejects): falls back,
  // survives a re-render with the same src, and falls back again after src changes to b.png and fails.
  const failed = await renderWithMock('/a.png', {
    complete: true,
    naturalWidth: 0,
    decode: () => Promise.reject(new Error('EncodingError')),
  })
  assert.equal(failed.root.findByType('img').props.src, '/fallback.png')

  await testRenderer.act(async () => {
    failed.update(
      createElement(Image, {
        src: '/a.png',
        defaultSource: { uri: '/fallback.png' },
        alt: 'Cover',
      }),
    )
  })
  assert.equal(failed.root.findByType('img').props.src, '/fallback.png')

  await testRenderer.act(async () => {
    failed.update(
      createElement(Image, {
        src: '/b.png',
        defaultSource: { uri: '/fallback.png' },
        alt: 'Cover',
      }),
    )
  })
  assert.equal(failed.root.findByType('img').props.src, '/b.png')

  await testRenderer.act(async () => {
    ;(failed.root.findByType('img').props.onError as (event: unknown) => void)({})
  })
  assert.equal(failed.root.findByType('img').props.src, '/fallback.png')
  await testRenderer.act(async () => failed.unmount())
})
