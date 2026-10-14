import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { observeStoryRoute } from './story-route-evidence.mjs'

const request = {
  id: 'patterns-shared-showcase--preferences',
  expected: 'Preferences',
  url: 'hozo-showcase://storybook?STORYBOOK_STORY_ID=patterns-shared-showcase--preferences',
}

test('route command and independently observed UI have separate timing and do not create functional checks', async () => {
  let clock = 10
  const calls = []
  const evidence = { passed: false, checks: [] }
  const route = await observeStoryRoute(
    {
      ...request,
      now: () => clock,
      dispatch: () => {
        calls.push('dispatch')
        clock += 5
        return Buffer.from('Status: ok\n')
      },
      waitForExpected: () => {
        calls.push('observe')
        clock += 20
      },
    },
    evidence,
  )
  assert.deepEqual(calls, ['dispatch', 'observe'])
  assert.equal(route.delivery.elapsedMs, 5)
  assert.equal(route.delivery.acknowledged, true)
  assert.equal(route.delivery.response, 'Status: ok')
  assert.equal(route.ui.elapsedMs, 20)
  assert.equal(route.ui.observed, true)
  assert.equal(route.elapsedMs, 25)
  assert.equal(route.phase, 'ready')
  assert.equal(evidence.passed, false)
  assert.deepEqual(evidence.checks, [])
})

test('observed iOS openurl timeout is retained as delivery failure, without retry or starting UI wait', async () => {
  const stderr = 'Simulator device failed to open hozo-showcase://storybook.\nOperation timed out'
  const failure = Object.assign(new Error(stderr), { status: 60, stderr: Buffer.from(stderr) })
  let dispatches = 0
  let clock = 100
  const evidence = {}
  await assert.rejects(
    observeStoryRoute(
      {
        ...request,
        now: () => clock,
        dispatch: () => {
          dispatches++
          clock += 30_000
          throw failure
        },
        waitForExpected: () => assert.fail('failed delivery must not start an assumed UI wait'),
      },
      evidence,
    ),
    (error) => error === failure,
  )
  assert.equal(dispatches, 1)
  const [route] = evidence.storyRoutes
  assert.equal(route.phase, 'delivery')
  assert.equal(route.passed, false)
  assert.equal(route.delivery.acknowledged, false)
  assert.equal(route.delivery.elapsedMs, 30_000)
  assert.equal(route.ui, undefined)
  assert.equal(route.error.status, 60)
  assert.equal(route.error.stderr, stderr)
})

test('returned command is not story success; original UI failure and blocking OS evidence survive', async () => {
  const failure = Object.assign(new Error('Android System UI is not responding'), {
    blockingDialog: { title: "System UI isn't responding", package: 'android' },
  })
  let clock = 0
  let dispatches = 0
  const evidence = {}
  await assert.rejects(
    observeStoryRoute(
      {
        ...request,
        now: () => clock,
        dispatch: () => {
          dispatches++
          clock += 1_000
          return 'Status: ok'
        },
        waitForExpected: () => {
          clock += 3_000
          throw failure
        },
      },
      evidence,
    ),
    (error) => error === failure,
  )
  const [route] = evidence.storyRoutes
  assert.equal(dispatches, 1)
  assert.equal(route.phase, 'ui-ready')
  assert.equal(route.delivery.acknowledged, true)
  assert.equal(route.ui.observed, false)
  assert.equal(route.ui.elapsedMs, 3_000)
  assert.equal(route.passed, false)
  assert.deepEqual(route.error.blockingDialog, failure.blockingDialog)
})

test('later success cannot overwrite an earlier failed attempt', async () => {
  const evidence = {}
  await assert.rejects(
    observeStoryRoute(
      {
        ...request,
        dispatch: () => {
          throw new Error('failed')
        },
        waitForExpected: () => {},
      },
      evidence,
    ),
  )
  await observeStoryRoute({ ...request, dispatch: () => '', waitForExpected: () => {} }, evidence)
  assert.equal(evidence.storyRoutes.length, 2)
  assert.equal(evidence.storyRoutes[0].passed, false)
  assert.equal(evidence.storyRoutes[1].passed, true)
})

test('both device drivers use the same route phases without resending commands or changing budgets', () => {
  for (const platform of ['android', 'ios']) {
    const source = readFileSync(new URL(`./${platform}-smoke.mjs`, import.meta.url), 'utf8')
    const story = source.slice(
      source.indexOf('async function story('),
      source.indexOf('\nfunction record('),
    )
    assert.match(story, /return observeStoryRoute\(/)
    assert.match(story, /dispatch: \(\) =>/)
    assert.match(story, /waitForExpected: \(\) => waitFor\(label\(expected\)/)
    assert.equal(
      (story.match(platform === 'ios' ? /simctl\('openurl'/g : /adb\('shell', 'am'/g) ?? []).length,
      1,
    )
    assert.doesNotMatch(story, /catch|relaunch|retry/)
    if (platform === 'ios') {
      assert.match(story, /60_000, true\)/, 'keep the existing confirmation-aware UI budget')
      const failure = source.slice(source.indexOf('evidence.error = error.stack'))
      assert.match(source, /evidence\.failureTree = \{ refreshed: false \}/)
      assert.match(source, /nodes\(\)\s+evidence\.failureTree = \{ refreshed: true/)
      assert.ok(
        failure.indexOf('nodes()') < failure.indexOf("screenshot('failure')"),
        'refresh AX before writing the failure capture',
      )
    } else {
      assert.match(source, /collectSystemState\('failure-system', true\)/)
      assert.match(
        source,
        /return waitForAndroidControl\(predicate, description, \{ readNodes: nodes, timeout \}\)/,
      )
    }
  }
})
