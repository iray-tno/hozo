import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  exerciseUiDocs,
  UI_STATE_SCENES,
  uiDocStoryId,
  uiStateStoryId,
} from './ui-docs-evidence.mjs'
import { UI_DOC_PAGES } from './ui-docs-pages.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))

test('one story per docs page, and one page per docs demo', () => {
  const stories = readFileSync(join(root, 'src/UiDocs.stories.tsx'), 'utf8')
  const exported = [...stories.matchAll(/^export const (\w+): Story/gm)].map((m) =>
    m[1].replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase(),
  )
  assert.deepEqual(exported, UI_DOC_PAGES)
  const demos = readdirSync(join(root, '../../apps/landing/src/examples/ui'))
    .filter((file) => file.endsWith('Demo.tsx'))
    .map((file) =>
      file
        .replace('Demo.tsx', '')
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .toLowerCase(),
    )
    .sort()
  assert.deepEqual(UI_DOC_PAGES, demos)
})

test('a failed or unreachable demo is recorded and the walk goes on', async () => {
  const output = mkdtempSync(join(tmpdir(), 'ui-docs-'))
  const opened = []
  const captured = []
  const manifest = await exerciseUiDocs(
    {
      open: (id) => opened.push(id),
      waitForEither: async (labels) => {
        if (labels[2] === 'UI docs gone') throw new Error('never appeared')
        // labels: [ours failed, Storybook failed, ready]
        if (labels[2] === 'UI docs crashed') return labels[1]
        return labels[2] === 'UI docs broken' ? labels[0] : labels[2]
      },
      settle: async () => {},
      capture: (name) => captured.push(name),
    },
    output,
    {
      pages: ['button', 'broken', 'gone', 'crashed', 'card'],
      now: () => new Date('2026-10-21T00:00:00Z'),
    },
  )
  // The page that never appeared is tried once more at the end.
  assert.deepEqual(
    opened,
    ['button', 'broken', 'gone', 'crashed', 'card', 'gone'].map(uiDocStoryId),
  )
  assert.deepEqual(
    Object.fromEntries(Object.entries(manifest.pages).map(([page, entry]) => [page, entry.status])),
    { button: 'ok', broken: 'failed', gone: 'unreached', crashed: 'failed', card: 'ok' },
  )
  assert.deepEqual(captured, ['button', 'broken', 'gone', 'crashed', 'card', 'gone'])
  assert.equal(manifest.takenAt, '2026-10-21T00:00:00.000Z')
  assert.deepEqual(JSON.parse(readFileSync(join(output, 'manifest.json'), 'utf8')), manifest)
})

test('a walk that reached nothing fails', async () => {
  const output = mkdtempSync(join(tmpdir(), 'ui-docs-'))
  await assert.rejects(
    exerciseUiDocs(
      {
        open: () => {},
        waitForEither: async () => {
          throw new Error('no app')
        },
        settle: async () => {},
        capture: () => {
          throw new Error('no screen')
        },
      },
      output,
      { pages: ['button'] },
    ),
    /No UI docs story could be opened/,
  )
})

test('an iOS walk says so in its manifest and keeps its logs under their own name', async () => {
  const output = mkdtempSync(join(tmpdir(), 'ui-docs-'))
  const manifest = await exerciseUiDocs(
    {
      open: () => {},
      waitForEither: async (labels) => labels[2],
      settle: async () => {},
      capture: () => {},
      logs: () => 'syslog',
    },
    output,
    { pages: ['button'], platform: 'ios', logFile: 'syslog.txt' },
  )
  assert.equal(manifest.platform, 'ios')
  assert.equal(readFileSync(join(output, 'syslog.txt'), 'utf8'), 'syslog')
})

test('both drivers resolve a marker and a failure seen together to the failure', () => {
  // The marker sits beside the demo, so a demo that throws inside its
  // surface leaves both on screen; the walk passes the failure first.
  for (const driver of ['android-smoke.mjs', 'ios-smoke.mjs']) {
    const source = readFileSync(join(root, 'scripts', driver), 'utf8')
    assert.match(
      source,
      /return labels\.find\(\(value\) => tree\.some\(/,
      `${driver} must pick by the walk's order across the whole tree`,
    )
  }
})

test('the iOS walk follows a failed full showcase, not a failed build or boot', () => {
  const workflow = readFileSync(join(root, '../../.github/workflows/native-showcase.yml'), 'utf8')
  assert.match(workflow, /id: ios-smoke\n/)
  assert.match(
    workflow,
    /- name: Capture each docs component preview on iOS\n(?:\s+#.*\n)*\s+if: \$\{\{ \(success\(\) \|\| steps\.ios-smoke\.outcome == 'failure'\) &&/,
  )
})

test('a page that appears on its second attempt counts as reached', async () => {
  const output = mkdtempSync(join(tmpdir(), 'ui-docs-'))
  let attempts = 0
  const manifest = await exerciseUiDocs(
    {
      open: () => {},
      waitForEither: async (labels) => {
        if (labels[2] === 'UI docs accordion' && ++attempts === 1) throw new Error('cold start')
        return labels[2]
      },
      settle: async () => {},
      capture: () => {},
    },
    output,
    { pages: ['accordion', 'alert'] },
  )
  assert.equal(attempts, 2)
  assert.deepEqual(manifest.pages.accordion, { status: 'ok', image: 'accordion.png' })
})

test('the state screens the walk captures are the stories UiStates exports', () => {
  const stories = readFileSync(join(root, 'src/UiStates.stories.tsx'), 'utf8')
  const exported = [...stories.matchAll(/^export const (\w+): Story/gm)].map((m) => m[1])
  assert.deepEqual(exported, UI_STATE_SCENES)
  assert.match(stories, /title: 'UI\/Shared state checks'/, 'the story ids assume this title')
})

test('state screens follow the pages, under their own key, so the docs manifest is unchanged', async () => {
  const output = mkdtempSync(join(tmpdir(), 'ui-docs-'))
  const opened = []
  const captured = []
  const manifest = await exerciseUiDocs(
    {
      open: (id) => opened.push(id),
      waitForEither: async (labels) => {
        if (labels.includes('Menu')) throw new Error('never appeared')
        return labels.at(-1)
      },
      settle: async () => {},
      capture: (name) => captured.push(name),
    },
    output,
    { pages: ['button'], states: ['Tabs', 'Menu'] },
  )
  assert.deepEqual(opened, [uiDocStoryId('button'), uiStateStoryId('Tabs'), uiStateStoryId('Menu')])
  assert.deepEqual(captured, ['button', 'state-tabs'])
  assert.deepEqual(Object.keys(manifest.pages), ['button'])
  assert.deepEqual(manifest.states.Tabs, { status: 'ok', image: 'state-tabs.png' })
  assert.equal(manifest.states.Menu.status, 'unreached')
})
