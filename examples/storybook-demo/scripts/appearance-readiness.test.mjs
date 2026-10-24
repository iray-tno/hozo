import assert from 'node:assert/strict'
import test from 'node:test'
import { waitForAppearanceStory } from './appearance-readiness.mjs'

function harness() {
  let time = 0
  const body = new Set(['sb-show-main'])
  const root = { childElementCount: 1 }
  const link = { sheet: {}, disabled: false }
  const doc = {
    URL: 'http://localhost/iframe.html?id=requested',
    readyState: 'complete',
    body: { classList: { contains: (name) => body.has(name) } },
    fonts: { status: 'loaded' },
    getElementById: () => root,
    querySelectorAll: () => [link],
    styleSheets: [],
  }
  const frame = { contentDocument: doc }
  const options = {
    timeout: 100,
    now: () => time,
    wait: async (ms) => {
      time += ms
    },
  }
  return { doc, frame, options, root, link, body, time: () => time }
}

test('appearance waits for the requested document, render, stylesheet and fonts', async () => {
  for (const property of ['document', 'loading', 'render', 'body', 'stylesheet', 'fonts']) {
    const h = harness()
    if (property === 'document') h.doc.URL = 'http://localhost/iframe.html?id=previous'
    if (property === 'loading') h.doc.readyState = 'loading'
    if (property === 'render') h.root.childElementCount = 0
    if (property === 'body') h.body.delete('sb-show-main')
    if (property === 'stylesheet') h.link.sheet = null
    if (property === 'fonts') h.doc.fonts.status = 'loading'
    const tick = h.options.wait
    h.options.wait = async (ms) => {
      await tick(ms)
      h.doc.URL = 'http://localhost/iframe.html?id=requested'
      h.doc.readyState = 'complete'
      h.root.childElementCount = 1
      h.body.add('sb-show-main')
      h.link.sheet = {}
      h.doc.fonts.status = 'loaded'
    }
    assert.equal(await waitForAppearanceStory(h.frame, 'requested', h.options), h.doc)
    assert.equal(h.time(), 25, property)
  }
})

test('appearance fails a missing stylesheet, stale page, empty render or Storybook error', async () => {
  for (const property of ['stylesheet', 'stale', 'empty', 'error']) {
    const h = harness()
    if (property === 'stylesheet') h.link.sheet = null
    if (property === 'stale') h.doc.URL = 'http://localhost/iframe.html?id=previous'
    if (property === 'empty') h.root.childElementCount = 0
    if (property === 'error') h.body.add('sb-show-errordisplay')
    await assert.rejects(waitForAppearanceStory(h.frame, 'requested', h.options), /Story/)
  }
})

test('appearance cannot accept readiness after its deadline', async () => {
  const h = harness()
  h.link.sheet = null
  const tick = h.options.wait
  h.options.wait = async (ms) => {
    await tick(ms)
    if (h.time() === 100) h.link.sheet = {}
  }
  await assert.rejects(waitForAppearanceStory(h.frame, 'requested', h.options), /did not finish/)
})

test('appearance readiness does not wait for focus rules or hide a real missing-rule defect', async () => {
  const h = harness()
  assert.equal(await waitForAppearanceStory(h.frame, 'requested', h.options), h.doc)
  assert.deepEqual(h.doc.styleSheets, [])
  assert.equal(h.time(), 0)
})
