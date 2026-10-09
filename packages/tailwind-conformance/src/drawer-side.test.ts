// `Drawer`'s `side="start"` lands on the edge text begins at (#157's
// follow-up): left in a left-to-right interface, right in a right-to-left
// one, on both platforms. The Native half reads the stub's `I18nManager`.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import './native-render.ts'

const require = createRequire(import.meta.url)
const react = require('react')
const renderer = require('react-test-renderer')
const { renderToStaticMarkup } = require('react-dom/server')
const behaviors = require('@hozo/behaviors') as { HozoI18nProvider: unknown }
const webDrawer = require('../../patterns/dist/drawer.js') as { HozoDrawer: unknown }
const stub = require('react-native')

test('on the Web, start and end follow the provider direction; left and right do not', () => {
  const draw = (side: string, dir: 'ltr' | 'rtl') =>
    renderToStaticMarkup(
      react.createElement(
        behaviors.HozoI18nProvider,
        { value: { dir } },
        react.createElement(webDrawer.HozoDrawer, {
          open: true,
          portal: false,
          side,
          accessibilityLabel: 'Menu',
        }),
      ),
    )
  assert.match(draw('start', 'ltr'), /data-hozo-side="left"/)
  assert.match(draw('start', 'rtl'), /data-hozo-side="right"/)
  assert.match(draw('end', 'rtl'), /data-hozo-side="left"/)
  assert.match(draw('left', 'rtl'), /data-hozo-side="left"/)
})

test('on Native, start follows I18nManager when there is no provider', async () => {
  const { HozoDrawer } = (await import('@hozo/patterns')) as { HozoDrawer: unknown }
  const panelShift = (rtl: boolean) => {
    const was = stub.I18nManager.isRTL
    stub.I18nManager.isRTL = rtl
    let root: ReturnType<typeof renderer.create> | undefined
    try {
      renderer.act(() => {
        root = renderer.create(
          react.createElement(
            HozoDrawer,
            { open: true, side: 'start', accessibilityLabel: 'Menu' },
            null,
          ),
        )
      })
      const [panel] = root.root.findAll(
        (node: { props: Record<string, unknown> }) => node.props.accessibilityViewIsModal === true,
      )
      const flat = stub.StyleSheet.flatten(panel.props.style)
      return flat.transform?.[0]?.translateX
    } finally {
      renderer.act(() => root?.unmount())
      stub.I18nManager.isRTL = was
    }
  }
  // Closed panels sit off their edge: a left-hand one at negative x, a
  // right-hand one at positive. Open, both are at 0 -- so open is drawn as the
  // sign of the travel it would make, read before the first layout.
  // `away * 0` keeps the sign of `away`: -0 for the left edge, 0 for the right.
  assert.ok(Object.is(panelShift(false), -0), 'start in LTR is the left edge')
  assert.ok(Object.is(panelShift(true), 0), 'start in RTL is the right edge')
})
