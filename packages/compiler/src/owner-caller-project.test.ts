import assert from 'node:assert/strict'
import test from 'node:test'
import { ownerFixtureShadow } from '../../../scripts/style-slots/owner-fixture.mjs'
import { createCompiler, prepareFinalTailwindContext } from './index.ts'
import { InstanceOwnerCallerProject } from './owner-caller-project.ts'
import { captureOwnerManifests, type OwnerManifestObservation } from './owner-manifest-capture.ts'
import { OwnerManifestEpoch } from './owner-manifest-epoch.ts'

const owners = JSON.parse(ownerFixtureShadow('BottomSheet.handle'))
const a = { importer: '/app/A.tsx', specifier: 'kit' },
  b = { importer: '/app/B.tsx', specifier: 'kit' }
const request = {
  ...a,
  entry: '/package/native.js',
  imported: 'Sheet',
  classProp: 'handleClassName',
}
const source = (classes = 'p-2') =>
  `import {Sheet} from 'kit'; export const App=()=> <Sheet handleClassName="${classes}"/>`
function fixture(platform = 'ios', ownerOnly = false) {
  const manifest = {
    schema: 'rfc010-package-shadow-0',
    owners,
    exports: [{ name: 'Sheet', owners: ['BottomSheet.handle'] }],
    helpers: [],
    candidates: ['p-4'],
    compiledByConsumer: false,
    textForwarding: { version: 1, textForwarding: {} },
  }
  const rows: OwnerManifestObservation[] = [a, b].map((edge) => ({
    ...edge,
    status: 'resolved',
    instance: '/package',
    entry: request.entry,
    manifest: {
      kind: 'present',
      file: '/package/manifest.json',
      text: JSON.stringify(ownerOnly ? owners : manifest),
    },
  }))
  const capture = (current = rows) =>
    captureOwnerManifests([a, b], current, { platform, epoch: 'compiler-css-abi' })
  const epoch = new OwnerManifestEpoch()
  epoch.adopt(capture())
  return { epoch, lease: epoch.lease(), rows, capture }
}
// Controlled descriptors for lifecycle checks, not a Tailwind-fidelity oracle.
function snapshot(names: readonly string[], fingerprint = 'a') {
  return JSON.stringify({
    schema: 1,
    policy: 'tailwind-rule-signatures-v1',
    tailwindVersion: 'owner-project-unit',
    fingerprint: fingerprint.repeat(64),
    stylesheets: [],
    candidates: names.map((candidate, id) => ({
      id,
      candidate,
      status: 'described',
      firstRuleRank: null,
      rules: [
        {
          id,
          candidateId: id,
          variantOrder: '0',
          important: false,
          propertyOrder: [270],
          declarationCount: 1,
          shape: {
            kind: 'rule',
            selector: `.${candidate}`,
            nodes: [{ kind: 'declaration', property: 'padding', important: false }],
          },
        },
      ],
    })),
  })
}
function tracked() {
  const compiler = createCompiler()
  const original = compiler.prepareNativeModule.bind(compiler)
  const rows: { emitted: unknown[]; disposed: number }[] = []
  compiler.prepareNativeModule = (...args) => {
    const module = original(...args)
    const row = { emitted: [] as unknown[], disposed: 0 }
    rows.push(row)
    return {
      candidates: module.candidates,
      emit(context) {
        row.emitted.push(context)
        return module.emit(context)
      },
      dispose() {
        row.disposed++
        module.dispose()
      },
    }
  }
  compiler.compileNativeModule = () => {
    throw new Error('no direct fallback')
  }
  compiler.setTailwindOrder = () => {
    throw new Error('no mutable order setter')
  }
  return { compiler, rows }
}
function deferred() {
  let finish!: (value: string) => void
  let begin!: () => void
  const pending = new Promise<string>((resolve) => {
    finish = resolve
  })
  const started = new Promise<void>((resolve) => {
    begin = resolve
  })
  return { pending, started, finish, begin }
}

test('instance callers collect before one shared exact context and retain package provenance on cache hits', async () => {
  const { lease } = fixture()
  const trackedCompiler = tracked()
  const observed: string[][] = []
  const project = new InstanceOwnerCallerProject(lease, trackedCompiler.compiler, async (names) => {
    assert.ok(
      trackedCompiler.rows.length >= 2 &&
        trackedCompiler.rows.every((row) => row.emitted.length === 0),
    )
    observed.push([...names])
    return snapshot(names)
  })
  try {
    const mutable = { ...request }
    const pending = project.emit(source(), mutable)
    mutable.imported = 'Retargeted'
    const first = await pending
    const second = await project.emit(source(), { ...request, ...b })
    assert.deepEqual(
      observed,
      [['p-2', 'p-4']],
      'manifest candidates and actual IR share the existing context cache',
    )
    assert.equal(first.identity.imported, 'Sheet')
    assert.equal(first.identity.captureFingerprint, lease.capture.fingerprint)
    assert.equal(first.identity.instance, '/package')
    assert.equal(first.identity.owner, 'BottomSheet.handle')
    assert.equal(
      first.preview.contextFingerprint,
      prepareFinalTailwindContext(snapshot(['p-2', 'p-4'])).fingerprint,
    )
    assert.equal(second.identity.importer, b.importer)
    assert.match(first.preview.code, /hozoHandleStyle=\{/)
    assert.ok(trackedCompiler.rows.every((row) => row.disposed === 1 && row.emitted.length === 1))
    const exact = trackedCompiler.rows[0]!.emitted[0]
    assert.ok(trackedCompiler.rows.every((row) => row.emitted[0] === exact))
  } finally {
    project.invalidate()
  }
})

test('manifest invalidation aborts waiting IR promptly even when upstream preparation ignores its signal', async () => {
  const { epoch, lease, rows, capture } = fixture()
  const state = tracked(),
    wait = deferred()
  let signal: AbortSignal | undefined,
    names: readonly string[] = []
  const project = new InstanceOwnerCallerProject(lease, state.compiler, async (current, abort) => {
    names = current
    signal = abort
    wait.begin()
    return wait.pending
  })
  const pending = project.emit(source(), request)
  await wait.started
  const rejected = assert.rejects(pending, { code: 'TAILWIND_PROJECT_INVALIDATED' })
  const changed = structuredClone(rows)
  for (const row of changed) {
    if (row.status === 'resolved' && row.manifest.kind === 'present') row.manifest.text += ' '
  }
  assert.throws(() => epoch.adopt(capture(changed)), /INVALIDATED/)
  await rejected
  assert.ok(signal!.aborted)
  assert.ok(state.rows.every((row) => row.disposed === 1 && row.emitted.length === 0))
  wait.finish(snapshot(names))
  await Promise.resolve()
  await assert.rejects(project.emit(source(), request), /INVALIDATED/)
})

test('cache-hit synchronous emission is fenced before delivery when the manifest or CSS epoch retires', async () => {
  for (const target of ['manifest', 'css']) {
    const { epoch, lease } = fixture()
    const state = tracked()
    let prepares = 0
    const project = new InstanceOwnerCallerProject(lease, state.compiler, async (names) => {
      prepares++
      return snapshot(names)
    })
    await project.emit(source(), request)
    const pending = project.emit(source(), request)
    assert.equal(state.rows.length, 4)
    assert.ok(
      state.rows.every((row) => row.emitted.length === 1),
      'exercise an actual synchronous ready-context hit',
    )
    if (target === 'manifest') epoch.invalidate()
    else project.invalidate()
    await assert.rejects(pending, /INVALIDATED|invalidated/)
    assert.equal(prepares, 1)
    assert.ok(state.rows.every((row) => row.disposed === 1))
  }
})

test('new same-module requests supersede pending source, including rejected retargeting requests', async () => {
  for (const unassessed of [false, true]) {
    const { lease } = fixture()
    const state = tracked(),
      wait = deferred()
    let calls = 0,
      names: readonly string[] = []
    const project = new InstanceOwnerCallerProject(lease, state.compiler, async (current) => {
      if (++calls === 1) {
        names = current
        wait.begin()
        return wait.pending
      }
      return snapshot(current, 'b')
    })
    try {
      const first = project.emit(source(), request)
      await wait.started
      const superseded = assert.rejects(first, /SUPERSEDED|superseded/)
      const second = project.emit(
        source('p-4'),
        unassessed ? { ...request, entry: '/wrong/native.js' } : request,
      )
      const bad = unassessed ? assert.rejects(second, /UNASSESSED: entry-mismatch/) : undefined
      await superseded
      assert.ok(
        state.rows.slice(0, 2).every((row) => row.disposed === 1 && row.emitted.length === 0),
      )
      wait.finish(snapshot(names))
      if (bad) await bad
      else assert.match((await second).preview.code, /paddingTop: 16/)
    } finally {
      project.invalidate()
    }
  }
})

test('invalid new metadata also cancels older source for the same importer', async () => {
  const { lease } = fixture()
  const state = tracked(),
    wait = deferred()
  let names: readonly string[] = []
  const project = new InstanceOwnerCallerProject(lease, state.compiler, async (current) => {
    names = current
    wait.begin()
    return wait.pending
  })
  const pending = project.emit(source(), request)
  const stopped = assert.rejects(pending, /superseded|invalidated/i)
  await wait.started
  try {
    await assert.rejects(project.emit(source('p-4'), { ...request, entry: '' }), /INVALID_REQUEST/)
    await Promise.resolve()
    assert.ok(
      state.rows.every((row) => row.disposed === 1),
      'a rejected new request must not leave older source deliverable',
    )
  } finally {
    project.invalidate()
    wait.finish(snapshot(names))
    await stopped
  }
})

test('incomplete descriptors and unassessed metadata never fall back to direct output or leak IR', async () => {
  const { lease } = fixture()
  const state = tracked()
  const project = new InstanceOwnerCallerProject(lease, state.compiler, async () => snapshot([]))
  try {
    await assert.rejects(project.emit(source(), request), /did not collect/)
    assert.ok(state.rows.every((row) => row.disposed === 1 && row.emitted.length === 0))
    const count = state.rows.length
    await assert.rejects(
      project.emit(source(), { ...request, imported: 'Missing' }),
      /UNASSESSED: export-not-declared/,
    )
    assert.equal(state.rows.length, count)
  } finally {
    project.invalidate()
  }
  assert.throws(
    () =>
      new InstanceOwnerCallerProject(fixture('web').lease, state.compiler, async () =>
        snapshot([]),
      ),
    /NATIVE_PLATFORM_REQUIRED/,
  )
  assert.throws(
    () =>
      new InstanceOwnerCallerProject(fixture('ios', true).lease, state.compiler, async () =>
        snapshot([]),
      ),
    /PACKAGE_CHANNELS_INCOMPLETE/,
  )
})

test('opaque callers stay authored and replacement projects use their own captured context', async () => {
  const { lease } = fixture()
  for (const fingerprint of ['a', 'b']) {
    const state = tracked()
    const project = new InstanceOwnerCallerProject(lease, state.compiler, async (names) =>
      snapshot(names, fingerprint),
    )
    try {
      const input = source().replace('"p-2"', '{opaque()}')
      const result = await project.emit(input, request)
      assert.equal(result.preview.code, input)
      assert.equal(
        result.preview.contextFingerprint,
        prepareFinalTailwindContext(snapshot(['p-4'], fingerprint)).fingerprint,
      )
      assert.equal(result.preview.findings[0]!.reason, 'nonliteral')
      assert.equal(state.rows.length, 0)
    } finally {
      project.invalidate()
    }
  }
})
