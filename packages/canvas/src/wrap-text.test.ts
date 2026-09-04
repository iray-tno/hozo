// Where text is allowed to break.
//
// The rules are one shared implementation rather than `Intl.Segmenter`
// where it exists, because it does not exist on React Native: Hermes
// ships `Collator`, `DateTimeFormat` and `NumberFormat`, skips
// `intl402/Segmenter/` in test262, and has no Segmenter in its platform
// Intl on Android or Apple. Splitting the rule by platform would mean the
// same string breaking in different places depending on where it was
// opened, forever.
//
// So these tests are about the rule, and they measure with a stand-in:
// one unit per half-width character, two per full-width. Real widths are
// each renderer's own, and are tested where the renderers are.

import assert from 'node:assert/strict'
import test from 'node:test'

import { wrapText } from './wrap-text.ts'

/** Half-width characters count one, everything else two. */
const width = (run: string) =>
  [...run].reduce((total, point) => total + ((point.codePointAt(0) ?? 0) < 0x2e80 ? 1 : 2), 0)

const wrap = (text: string, maxWidth: number) => wrapText(text, maxWidth, width)

test('Latin breaks at spaces, and a word is never split', () => {
  assert.deepEqual(wrap('Sales are up year over year', 14), ['Sales are up', 'year over year'])
})

test('a word longer than the width takes a line of its own and overflows', () => {
  // Nothing here hyphenates. A break inside a word is a guess at a
  // language's rules, and a wrong one is unreadable rather than merely
  // wide.
  assert.deepEqual(wrap('a electroencephalography b', 6), ['a', 'electroencephalography', 'b'])
})

test('Japanese breaks between characters, since it has no spaces to break at', () => {
  // The case a space-only breaker cannot do at all: it would leave this
  // on one line at any width.
  assert.deepEqual(wrap('売上は前年比で伸びています', 14), ['売上は前年比で', '伸びています'])
})

test('a line does not begin with punctuation that belongs to the line before', () => {
  // 行頭禁則. Seven characters fit, and the seventh is 。 -- which is
  // only allowed there because it travels with the character before it.
  // On width alone the break would fall between them.
  const lines = wrap('これは正しい。次の文', 14)
  assert.ok(
    lines.every((line) => !line.startsWith('。')),
    lines.join(' / '),
  )
  assert.deepEqual(lines, ['これは正しい。', '次の文'])
})

test('a line does not end with a bracket that opens the next one', () => {
  // 行末禁則, the other half. A 「 stranded at the end of a line reads as
  // an error in the text rather than in the layout.
  const lines = wrap('図は次のとおり「重要」', 14)
  assert.ok(
    lines.every((line) => !line.endsWith('「')),
    lines.join(' / '),
  )
})

test('small kana and long vowel marks stay with the character they belong to', () => {
  const lines = wrap('データベースを使う', 8)
  assert.ok(
    lines.every((line) => !'ーァィゥェォッャュョ'.includes(line[0] ?? '')),
    lines.join(' / '),
  )
})

test('mixed script breaks at the boundary between the two', () => {
  assert.deepEqual(wrap('売上Revenue推移', 8), ['売上', 'Revenue', '推移'])
})

test('an explicit newline always breaks, at any width', () => {
  assert.deepEqual(wrap('Jan\nFeb', 1000), ['Jan', 'Feb'])
  assert.deepEqual(wrap('Jan\n\nFeb', 1000), ['Jan', '', 'Feb'])
})

test('trailing spaces do not push a line over the width', () => {
  // The space at a break is invisible, and measuring it would break the
  // line one word early for nothing anybody can see.
  assert.deepEqual(wrap('ab cd', 5), ['ab cd'])
  assert.deepEqual(wrap('ab cd ef', 5), ['ab cd', 'ef'])
})

test('text that fits comes back as one line, unchanged', () => {
  assert.deepEqual(wrap('Jan', 100), ['Jan'])
  assert.deepEqual(wrap('', 100), [''])
})

test('surrogate pairs are one character, not two halves', () => {
  // 𠮟 is outside the basic plane. Breaking between its halves produces
  // two replacement characters, which is the kind of thing that only
  // shows up in the one language that needed the extension.
  const lines = wrap('𠮟る𠮟る𠮟る', 4)
  assert.ok(
    lines.every((line) => !/[\uD800-\uDBFF]$/.test(line)),
    lines.join(' / '),
  )
  assert.deepEqual(lines.join(''), '𠮟る𠮟る𠮟る')
})
