import assert from 'node:assert/strict'
import test from 'node:test'
import { captionSelection, type MediaCaptionSelectorProps } from './caption-selection.ts'

const options = [
  { id: 'en', label: 'English' },
  { id: 'ja', label: '日本語' },
  { id: 'off', label: 'Unavailable', disabled: true },
] as const

test('caption requests are controlled, mutually exclusive and distinguish Off from a track id', () => {
  const requests: (string | null)[] = []
  const props: MediaCaptionSelectorProps = {
    options,
    value: 'en',
    onValueChange: (v) => requests.push(v),
  }
  const selection = captionSelection(props)
  assert.equal(selection.name, 'Caption language')
  assert.deepEqual(
    selection.choices.map((c) => [c.key, c.checked]),
    [
      ['off', false],
      ['track:en', true],
      ['track:ja', false],
      ['track:off', false],
    ],
  )
  for (const index of [1, 3, 2, 0]) selection.choices[index]?.activate()
  assert.deepEqual(requests, ['ja', null])
  assert.equal(
    selection.choices[1]?.checked,
    true,
    'requests do not optimistically change selection',
  )
  assert.equal(captionSelection({ ...props, value: null }).choices[0]?.checked, true)
  const disabled = captionSelection({ ...props, value: 'off', disabled: true })
  for (const choice of disabled.choices) choice.activate()
  assert.deepEqual(requests, ['ja', null])
  assert.equal(disabled.choices[3]?.checked, true, 'disabling does not choose a different language')
  assert.equal(captionSelection({ ...props, options: [], value: null }).choices.length, 1)
})

test('invalid catalogs and stale selections are rejected rather than silently choosing a language', () => {
  const props: MediaCaptionSelectorProps = { options, value: 'en', onValueChange() {} }
  const invalid: Partial<MediaCaptionSelectorProps>[] = [
    { accessibilityLabel: ' ' },
    { offLabel: '' },
    { value: 'missing' },
    { options: [] },
    { options: [{ id: '', label: 'English' }] },
    { options: [{ id: 'en', label: ' ' }] },
    { options: [options[0], options[0]] },
    { onValueChange: null as unknown as MediaCaptionSelectorProps['onValueChange'] },
  ]
  for (const patch of invalid)
    assert.throws(() => captionSelection({ ...props, ...patch }), TypeError)
  const reordered = captionSelection({
    ...props,
    options: [...options].reverse(),
    offLabel: '字幕なし',
  })
  assert.equal(reordered.choices[0]?.label, '字幕なし')
  assert.equal(reordered.choices.find((c) => c.value === 'en')?.checked, true)
})
