// `measureCanvasText`, which is the measurement this package took
// internally on both platforms and handed to nobody.
//
// Sizing a tooltip against a label, or deciding where a line has to
// break, needs the width of a run of text. Only the renderer knows it,
// and a caller outside the surface had no way to ask. The advice that
// came with the old refusal to hit test text -- draw a transparent rect
// over the label -- needed exactly this number to size the rect.
//
// The Web half measures with a canvas of its own rather than the one on
// screen, because a caller laying out has usually not mounted anything
// yet. That is sound and not obvious, so it is what these pin: text
// metrics read nothing from a canvas but its `font`.

import assert from 'node:assert/strict'
import test from 'node:test'

const fonts: string[] = []

/**
 * A document whose canvas measures like a browser: half an em per
 * character, ink 0.7em above the baseline and 0.2em below. `save` and
 * `restore` keep a stack, as the real ones do.
 *
 * Installed before the module loads, since the measuring context is made
 * once and kept.
 */
function installDocument() {
  const initial = '10px sans-serif'
  const state: Record<string, unknown> = { font: initial }
  const stack: unknown[] = []
  let created = 0
  const context = new Proxy(state, {
    get(target, property) {
      if (property === 'save') return () => stack.push(target.font)
      if (property === 'restore') return () => (target.font = stack.pop() ?? initial)
      if (property === 'measureText') {
        return (text: string) => {
          const size = Number.parseFloat(/([0-9.]+)px/.exec(String(target.font))?.[1] ?? '') || 10
          return {
            width: text.length * size * 0.5,
            actualBoundingBoxAscent: size * 0.7,
            actualBoundingBoxDescent: size * 0.2,
          }
        }
      }
      if (property in target) return target[property as string]
      return () => undefined
    },
    set(target, property, value) {
      target[property as string] = value
      if (property === 'font') fonts.push(String(value))
      return true
    },
  })
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: () => {
        created += 1
        return { getContext: () => context }
      },
    },
  })
  return { canvases: () => created, font: () => state.font, initial }
}

const fake = installDocument()
const { measureCanvasText } = await import('./index.tsx')

test('a label is measured by its ink, in the font it will be drawn with', () => {
  // The four fields go through the same `cssFontShorthand` the renderer
  // sets before drawing. A measurement in a different face is a box of
  // the right shape in the wrong place.
  const metrics = measureCanvasText({ text: 'Jan', x: 0, y: 0, fontSize: 20, fontWeight: 'bold' })
  assert.deepEqual(metrics, { width: 30, ascent: 14, descent: 4 })
  assert.ok(fonts.includes('normal bold 20px sans-serif'), `measured with: ${fonts.join(', ')}`)
})

test('the measuring canvas is made once, not once per measurement', () => {
  // A caller laying out an axis measures every tick. An element per
  // measurement would make that the expensive part of the frame.
  for (let index = 0; index < 5; index += 1) {
    measureCanvasText({ text: 'x', x: 0, y: 0, fontSize: 12 })
  }
  assert.equal(fake.canvases(), 1)
})

test('the font is put back, so one caller cannot disturb the next', () => {
  // One context serves every caller, and nothing here owns it. A
  // measurement that left 40px set behind would hand whoever asked next
  // a box twice the size it should be.
  measureCanvasText({ text: 'Jan', x: 0, y: 0, fontSize: 40 })
  assert.equal(fake.font(), fake.initial)
})
