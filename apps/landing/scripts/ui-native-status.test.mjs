import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { uiNativeStatusChecks } from './ui-native-status-checks.mjs'

const expected = (props) => ({ missing: [], unapplied: props })
const paragraph = (props) =>
  `<p data-native-unapplied-props>Not applied yet: ${props.map((prop) => `<code>${prop}</code>`).join(', ')}</p>`
const line = (
  props,
  { missing = 0, count = props.length, content = props.length ? paragraph(props) : '' } = {},
) =>
  `<div data-native-missing="${missing}" class="hozo-ui-native" data-native-unapplied="${count}"><details>${content}</details></div>`
const passed = (html, status) =>
  uiNativeStatusChecks(html, status, 'time-picker').every(([ok]) => ok)

test('the step-only TimePicker report passes after periodClassName gains a Native consumer', () => {
  const html = line(['stepClassName'])
  assert.equal(passed(html, expected(['stepClassName'])), true)
  // These are meaningful independent mutations, not a nonzero-count check.
  assert.equal(
    passed(html.replace('stepClassName', 'periodClassName'), expected(['stepClassName'])),
    false,
  )
  assert.equal(
    passed(html.replace('<code>stepClassName</code>', ''), expected(['stepClassName'])),
    false,
  )
})

test('both an earlier multi-prop report and a future fully applied report are checked exactly', () => {
  assert.equal(
    passed(
      line(['valueClassName', 'stepClassName', 'periodClassName']),
      expected(['periodClassName', 'stepClassName', 'valueClassName']),
    ),
    true,
  )
  assert.equal(passed(line([]), expected([])), true)
  assert.equal(passed(line(['stepClassName']), expected([])), false)
})

test('missing or duplicate status lines fail even for a zero report', () => {
  assert.equal(passed('<main>No status</main>', expected([])), false)
  assert.equal(passed(`${line([])}${line([])}`, expected([])), false)
})

test('Astro scoped-style attributes do not hide a rendered prop name', () => {
  const html = line(['stepClassName'])
    .replace('<code>', '<code data-astro-cid-example>')
    .replace('data-native-unapplied-props>', 'data-native-unapplied-props data-astro-cid-example>')
  assert.equal(passed(html, expected(['stepClassName'])), true)
  assert.equal(
    passed(html.replace('stepClassName', 'periodClassName'), expected(['stepClassName'])),
    false,
  )
})

test('wrong, absent or malformed counts cannot look like successful zeroes', () => {
  assert.equal(passed(line(['stepClassName'], { count: 2 }), expected(['stepClassName'])), false)
  assert.equal(passed(line([], { missing: 1 }), expected([])), false)
  for (const attr of ['data-native-missing', 'data-native-unapplied']) {
    const html = line([])
    assert.equal(passed(html.replace(`${attr}="0"`, ''), expected([])), false)
    assert.equal(passed(html.replace(`${attr}="0"`, `${attr}="NaN"`), expected([])), false)
  }
})

test('extra, duplicate or stale rendered props fail even when the count attribute matches', () => {
  for (const content of [
    paragraph([]),
    paragraph(['periodClassName']),
    paragraph(['stepClassName', 'periodClassName']),
    paragraph(['stepClassName', 'stepClassName']),
  ]) {
    assert.equal(passed(line(['stepClassName'], { content }), expected(['stepClassName'])), false)
  }
  assert.equal(passed(line([], { content: paragraph([]) }), expected([])), false)
  assert.equal(
    passed(
      line(['stepClassName'], { content: `${paragraph(['stepClassName'])}${paragraph([])}` }),
      expected(['stepClassName']),
    ),
    false,
  )
})

test('unrelated utility diagnostics do not count as unapplied props; bare and valued markers work', () => {
  const content = `<p>Other text</p><ul><li><code>className</code> in a diagnostic</li></ul>`
  assert.equal(
    passed(line([], { missing: 1, content }), {
      missing: [{ className: 'tabular-nums' }],
      unapplied: [],
    }),
    true,
  )
  const html = line(['stepClassName']).replace(
    'data-native-unapplied-props>',
    'data-native-unapplied-props="">',
  )
  const status = Object.freeze({
    missing: Object.freeze([]),
    unapplied: Object.freeze(['stepClassName']),
  })
  assert.equal(passed(html, status), true)
})

test('the unit checks run in the landing build gate and the template marks the rendered prop paragraph', () => {
  const scripts = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ).scripts
  assert.match(scripts['test:build'], /node --test[^&]*scripts\/ui-native-status\.test\.mjs/)
  assert.match(
    readFileSync(new URL('../src/components/docs/UiExample.astro', import.meta.url), 'utf8'),
    /<p data-native-unapplied-props>/,
  )
})
