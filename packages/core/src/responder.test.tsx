// Turning a responder off has to let go of the pointer.
//
// `useResponderDomProps` returns `{}` when `enabled` is false -- no
// handlers at all -- so an element that had captured a pointer keeps the
// capture with nothing left that could release it. The release is the
// effect's cleanup, and `enabled` in its dependency list is what makes
// the cleanup run on the change rather than only on unmount.
//
// `enabled` is not read inside the effect, so `useExhaustiveDependencies`
// calls it unnecessary and `biome check --unsafe` offers to remove it. It
// did, once, and nothing here noticed: this file is what noticed the
// second time.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { HozoScrollView } from '@hozo/primitives'
import {
  HozoPressable,
  HozoTouchableOpacity,
  HozoTouchableWithoutFeedback,
  HozoView,
} from '@hozo/runtime'
import { type ReactElement, type RefObject, useRef } from 'react'

import { type ResponderProps, useResponderDomProps } from './responder.ts'

const require = createRequire(import.meta.url)
const testRenderer = require('react-test-renderer') as {
  create: (
    element: unknown,
    options?: { createNodeMock?: () => unknown },
  ) => {
    root: { findAllByType: (type: string) => { props: Record<string, unknown> }[] }
    update: (element: unknown) => void
    unmount: () => void
  }
  act(callback: () => void): void
}

/** Enough of an element for the responder: it captures and reports. */
function element() {
  const captured = new Set<number>()
  const released: number[] = []
  return {
    released,
    node: {
      setPointerCapture: (id: number) => captured.add(id),
      hasPointerCapture: (id: number) => captured.has(id),
      releasePointerCapture: (id: number) => {
        captured.delete(id)
        released.push(id)
      },
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
    },
  }
}

/** Enough of a pointer event for one press. */
const press = (node: unknown, pointerId = 1, isPrimary = true, pageX = 0, pageY = 0) => ({
  isPrimary,
  pointerId,
  clientX: pageX,
  clientY: pageY,
  pageX,
  pageY,
  timeStamp: 0,
  target: node,
  currentTarget: node,
  nativeEvent: {},
  preventDefault: () => undefined,
  stopPropagation: () => undefined,
})

type Handlers = {
  onPointerDown?: (event: ReturnType<typeof press>) => void
  onPointerDownCapture?: (event: ReturnType<typeof press>) => void
  onPointerMove?: (event: ReturnType<typeof press>) => void
  onPointerUp?: (event: ReturnType<typeof press>) => void
}

function ResponderProbe({
  surface,
  responderProps,
  receive,
}: {
  surface: ReturnType<typeof element>
  responderProps: ResponderProps
  receive: (handlers: Handlers) => void
}) {
  const ref = useRef(surface.node) as unknown as RefObject<HTMLElement | null>
  receive(useResponderDomProps(ref, responderProps) as Handlers)
  return null
}

test('a responder that is turned off releases the pointer it had', () => {
  const surface = element()
  let handlers: Handlers = {}

  function Probe({ enabled }: { enabled: boolean }) {
    const ref = useRef(surface.node) as unknown as RefObject<HTMLElement | null>
    const props: ResponderProps = { onStartShouldSetResponder: () => true }
    handlers = useResponderDomProps(ref, props, enabled) as Handlers
    return null
  }

  let root: ReturnType<typeof testRenderer.create> | undefined
  testRenderer.act(() => {
    root = testRenderer.create(<Probe enabled={true} />)
  })
  assert.ok(root)
  const mounted = root

  testRenderer.act(() => {
    handlers.onPointerDown?.(press(surface.node))
  })
  assert.deepEqual(surface.released, [], 'the press released the pointer instead of taking it')

  // The handlers go away here, so this is the last moment anything could.
  testRenderer.act(() => {
    mounted.update(<Probe enabled={false} />)
  })
  assert.deepEqual(surface.released, [1], 'a disabled responder kept the pointer capture')

  testRenderer.act(() => {
    mounted.unmount()
  })
})

test('capture negotiation carries move and release through the shared machine', () => {
  const surface = element()
  const calls: string[] = []
  let handlers: Handlers = {}
  let movedPageX = 0
  let root: ReturnType<typeof testRenderer.create> | undefined

  testRenderer.act(() => {
    root = testRenderer.create(
      <ResponderProbe
        surface={surface}
        responderProps={{
          onStartShouldSetResponderCapture: () => true,
          onResponderGrant: () => calls.push('grant'),
          onResponderStart: () => calls.push('start'),
          onResponderMove: (event) => {
            calls.push('move')
            movedPageX = event.nativeEvent.pageX
          },
          onResponderEnd: () => calls.push('end'),
          onResponderRelease: () => calls.push('release'),
        }}
        receive={(next) => {
          handlers = next
        }}
      />,
    )
  })
  assert.ok(root)
  const mounted = root

  testRenderer.act(() => {
    handlers.onPointerDownCapture?.(press(surface.node))
    handlers.onPointerMove?.(press(surface.node, 1, true, 12, 4))
    handlers.onPointerUp?.(press(surface.node, 1, true, 12, 4))
  })
  assert.equal(movedPageX, 12)
  assert.deepEqual(calls, ['grant', 'start', 'move', 'end', 'release'])

  testRenderer.act(() => mounted.unmount())
})

test('responder transfer asks the incumbent, rejects, then terminates when allowed', () => {
  const first = element()
  const second = element()
  const calls: string[] = []
  let firstHandlers: Handlers = {}
  let secondHandlers: Handlers = {}
  let allowTransfer = false
  let root: ReturnType<typeof testRenderer.create> | undefined

  const render = () => (
    <>
      <ResponderProbe
        surface={first}
        responderProps={{
          onStartShouldSetResponder: () => true,
          onResponderGrant: () => calls.push('first:grant'),
          onResponderTerminate: () => calls.push('first:terminate'),
          onResponderTerminationRequest: () => allowTransfer,
        }}
        receive={(next) => {
          firstHandlers = next
        }}
      />
      <ResponderProbe
        surface={second}
        responderProps={{
          onStartShouldSetResponder: () => true,
          onResponderGrant: () => calls.push('second:grant'),
          onResponderReject: () => calls.push('second:reject'),
        }}
        receive={(next) => {
          secondHandlers = next
        }}
      />
    </>
  )

  testRenderer.act(() => {
    root = testRenderer.create(render())
  })
  assert.ok(root)
  const mounted = root
  testRenderer.act(() => {
    firstHandlers.onPointerDown?.(press(first.node, 1))
    secondHandlers.onPointerDown?.(press(second.node, 2))
    secondHandlers.onPointerUp?.(press(second.node, 2))
  })
  assert.deepEqual(calls, ['first:grant', 'second:reject'])

  allowTransfer = true
  testRenderer.act(() => mounted.update(render()))
  testRenderer.act(() => {
    secondHandlers.onPointerDown?.(press(second.node, 3))
  })
  assert.deepEqual(calls, ['first:grant', 'second:reject', 'first:terminate', 'second:grant'])
  assert.deepEqual(first.released, [1])

  testRenderer.act(() => {
    firstHandlers.onPointerUp?.(press(first.node, 1))
    secondHandlers.onPointerUp?.(press(second.node, 3))
    mounted.unmount()
  })
})

test('one responder keeps every active pointer until the final release', () => {
  const surface = element()
  const calls: string[] = []
  let handlers: Handlers = {}
  let root: ReturnType<typeof testRenderer.create> | undefined

  testRenderer.act(() => {
    root = testRenderer.create(
      <ResponderProbe
        surface={surface}
        responderProps={{
          onStartShouldSetResponder: () => true,
          onResponderStart: () => calls.push('start'),
          onResponderEnd: () => calls.push('end'),
          onResponderRelease: () => calls.push('release'),
        }}
        receive={(next) => {
          handlers = next
        }}
      />,
    )
  })
  assert.ok(root)
  const mounted = root
  testRenderer.act(() => {
    handlers.onPointerDown?.(press(surface.node, 10))
    handlers.onPointerDown?.(press(surface.node, 11, false))
    handlers.onPointerUp?.(press(surface.node, 10))
  })
  assert.deepEqual(calls, ['start', 'start', 'end'])

  testRenderer.act(() => {
    handlers.onPointerUp?.(press(surface.node, 11, false))
  })
  assert.deepEqual(calls, ['start', 'start', 'end', 'end', 'release'])

  testRenderer.act(() => mounted.unmount())
})

const responderBridges: readonly [string, (props: ResponderProps) => ReactElement][] = [
  ['View', (props) => <HozoView {...props} />],
  ['Pressable', (props) => <HozoPressable {...props} />],
  ['TouchableOpacity', (props) => <HozoTouchableOpacity {...props} />],
  ['ScrollView', (props) => <HozoScrollView {...props} />],
  [
    'TouchableWithoutFeedback',
    (props) => (
      <HozoTouchableWithoutFeedback {...props}>
        <div />
      </HozoTouchableWithoutFeedback>
    ),
  ],
]

for (const [name, renderBridge] of responderBridges) {
  test(`${name} carries the shared responder lifecycle without leaking Native props`, () => {
    const surface = element()
    const calls: string[] = []
    let root: ReturnType<typeof testRenderer.create> | undefined

    testRenderer.act(() => {
      root = testRenderer.create(
        renderBridge({
          onStartShouldSetResponder: () => true,
          onResponderGrant: () => calls.push('grant'),
          onResponderStart: () => calls.push('start'),
          onResponderEnd: () => calls.push('end'),
          onResponderRelease: () => calls.push('release'),
        }),
        { createNodeMock: () => surface.node },
      )
    })
    assert.ok(root)
    const mounted = root
    const host = mounted.root.findAllByType('div')[0]!
    assert.deepEqual(
      Object.keys(host.props).filter(
        (key) => key.startsWith('onResponder') || key.includes('ShouldSetResponder'),
      ),
      [],
    )

    testRenderer.act(() => {
      const handlers = host.props as Handlers
      handlers.onPointerDown?.(press(surface.node))
      handlers.onPointerUp?.(press(surface.node))
    })
    assert.deepEqual(calls, ['grant', 'start', 'end', 'release'])

    testRenderer.act(() => mounted.unmount())
  })
}

test('a ScrollView without a responder contract adds no pointer negotiation handlers', () => {
  let root: ReturnType<typeof testRenderer.create> | undefined
  testRenderer.act(() => {
    root = testRenderer.create(<HozoScrollView />)
  })
  assert.ok(root)
  const mounted = root
  const host = mounted.root.findAllByType('div')[0]!
  assert.equal(host.props.onPointerDown, undefined)
  assert.equal(host.props.onPointerDownCapture, undefined)
  assert.equal(host.props.onPointerMove, undefined)
  assert.equal(host.props.onPointerMoveCapture, undefined)
  assert.equal(host.props.onPointerUp, undefined)

  testRenderer.act(() => mounted.unmount())
})
