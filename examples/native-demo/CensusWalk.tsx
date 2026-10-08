// What TalkBack says for elements a person reads but does not operate.
//
// The TalkBack harness moves with Tab, so it hears controls and nothing else:
// a heading, a meter, a count badge and a skeleton are never focused, and
// driving TalkBack's own linear navigation from outside was tried five ways
// and never answered (`android-talkback.sh`). So the app moves the focus
// itself, through the same `moveAccessibilityFocus` the Dialog uses, and
// TalkBack reads each element as it lands.
//
// Opened by `hozonativedemo://census`, which the harness sends with
// `am start` -- under TalkBack a tap is touch exploration, not a press. Each
// step logs `[hozo-census] <name>` before it moves, so the harness can lay
// TalkBack's utterances against the elements by time. Logged, not announced:
// an announcement would itself be what TalkBack says.

import { Badge, Heading, Meter, Paragraph, Progress, Skeleton, View } from '@hozo/core'
import { moveAccessibilityFocus } from '@hozo/native'
import { type ComponentRef, useEffect, useRef } from 'react'
import { AccessibilityInfo, findNodeHandle } from 'react-native'

type Target = ComponentRef<typeof View>

/** Long enough for TalkBack to finish reading one element before the next. */
const STEP_MS = 3000
/** For the screen's own announcement to finish before the first step. */
const SETTLE_MS = 4000

const NAMES = [
  'heading',
  'paragraph',
  'meter',
  'badge-count',
  'badge-word',
  'progress',
  'skeleton',
] as const

function focus(target: Target | null) {
  if (!target) return
  if (moveAccessibilityFocus) {
    void moveAccessibilityFocus(target)
    return
  }
  const tag = findNodeHandle(target)
  if (tag != null) AccessibilityInfo.setAccessibilityFocus(tag)
}

export default function CensusWalk() {
  const refs = useRef<Record<string, Target | null>>({})
  const bind = (name: (typeof NAMES)[number]) => (node: Target | null) => {
    refs.current[name] = node
  }

  useEffect(() => {
    let cancelled = false
    const timers: ReturnType<typeof setTimeout>[] = []
    NAMES.forEach((name, index) => {
      timers.push(
        setTimeout(
          () => {
            if (cancelled) return
            console.info(`[hozo-census] ${name}`)
            focus(refs.current[name] ?? null)
          },
          SETTLE_MS + index * STEP_MS,
        ),
      )
    })
    timers.push(
      setTimeout(
        () => {
          if (!cancelled) console.info('[hozo-census] done')
        },
        SETTLE_MS + NAMES.length * STEP_MS,
      ),
    )
    return () => {
      cancelled = true
      for (const timer of timers) clearTimeout(timer)
    }
  }, [])

  return (
    <View className="flex-1 gap-4 bg-white p-6 pt-16">
      {/* @ts-expect-error -- the compiler passes `ref` through to the host element; the props types do not list it. */}
      <Heading level={1} ref={bind('heading')} className="text-2xl font-bold">
        Census walk
      </Heading>
      {/* @ts-expect-error -- the compiler passes `ref` through to the host element; the props types do not list it. */}
      <Paragraph ref={bind('paragraph')}>Elements a person reads but does not operate.</Paragraph>
      {/* @ts-expect-error -- the compiler passes `ref` through to the host element; the props types do not list it. */}
      <Meter ref={bind('meter')} value={0.6} accessibilityLabel="Disk usage" />
      <Badge
        // @ts-expect-error -- the compiler passes `ref` through to the host element; the props types do not list it.
        ref={bind('badge-count')}
        count={3}
        accessibilityLabel="3 unread messages"
        className="self-start rounded-full bg-red-600 px-2 text-white"
      />
      {/* @ts-expect-error -- the compiler passes `ref` through to the host element; the props types do not list it. */}
      <Badge ref={bind('badge-word')} className="self-start rounded bg-slate-200 px-2">
        Draft
      </Badge>
      {/* @ts-expect-error -- the compiler passes `ref` through to the host element; the props types do not list it. */}
      <Progress ref={bind('progress')} value={40} max={100} accessibilityLabel="Upload" />
      {/* @ts-expect-error -- the compiler passes `ref` through to the host element; the props types do not list it. */}
      <Skeleton ref={bind('skeleton')} className="h-4 w-48 rounded bg-slate-200 animate-pulse" />
    </View>
  )
}
