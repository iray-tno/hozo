import { CodeBlock } from '@hozo/patterns'
import type { Meta, StoryObj } from '@storybook/react-native'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { CODE_BLOCK_COUNTS, codeBlockFixture } from './code-block-fixture'

const fixtures = new Map(
  CODE_BLOCK_COUNTS.map((count) => [
    count,
    [0, 1, 2, 3].map((tick) => codeBlockFixture(count, tick)),
  ]),
)

function CodeBlockPerformance() {
  const [selection, setSelection] = useState<{
    count: (typeof CODE_BLOCK_COUNTS)[number]
    tick: number
  } | null>(null)
  const scroll = useRef<ScrollView>(null)
  const operation = useRef<{ name: string; started: number; gaps: number[]; last: number } | null>(
    null,
  )
  const frame = useRef<number | null>(null)
  const offset = useRef(0)
  const maxOffset = useRef(0)

  const stop = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
  }, [])
  const begin = (name: string) => {
    stop()
    const started = performance.now()
    const sample = { name, started, last: started, gaps: [] as number[] }
    operation.current = sample
    const next = () => {
      const now = performance.now()
      sample.gaps.push(now - sample.last)
      sample.last = now
      frame.current = requestAnimationFrame(next)
    }
    frame.current = requestAnimationFrame(next)
  }
  const finish = useCallback(
    (boundary: string) => {
      const sample = operation.current
      if (!sample) return
      stop()
      // Android's log entry limit is smaller than a long scroll's raw samples.
      // Keep every sample in bounded records instead of truncating a JSON line.
      for (let at = 0; at < sample.gaps.length; at += 64)
        console.info(
          '[Hozo CodeBlock raf]',
          JSON.stringify({
            name: sample.name,
            chunk: at / 64,
            gaps: sample.gaps.slice(at, at + 64),
          }),
        )
      console.info(
        '[Hozo CodeBlock timing]',
        JSON.stringify({
          name: sample.name,
          boundary,
          elapsedMs: performance.now() - sample.started,
          rafCount: sample.gaps.length,
          rafChunks: Math.ceil(sample.gaps.length / 64),
          offset: offset.current,
          maxOffset: maxOffset.current,
          ...selection,
        }),
      )
      operation.current = null
    },
    [selection, stop],
  )
  useLayoutEffect(() => {
    if (!selection || selection.tick === 0) return
    // This is a JS commit + two-rAF observation, not a GPU presentation fence.
    const first = requestAnimationFrame(() => {
      frame.current = requestAnimationFrame(() => finish('commit-plus-two-raf'))
    })
    return () => cancelAnimationFrame(first)
  }, [selection, finish])
  useLayoutEffect(() => () => stop(), [stop])

  return (
    <View style={{ flex: 1, gap: 8 }}>
      <Text>CodeBlock performance probe</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {CODE_BLOCK_COUNTS.map((count) => (
          <Pressable
            key={count}
            accessibilityRole="button"
            accessibilityLabel={`Mount ${count} lines`}
            onPress={() => {
              begin(`mount-${count}`)
              setSelection({ count, tick: 0 })
            }}
          >
            <Text>{count} lines</Text>
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear block"
          onPress={() => {
            stop()
            operation.current = null
            setSelection(null)
          }}
        >
          <Text>Clear</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Update block"
          disabled={!selection || selection.tick >= 3}
          onPress={() => {
            if (!selection) return
            begin(`update-${selection.count}-${selection.tick + 1}`)
            setSelection({ ...selection, tick: selection.tick + 1 })
          }}
        >
          <Text>Update</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Start scroll measurement"
          onPress={() => {
            scroll.current?.scrollTo({ y: 0, animated: false })
            offset.current = 0
            maxOffset.current = 0
            begin('scroll')
          }}
        >
          <Text>Start scroll</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Finish scroll measurement"
          onPress={() => finish('scroll-input-window')}
        >
          <Text>Finish scroll</Text>
        </Pressable>
      </View>
      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        scrollEventThrottle={16}
        onScroll={(event) => {
          offset.current = event.nativeEvent.contentOffset.y
          maxOffset.current = Math.max(maxOffset.current, offset.current)
        }}
      >
        {selection ? (
          <View
            key={selection.count}
            onLayout={() => {
              if (operation.current?.name.startsWith('mount-')) finish('native-layout-callback')
            }}
          >
            <CodeBlock
              title={`${selection.count} lines, revision ${selection.tick}`}
              lines={fixtures.get(selection.count)?.[selection.tick] ?? []}
              lineNumbers
              wrap
              style={{ backgroundColor: '#f8fafc', color: '#0f172a', fontSize: 12, lineHeight: 18 }}
            />
          </View>
        ) : (
          <Text>Block cleared</Text>
        )}
      </ScrollView>
    </View>
  )
}
const meta = {
  title: 'Diagnostics/CodeBlock performance',
  component: CodeBlockPerformance,
} satisfies Meta<typeof CodeBlockPerformance>
export default meta
export const Matrix: StoryObj<typeof meta> = {}
