import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'

import { canvasAccessibilityMode } from './accessibility.ts'
import { Canvas, CanvasSceneStore, renderCanvas2D, type CanvasScene } from './index.tsx'

const checkAccessibilityTypes = () => {
  // @ts-expect-error A meaningful Canvas must choose one accessibility mode.
  const missingMode = <Canvas width={10} height={10} />
  // @ts-expect-error A decorative surface cannot also expose an alternative.
  const decorativeFallback = <Canvas decorative accessibleFallback="data" />
  // @ts-expect-error A null React node is not an accessible equivalent.
  const emptyFallback = <Canvas accessibleFallback={null} />
  return [missingMode, decorativeFallback, emptyFallback]
}
void checkAccessibilityTypes

test('the retained store builds a nested scene without coupling it to semantic nodes', () => {
  const store = new CanvasSceneStore()
  store.upsert('group', undefined, { kind: 'group', props: { opacity: 0.5 } })
  store.upsert('rect', 'group', {
    kind: 'rect',
    props: { x: 2, y: 3, width: 10, height: 12, fill: '#2563eb' },
  })
  store.upsert('circle', undefined, {
    kind: 'circle',
    props: { cx: 8, cy: 8, radius: 4, fill: '#ef4444' },
  })

  assert.deepEqual(store.snapshot(), [
    {
      kind: 'group',
      props: { opacity: 0.5 },
      children: [
        { kind: 'rect', props: { x: 2, y: 3, width: 10, height: 12, fill: '#2563eb' } },
      ],
    },
    { kind: 'circle', props: { cx: 8, cy: 8, radius: 4, fill: '#ef4444' } },
  ])
})

test('Canvas 2D rendering applies DPR and a contained viewBox before drawing', () => {
  const calls: Array<readonly unknown[]> = []
  const context = new Proxy({
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
  } as Record<string, unknown>, {
    get(target, property) {
      if (property in target) return target[property as string]
      return (...args: unknown[]) => calls.push([property, ...args])
    },
    set(target, property, value) {
      target[property as string] = value
      calls.push([`set:${String(property)}`, value])
      return true
    },
  }) as unknown as CanvasRenderingContext2D
  const scene: CanvasScene = [{
    kind: 'rect',
    props: { x: 1, y: 2, width: 10, height: 5, fill: '#2563eb' },
  }]

  renderCanvas2D(context, scene, {
    width: 200,
    height: 100,
    pixelRatio: 2,
    viewBox: [0, 0, 100, 100],
  })

  assert.deepEqual(calls.slice(0, 5), [
    ['setTransform', 1, 0, 0, 1, 0, 0],
    ['clearRect', 0, 0, 400, 200],
    ['setTransform', 2, 0, 0, 2, 0, 0],
    ['save'],
    ['translate', 50, 0],
  ])
  assert.ok(calls.some((call) => call[0] === 'rect' && call[1] === 1 && call[2] === 2))
  assert.ok(calls.some((call) => call[0] === 'fill'))
})

test('the three accessibility modes stay mutually exclusive', () => {
  assert.equal(canvasAccessibilityMode({ decorative: true }), 'decorative')
  assert.equal(canvasAccessibilityMode({ accessibilityLabel: 'Revenue' }), 'label')
  assert.equal(canvasAccessibilityMode({ accessibleFallback: 'Revenue was 42' }), 'fallback')
})

test('a label-only Canvas is exposed as one named image', () => {
  const html = renderToStaticMarkup(
    <Canvas width={100} height={50} accessibilityLabel="Quarterly revenue" />,
  )

  assert.match(html, /<canvas[^>]+aria-label="Quarterly revenue"[^>]+role="img"/)
  assert.doesNotMatch(html, /aria-hidden/)
  assert.doesNotMatch(html, /data-hozo-canvas-fallback/)
})

test('the Web fallback is a semantic sibling rather than a child of role=img', () => {
  const html = renderToStaticMarkup(
    <Canvas
      width={100}
      height={50}
      accessibilityLabel="Quarterly revenue"
      accessibleFallback={<table><tbody><tr><td>Q1</td><td>42</td></tr></tbody></table>}
    >
      <Canvas.Rect width={42} height={10} fill="#2563eb" />
    </Canvas>,
  )

  const canvasEnd = html.indexOf('</canvas>')
  const fallbackStart = html.indexOf('data-hozo-canvas-fallback')
  const tableStart = html.indexOf('<table>')
  assert.ok(canvasEnd >= 0 && fallbackStart > canvasEnd && tableStart > fallbackStart)
  assert.match(html, /<canvas[^>]+aria-hidden="true"/)
  assert.doesNotMatch(html.slice(0, canvasEnd), /role="img"|aria-label/)
  assert.match(html, /<div[^>]+role="group"[^>]+aria-label="Quarterly revenue"[^>]+data-hozo-canvas-fallback=""/)
  assert.match(html, /<table><tbody><tr><td>Q1<\/td><td>42<\/td><\/tr><\/tbody><\/table>/)
})

test('decorative canvases are explicitly hidden from accessibility APIs', () => {
  const html = renderToStaticMarkup(
    <Canvas decorative width={10} height={10}>
      <Canvas.Circle cx={5} cy={5} radius={5} />
    </Canvas>,
  )
  assert.match(html, /aria-hidden="true"/)
  assert.doesNotMatch(html, /role="img"/)
})
