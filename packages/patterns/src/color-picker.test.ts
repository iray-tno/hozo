import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { HozoColorPicker } from './color-picker.tsx'

test('each thumb receives its own track sample without taking over slider semantics', () => {
  const samples: { track: string; color: string }[] = []
  const html = renderToStaticMarkup(
    createElement(HozoColorPicker, {
      accessibilityLabel: 'Color',
      defaultValue: '#00000080',
      alpha: true,
      thumbClassName: 'caller-focus',
      thumbLook: (sample) => {
        samples.push(sample)
        return { className: `sample-${sample.track}` }
      },
    }),
  )
  assert.deepEqual(samples, [
    { track: 'hue', color: '#ff0000' },
    { track: 'saturation', color: '#000000' },
    { track: 'lightness', color: '#000000' },
    { track: 'alpha', color: '#00000080' },
  ])
  const thumbs = [...html.matchAll(/<div[^>]*role="slider"[^>]*>/g)].map(([tag]) => tag)
  assert.equal(thumbs.length, 4)
  for (const [index, thumb] of thumbs.entries()) {
    assert.match(thumb, /tabindex="0"/)
    assert.ok(thumb.includes(`class="caller-focus sample-${samples[index]!.track}"`))
    assert.match(thumb, /aria-valuenow=/)
    assert.match(thumb, /aria-label=/)
  }
})

test('the unstyled pattern does not add marker colors or make disabled thumbs focusable', () => {
  const html = renderToStaticMarkup(
    createElement(HozoColorPicker, {
      accessibilityLabel: 'Color',
      defaultValue: '#ffffff',
      disabled: true,
    }),
  )
  const thumbs = [...html.matchAll(/<div[^>]*role="slider"[^>]*>/g)].map(([tag]) => tag)
  assert.equal(thumbs.length, 3)
  for (const thumb of thumbs) {
    assert.match(thumb, /aria-disabled="true"/)
    assert.match(thumb, /tabindex="-1"/)
    assert.doesNotMatch(thumb, /class=|border-color/)
  }
})
