// React-level commit isolation only: no simulated Native layout or timing gate.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { createTextReference } from './text-inheritance-reference-core.ts'
import { loadTextInheritanceRuntime } from './text-inheritance-runtime-host.ts'

const require = createRequire(import.meta.url)
const React = require('react')
const renderer = require('react-test-renderer')
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const REST = {
  color: '#112233',
  fontSize: 20,
  fontWeight: '400',
  lineHeight: 28,
  letterSpacing: 1,
  textAlign: 'left',
  textTransform: 'uppercase',
}
const NEXT = {
  color: '#334455',
  fontSize: 28,
  fontWeight: '600',
  lineHeight: 40,
  letterSpacing: 2,
  textAlign: 'right',
  textTransform: 'lowercase',
}
const FINAL = {
  color: '#556677',
  fontSize: 24,
  fontWeight: '700',
  lineHeight: 32,
  letterSpacing: 3,
  textAlign: 'center',
  textTransform: 'capitalize',
}
const OWN = { color: '#abcdef', fontSize: 30 }
const flatten = (style: unknown): Record<string, unknown> =>
  Array.isArray(style)
    ? Object.assign({}, ...style.map(flatten))
    : style && typeof style === 'object'
      ? { ...style }
      : {}

function structure(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(structure)
  if (!node || typeof node !== 'object') return node
  const host = node as { type: string; props: { testID?: string }; children: unknown }
  return { type: host.type, testID: host.props.testID ?? null, children: structure(host.children) }
}

function gate() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return {
    open: false,
    promise,
    release() {
      this.open = true
      release()
    },
  }
}

function fixture(strict: boolean, runtime: boolean) {
  const legacy = React.createContext(16)
  const shipped = runtime
    ? loadTextInheritanceRuntime(legacy, { Text: 'ConcurrentText', View: 'ConcurrentView' })
    : null
  const api = shipped
    ? {
        ReferenceText: shipped.HozoInheritedText,
        ReferenceView: shipped.HozoInheritedView,
        useReferenceMetrics: () => React.useContext(shipped.HozoInheritedMetricsContext),
        useReferencePaint: () => React.useContext(shipped.HozoInheritedPaintContext),
      }
    : createTextReference({
        react: React,
        Text: 'ConcurrentText',
        View: 'ConcurrentView',
        HozoPressable: 'UnusedPressable',
        HozoTextSizeContext: legacy,
        HozoInteractionContext: React.createContext(null),
        flattenStyle: flatten,
      })
  const pending = gate()
  type Read = {
    id: string
    phase: string
    token: number
    metrics: ReturnType<typeof api.useReferenceMetrics>
    paint: ReturnType<typeof api.useReferencePaint>
    size: number
  }
  const reads: Read[] = [],
    commits: Read[] = []
  const lifetimes = { mounts: 0, unmounts: 0 }
  let nextToken = 0
  function Block({ phase }: { phase: string }) {
    if (phase === 'pending' && !pending.open) throw pending.promise
    return null
  }
  const Probe = React.memo(function Probe({ id, phase }: { id: string; phase: string }) {
    const metrics = api.useReferenceMetrics(),
      paint = api.useReferencePaint()
    const size = React.useContext(legacy)
    const [token] = React.useState(() => ++nextToken)
    const read = { id, phase, token, metrics, paint, size }
    // Render reads deliberately include speculative work. Only the layout
    // effect is a committed observation; never count these as equal evidence.
    reads.push(read)
    React.useLayoutEffect(() => {
      commits.push(read)
    })
    React.useEffect(() => {
      lifetimes.mounts++
      return () => {
        lifetimes.unmounts++
      }
    }, [])
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(api.ReferenceText, { testID: id }, 'Label'),
      React.createElement(Block, { phase }),
    )
  })
  const wrap = (child: unknown) =>
    React.createElement(
      strict ? React.StrictMode : React.Fragment,
      null,
      React.createElement(
        React.Suspense,
        { fallback: React.createElement('SuspenseFallback') },
        child,
      ),
    )
  const scene = (frame: object, phase: string, own?: object) =>
    wrap(
      React.createElement(
        api.ReferenceView,
        { style: frame },
        React.createElement(
          api.ReferenceView,
          { style: own },
          React.createElement(Probe, { id: 'target', phase }),
        ),
      ),
    )
  const outside = (phase: string) => wrap(React.createElement(Probe, { id: 'outside', phase }))
  const targetCommits = () => commits.filter((entry) => entry.id === 'target')
  const values = (entry: Read) => ({ ...entry.metrics, ...entry.paint, legacySize: entry.size })
  const host = (tree: ReturnType<typeof renderer.create>) =>
    tree.root.findAll(
      (node: { type: unknown; props: { testID?: string } }) =>
        node.type === 'ConcurrentText' && node.props.testID === 'target',
    )[0]
  let tree: ReturnType<typeof renderer.create>, other: ReturnType<typeof renderer.create>
  return {
    pending,
    reads,
    commits,
    lifetimes,
    targetCommits,
    values,
    get current() {
      return targetCommits().at(-1)!
    },
    get host() {
      return host(tree)
    },
    get structure() {
      return structure(tree.toJSON())
    },
    async mount(own?: object) {
      await renderer.act(async () => {
        tree = renderer.create(scene(REST, 'initial', own))
        other = renderer.create(outside('initial'))
      })
    },
    async suspend(own?: object) {
      await renderer.act(async () => {
        React.startTransition(() => tree.update(scene(NEXT, 'pending', own)))
      })
      assert.ok(
        reads.some((entry) => entry.id === 'target' && entry.phase === 'pending'),
        'must actually render the suspended frame',
      )
      assert.equal(
        tree.root.findAllByType('SuspenseFallback').length,
        0,
        'transition keeps the old content visible',
      )
    },
    async checkOutside() {
      // Force an unrelated root to read during the pending transition, rather
      // than claiming isolation from an old snapshot that never ran again.
      await renderer.act(async () => other.update(outside('reread')))
      const read = commits.filter((entry) => entry.id === 'outside').at(-1)!
      assert.equal(read.phase, 'reread')
      assert.deepEqual(values(read), { legacySize: 16 })
    },
    async supersede() {
      await renderer.act(async () => tree.update(scene(FINAL, 'final')))
    },
    async release() {
      await renderer.act(async () => {
        pending.release()
        await pending.promise
      })
    },
    async cleanup() {
      await renderer.act(async () => {
        pending.release()
        tree?.unmount()
        other?.unmount()
      })
    },
  }
}

for (const runtime of [false, true])
  for (const strict of [false, true]) {
    test(`a suspended frame commits atomically only after release; strict=${strict}, shipped=${runtime}`, async () => {
      const f = fixture(strict, runtime)
      try {
        await f.mount()
        const initial = f.current,
          host = f.host,
          lifetime = { ...f.lifetimes }
        const committed = f.targetCommits().length
        const grouped = f.structure
        await f.suspend()
        const speculative = f.reads.find(
          (entry) => entry.id === 'target' && entry.phase === 'pending',
        )!
        assert.deepEqual(f.values(speculative), { ...NEXT, legacySize: 28 })
        assert.notEqual(speculative.metrics, initial.metrics)
        assert.notEqual(speculative.paint, initial.paint)
        assert.equal(Object.isFrozen(initial.metrics), true)
        assert.equal(Object.isFrozen(initial.paint), true)
        assert.equal(f.targetCommits().length, committed)
        assert.deepEqual(f.values(initial), { ...REST, legacySize: 20 })
        assert.deepEqual(flatten(f.host.props.style), REST)
        assert.deepEqual(f.structure, grouped)
        await f.checkOutside()
        await f.release()
        assert.equal(f.current.phase, 'pending')
        assert.deepEqual(f.values(f.current), { ...NEXT, legacySize: 28 })
        assert.deepEqual(flatten(f.host.props.style), NEXT)
        assert.equal(f.current.token, initial.token)
        assert.equal(f.host, host)
        assert.deepEqual(f.structure, grouped)
        assert.deepEqual(
          f.lifetimes,
          lifetime,
          'StrictMode replay is in the baseline, not a new mount',
        )
      } finally {
        await f.cleanup()
      }
      assert.equal(f.lifetimes.mounts, f.lifetimes.unmounts)
    })

    test(`an abandoned frame cannot overwrite a newer commit when its promise resolves; strict=${strict}, shipped=${runtime}`, async () => {
      const f = fixture(strict, runtime)
      try {
        await f.mount()
        const initial = f.current,
          host = f.host,
          lifetime = { ...f.lifetimes }
        const grouped = f.structure
        await f.suspend()
        await f.checkOutside()
        await f.supersede()
        assert.equal(f.current.phase, 'final')
        assert.deepEqual(f.values(f.current), { ...FINAL, legacySize: 24 })
        await f.release()
        assert.equal(f.current.phase, 'final')
        assert.deepEqual(f.values(f.current), { ...FINAL, legacySize: 24 })
        assert.deepEqual(flatten(f.host.props.style), FINAL)
        assert.ok(
          f.targetCommits().every((entry) => entry.phase !== 'pending'),
          'speculative reads are not commits',
        )
        assert.equal(f.current.token, initial.token)
        assert.equal(f.host, host)
        assert.deepEqual(f.structure, grouped)
        assert.deepEqual(f.lifetimes, lifetime)
      } finally {
        await f.cleanup()
      }
      assert.equal(f.lifetimes.mounts, f.lifetimes.unmounts)
    })

    test(`removing an override during suspension preserves old committed values until the inherited frame commits; strict=${strict}, shipped=${runtime}`, async () => {
      const f = fixture(strict, runtime)
      try {
        await f.mount(OWN)
        const initial = f.current,
          host = f.host,
          lifetime = { ...f.lifetimes }
        const committed = f.targetCommits().length
        const grouped = f.structure
        await f.suspend()
        assert.equal(f.targetCommits().length, committed)
        assert.deepEqual(f.values(initial), { ...REST, ...OWN, legacySize: 30 })
        assert.deepEqual(flatten(f.host.props.style), { ...REST, ...OWN })
        await f.release()
        assert.deepEqual(f.values(f.current), { ...NEXT, legacySize: 28 })
        assert.deepEqual(flatten(f.host.props.style), NEXT)
        assert.equal(f.current.token, initial.token)
        assert.equal(f.host, host)
        assert.deepEqual(f.structure, grouped)
        assert.deepEqual(f.lifetimes, lifetime)
      } finally {
        await f.cleanup()
      }
      assert.equal(f.lifetimes.mounts, f.lifetimes.unmounts)
    })
  }
