import assert from 'node:assert/strict'
import test from 'node:test'

import { collectIosReport } from './collect-ios-report.mjs'
import { collectReport } from './collect-report.mjs'

test('collects the required lifecycle and frame measurements', () => {
  const log = [
    '{ReactNativeJS} [hozo-three-native] {"event":"renderer_ready","host":"expo-gl","elapsedMs":81,"contextId":7}',
    '{ReactNativeJS} [hozo-three-native] {"event":"first_frame","host":"expo-gl","elapsedMs":99,"objectId":"cube"}',
    '{ReactNativeJS} [hozo-three-native] {"event":"app_backgrounded","host":"expo-gl"}',
    '{ReactNativeJS} [hozo-three-native] {"event":"app_resumed","host":"expo-gl","elapsedMs":400,"resumeEpoch":1}',
    '{ReactNativeJS} [hozo-three-native] {"event":"frame_after_resume","host":"expo-gl","elapsedMs":417,"objectId":"cube","contextId":7,"resumeEpoch":1}',
    '{ReactNativeJS} [hozo-three-native] {"event":"steady_sample","host":"expo-gl","frameCount":120,"medianFrameMs":16.6,"p95FrameMs":18,"objectId":"cube"}',
    '{ReactNativeJS} [hozo-three-native] {"event":"object_activated","host":"expo-gl","objectId":"cube","source":"canvas"}',
    '{ReactNativeJS} [hozo-three-native] {"event":"object_activated","host":"expo-gl","objectId":"cube","source":"semantic-control"}',
    '{ReactNativeJS} [hozo-three-native] {"event":"navigation_activated","host":"expo-gl","href":"/cubes/measured","replace":true}',
    '{ReactNativeJS} [hozo-three-native] {"event":"renderer_unmounted","host":"expo-gl","elapsedMs":2110}',
  ].join('\n')

  const report = collectReport(log, 42, 2)
  assert.equal(report.apkBytes, 42)
  assert.equal(report.schemaVersion, 2)
  assert.deepEqual(report.lifecycle, {
    contextBeforeBackground: 7,
    contextAfterResume: 7,
    contextPreserved: true,
    resumeToFrameMs: 17,
    touchAttempts: 2,
  })
  assert.deepEqual(
    report.events.map((entry) => entry.event),
    [
      'renderer_ready',
      'first_frame',
      'app_backgrounded',
      'app_resumed',
      'frame_after_resume',
      'steady_sample',
      'object_activated',
      'object_activated',
      'navigation_activated',
      'renderer_unmounted',
    ],
  )
})

test('rejects a boot that never produced a first frame', () => {
  assert.throws(
    () =>
      collectReport(
        [
          '[hozo-three-native] {"event":"renderer_ready","host":"expo-gl"}',
          '[hozo-three-native] {"event":"steady_sample","host":"expo-gl"}',
          '[hozo-three-native] {"event":"object_activated","host":"expo-gl","source":"canvas"}',
          '[hozo-three-native] {"event":"renderer_unmounted","host":"expo-gl"}',
          '[hozo-three-native] {"event":"object_activated","host":"expo-gl","source":"semantic-control"}',
        ].join('\n'),
        1,
      ),
    /first_frame/,
  )
})

test('rejects a semantic control wired to a different object', () => {
  const events = [
    { event: 'renderer_ready', host: 'expo-gl' },
    { event: 'first_frame', host: 'expo-gl' },
    { event: 'app_backgrounded', host: 'expo-gl' },
    { event: 'app_resumed', host: 'expo-gl' },
    { event: 'frame_after_resume', host: 'expo-gl', objectId: 'mesh-a' },
    { event: 'steady_sample', host: 'expo-gl', objectId: 'mesh-a' },
    { event: 'object_activated', host: 'expo-gl', objectId: 'mesh-a', source: 'canvas' },
    { event: 'renderer_unmounted', host: 'expo-gl' },
    { event: 'object_activated', host: 'expo-gl', objectId: 'mesh-b', source: 'semantic-control' },
    { event: 'navigation_activated', host: 'expo-gl', href: '/cubes/measured', replace: true },
  ]
  const log = events.map((event) => `[hozo-three-native] ${JSON.stringify(event)}`).join('\n')

  assert.throws(() => collectReport(log, 1), /share object identity/)
})

test('rejects a frame sample with no device touch raycast', () => {
  const events = [
    { event: 'renderer_ready', host: 'expo-gl' },
    { event: 'first_frame', host: 'expo-gl' },
    { event: 'app_backgrounded', host: 'expo-gl' },
    { event: 'app_resumed', host: 'expo-gl' },
    { event: 'frame_after_resume', host: 'expo-gl', objectId: 'mesh-a' },
    { event: 'steady_sample', host: 'expo-gl', objectId: 'mesh-a' },
    { event: 'renderer_unmounted', host: 'expo-gl' },
    { event: 'object_activated', host: 'expo-gl', objectId: 'mesh-a', source: 'semantic-control' },
  ]
  const log = events.map((event) => `[hozo-three-native] ${JSON.stringify(event)}`).join('\n')

  assert.throws(() => collectReport(log, 1), /device touch/)
})

test('rejects a destination control that bypassed the navigation adapter', () => {
  const events = [
    { event: 'renderer_ready', host: 'expo-gl' },
    { event: 'first_frame', host: 'expo-gl' },
    { event: 'app_backgrounded', host: 'expo-gl' },
    { event: 'app_resumed', host: 'expo-gl' },
    { event: 'frame_after_resume', host: 'expo-gl', objectId: 'mesh-a' },
    { event: 'steady_sample', host: 'expo-gl', objectId: 'mesh-a' },
    { event: 'object_activated', host: 'expo-gl', objectId: 'mesh-a', source: 'canvas' },
    { event: 'object_activated', host: 'expo-gl', objectId: 'mesh-a', source: 'semantic-control' },
    { event: 'renderer_unmounted', host: 'expo-gl' },
  ]
  const log = events.map((event) => `[hozo-three-native] ${JSON.stringify(event)}`).join('\n')

  assert.throws(() => collectReport(log, 1), /destination control/)
})

test('rejects a sample that never rendered after returning active', () => {
  const events = [
    { event: 'renderer_ready', host: 'expo-gl' },
    { event: 'first_frame', host: 'expo-gl' },
    { event: 'app_backgrounded', host: 'expo-gl' },
    { event: 'app_resumed', host: 'expo-gl' },
    { event: 'steady_sample', host: 'expo-gl', objectId: 'mesh-a' },
    { event: 'object_activated', host: 'expo-gl', objectId: 'mesh-a', source: 'canvas' },
    { event: 'renderer_unmounted', host: 'expo-gl' },
    { event: 'object_activated', host: 'expo-gl', objectId: 'mesh-a', source: 'semantic-control' },
  ]
  const log = events.map((event) => `[hozo-three-native] ${JSON.stringify(event)}`).join('\n')

  assert.throws(() => collectReport(log, 1), /frame_after_resume/)
})

test('collects an honest iOS lifecycle report without claiming unmeasured interaction', () => {
  const events = [
    { event: 'renderer_ready', host: 'expo-gl', elapsedMs: 80, contextId: 4 },
    { event: 'first_frame', host: 'expo-gl', elapsedMs: 96, objectId: 'cube' },
    { event: 'app_backgrounded', host: 'expo-gl', elapsedMs: 200 },
    { event: 'app_resumed', host: 'expo-gl', elapsedMs: 500, resumeEpoch: 1 },
    {
      event: 'frame_after_resume',
      host: 'expo-gl',
      elapsedMs: 518,
      objectId: 'cube',
      contextId: 4,
    },
    {
      event: 'steady_sample',
      host: 'expo-gl',
      frameCount: 120,
      medianFrameMs: 16.7,
      p95FrameMs: 20,
      objectId: 'cube',
    },
    { event: 'renderer_unmounted', host: 'expo-gl', elapsedMs: 2_800 },
  ]

  const report = collectIosReport(events, 123)
  assert.equal(report.appBytes, 123)
  assert.deepEqual(report.lifecycle, {
    status: 'measured',
    contextBeforeBackground: 4,
    contextAfterResume: 4,
    contextPreserved: true,
    resumeToFrameMs: 18,
  })
  assert.equal(report.interaction.pointerRaycast, 'not-run')
  assert.equal(report.interaction.voiceOver, 'not-run')
})

test('records an unavailable hosted iOS lifecycle without losing render evidence', () => {
  const reason = 'The hosted simulator did not background the React Native scene.'
  const events = [
    { event: 'renderer_ready', host: 'expo-gl', elapsedMs: 80, contextId: 4 },
    { event: 'first_frame', host: 'expo-gl', elapsedMs: 96, objectId: 'cube' },
    { event: 'lifecycle_not_run', host: 'expo-gl', reason },
    {
      event: 'steady_sample',
      host: 'expo-gl',
      frameCount: 120,
      medianFrameMs: 16.7,
      p95FrameMs: 20,
      objectId: 'cube',
    },
    { event: 'renderer_unmounted', host: 'expo-gl', elapsedMs: 2_800 },
  ]

  const report = collectIosReport(events, 123)
  assert.deepEqual(report.lifecycle, { status: 'not-run', reason })
  assert.equal(report.events.at(-1).event, 'renderer_unmounted')
})
