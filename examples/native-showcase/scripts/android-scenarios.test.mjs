import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runAndroidScenarios } from './android-scenarios.mjs'

test('normal Android evidence runs SVG, full, then the docs previews; explicit isolated runs do not mix scenarios', async () => {
  for (const [scenario, expected] of [
    [
      undefined,
      [
        ['svg-filters', 'artifacts/native-showcase-svg'],
        ['full', 'artifacts/native-showcase'],
        ['ui-docs', 'artifacts/native-showcase-ui-docs'],
      ],
    ],
    [
      'full',
      [
        ['svg-filters', 'artifacts/native-showcase-svg'],
        ['full', 'artifacts/native-showcase'],
        ['ui-docs', 'artifacts/native-showcase-ui-docs'],
      ],
    ],
    ['svg-filters', [['svg-filters', 'artifacts/native-showcase-svg']]],
    ['audio-output', [['audio-output', 'artifacts/native-showcase-audio']]],
    ['audio-settings', [['audio-settings', 'artifacts/native-showcase-audio-settings']]],
    ['text-inheritance', [['text-inheritance', 'artifacts/native-showcase-text']]],
    ['ui-docs', [['ui-docs', 'artifacts/native-showcase-ui-docs']]],
    [
      'code-block-performance',
      [['code-block-performance', 'artifacts/native-showcase-code-block']],
    ],
    ['code-block-windowed', [['code-block-windowed', 'artifacts/native-showcase-code-block']]],
  ]) {
    const calls = []
    await runAndroidScenarios(scenario, async (...args) => {
      await Promise.resolve()
      calls.push(args)
    })
    assert.deepEqual(calls, expected)
  }
})

test('a failed driver aborts without retrying or running the next scenario; unknown modes fail closed', async () => {
  for (const scenario of [
    'full',
    'svg-filters',
    'audio-output',
    'audio-settings',
    'text-inheritance',
    'ui-docs',
    'code-block-performance',
    'code-block-windowed',
  ]) {
    const calls = []
    const failure = new Error('driver failed')
    await assert.rejects(
      () =>
        runAndroidScenarios(scenario, async (...args) => {
          await Promise.resolve()
          calls.push(args)
          throw failure
        }),
      (error) => error === failure,
    )
    assert.equal(calls.length, 1)
  }
  await assert.rejects(
    () => runAndroidScenarios('typo', () => assert.fail('unknown scenario reached driver')),
    /Unknown Android scenario/,
  )
})

test('emulator action receives one complete command instead of fragmented shell control flow', () => {
  const workflow = readFileSync(
    new URL('../../../.github/workflows/native-showcase.yml', import.meta.url),
    'utf8',
  )
  const step = workflow
    .split('- name: Exercise selected Android showcase scenario')[1]
    .split('      - uses:')[0]
  assert.match(step, /script: node examples\/native-showcase\/scripts\/android-scenarios\.mjs\r?\n/)
  assert.doesNotMatch(step, /script: \||\bif \[|\bthen\b|\bfi\b/)
})
