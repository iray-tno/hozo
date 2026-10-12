import assert from 'node:assert/strict'
import test from 'node:test'
import { activeCaption, prepareCues } from './caption-timeline.ts'
import type { MediaCaptionsProps } from './caption-types.ts'

const props: MediaCaptionsProps = {
  src: 'a.mp4',
  accessibilityLabel: 'English captions',
  cues: [],
  status: {
    src: 'a.mp4',
    status: 'ready',
    currentTime: 0,
    duration: null,
    seekability: { status: 'unknown', reason: 'not-exposed' },
    playing: false,
    buffering: false,
    error: null,
  },
}

test('caption intervals preserve overlaps, gaps, authored order and exact endpoints across seeks', () => {
  const cues = prepareCues([
    { start: 0, end: 8, text: 'long' },
    { start: 1, end: 2, text: 'short\nline' },
    { start: 1, end: 3, text: 'same start' },
    { start: 10, end: 11, text: 'last' },
  ])
  for (const [time, expected] of [
    [0, 'long'],
    [1, 'long\nshort\nline\nsame start'],
    [2, 'long\nsame start'],
    [3, 'long'],
    [8, ''],
    [10, 'last'],
    [11, ''],
    [1.5, 'long\nshort\nline\nsame start'],
  ] as const)
    assert.equal(
      activeCaption({ ...props, status: { ...props.status!, currentTime: time } }, cues),
      expected,
    )
  assert.equal(activeCaption(props, prepareCues([])), '')
})

test('caption observations never use a request, a retired source or a fabricated clock', () => {
  const cues = prepareCues([{ start: 0, end: 4, text: 'caption' }])
  assert.equal(activeCaption(props, cues), 'caption', 'paused at zero is readable')
  assert.equal(activeCaption({ ...props, enabled: false }, cues), '')
  assert.equal(activeCaption({ ...props, status: null }, cues), '')
  for (const patch of [
    { src: 'b.mp4' },
    { status: 'loading' as const },
    { status: 'error' as const },
    { currentTime: Number.NaN },
    { currentTime: Number.POSITIVE_INFINITY },
    { currentTime: -1 },
  ])
    assert.equal(activeCaption({ ...props, status: { ...props.status!, ...patch } }, cues), '')
  for (const patch of [{ buffering: true }, { status: 'ended' as const }])
    assert.equal(
      activeCaption({ ...props, status: { ...props.status!, ...patch } }, cues),
      'caption',
      'retain text at the actually observed clock, not inferred duration',
    )
})

test('indexed overlap lookup agrees with a full interval scan for dense, nested and expired cues', () => {
  let seed = 147
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 2 ** 32
  }
  for (let sample = 0; sample < 40; sample++) {
    let start = 0
    const authored = Array.from({ length: 80 }, (_, index) => {
      start += Math.floor(random() * 3)
      return { start, end: start + 0.25 + random() * 30, text: String(index) }
    })
    const prepared = prepareCues(authored)
    for (const time of [0, ...authored.flatMap(({ start, end }) => [start, end]), 200]) {
      const expected = authored
        .filter((cue) => cue.start <= time && time < cue.end)
        .map((cue) => cue.text)
        .join('\n')
      assert.equal(
        activeCaption({ ...props, status: { ...props.status!, currentTime: time } }, prepared),
        expected,
      )
    }
  }
})

test('invalid cues and names are rejected, and prepared text snapshots survive authored mutation', () => {
  const valid = { start: 0, end: 1, text: 'ok' }
  for (const patch of [
    { start: -1 },
    { start: Number.NaN },
    { end: Number.POSITIVE_INFINITY },
    { end: 0 },
    { end: -1 },
    { text: '' },
    { text: '  ' },
  ])
    assert.throws(() => prepareCues([{ ...valid, ...patch }]), /MediaCaptions/)
  assert.throws(() => prepareCues([{ ...valid, start: 0.5 }, valid]), /ordered/)
  for (const patch of [{ src: '' }, { accessibilityLabel: '  ' }])
    assert.throws(() => activeCaption({ ...props, ...patch }, []), /nonempty/)
  const cues = prepareCues([valid])
  valid.text = 'changed'
  assert.equal(activeCaption(props, cues), 'ok')
})
