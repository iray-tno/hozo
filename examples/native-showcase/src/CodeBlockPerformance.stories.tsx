import { CodeBlock } from '@hozo/patterns'
import type { CodeLine } from '@hozo/typography/code/model'
import type { Meta, StoryObj } from '@storybook/react-native'
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { FlatList, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native'
import { CODE_BLOCK_COUNTS, codeBlockEdit, codeBlockFixture } from './code-block-fixture'
import highlighted from './code-block-highlighted.json'

// A frame this late means the JS thread was busy; this many on time in a row
// means it is no longer, so a list still rendering batches has finished.
const BUSY_FRAME_MS = 34
const QUIET_FRAMES = 30
const SETTLE_TIMEOUT_MS = 15_000

// The floor under a CodeBlock: the same 1000 lines as one plain Text each, in
// the same scroller, measured in the same run so that the emulator's own cost,
// which moves about 2x between runs, can be told from the block's.
const plainStyle = { fontFamily: 'monospace', fontSize: 12, lineHeight: 18 } as const
const plainText = (line: CodeLine) =>
  typeof line.tokens === 'string' ? line.tokens : line.tokens.map((token) => token.text).join('')
const plainLine = ({ item }: { item: CodeLine }) => (
  <Text style={plainStyle}>{plainText(item)}</Text>
)

// The 1000-line block with one part of it taken away at a time, mounted in the
// same run as the whole block and the plain list, so the difference says what
// that part costs (#1420): the gutter (numbers and mark glyphs), the tokens as
// nested coloured Text, or both, which leaves the rows themselves.
//
// `highlighted` is the whole block again, drawing 1000 lines of Shiki's output
// for real source instead (#1431): neighbouring tokens there often draw the
// same, which the fixed fixture's never do.
//
// `unwrapped` is the whole block with `wrap` off, where every row is one line
// high and the gutter can be one column (#1432); `unwrapped-no-gutter` is
// that without the gutter, so the gutter's cost unwrapped can be told from
// that of the horizontal scroller.
const VARIANTS = [
  'no-gutter',
  'one-token',
  'bare',
  'highlighted',
  'unwrapped',
  'unwrapped-no-gutter',
] as const
type Variant = (typeof VARIANTS)[number]
const variantLines = (lines: CodeLine[], variant: Variant) =>
  variant === 'highlighted'
    ? (highlighted as CodeLine[])
    : variant === 'unwrapped'
      ? lines
      : lines.map((line) => ({
          tokens: variant.endsWith('no-gutter') ? line.tokens : plainText(line),
          mark: variant === 'one-token' ? line.mark : undefined,
        }))

function CodeBlockPerformance({ windowed = false }: { windowed?: boolean }) {
  // Story modules are imported by the ordinary showcase too. Allocate this
  // matrix only when the diagnostic is opened, before any measured input.
  const fixtures = useMemo(
    () =>
      new Map(
        CODE_BLOCK_COUNTS.map((count) => [
          count,
          [0, 1, 2, 3].map((tick) => codeBlockFixture(count, tick)),
        ]),
      ),
    [],
  )
  // One line changed after the last update, the rest the same objects, as an
  // editor or an incremental highlighter hands them over.
  const edits = useMemo(
    () =>
      new Map(
        CODE_BLOCK_COUNTS.map((count) => {
          const last = fixtures.get(count)?.[3] ?? []
          return [count, [1, 2, 3].map((edit) => codeBlockEdit(last, edit))]
        }),
      ),
    [fixtures],
  )
  const variants = useMemo(() => {
    const lines = fixtures.get(1000)?.[0] ?? []
    return new Map(VARIANTS.map((variant) => [variant, variantLines(lines, variant)]))
  }, [fixtures])
  const [selection, setSelection] = useState<{
    count: (typeof CODE_BLOCK_COUNTS)[number]
    tick: number
    edit: number
    baseline?: boolean
    variant?: Variant
  } | null>(null)
  const scroll = useRef<ScrollView>(null)
  const operation = useRef<{ name: string; started: number; gaps: number[]; last: number } | null>(
    null,
  )
  const frame = useRef<number | null>(null)
  const settling = useRef<number | null>(null)
  const offset = useRef(0)
  const maxOffset = useRef(0)
  const { height } = useWindowDimensions()

  const stop = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
  }, [])
  const stopSettling = useCallback(() => {
    if (settling.current !== null) cancelAnimationFrame(settling.current)
    settling.current = null
  }, [])
  // The first layout or commit is not the end of the work: a windowed list
  // keeps rendering batches after it. Watch from the operation's start until
  // the JS thread has been quiet for QUIET_FRAMES, and report when that began.
  const settle = useCallback(
    (name: string, started: number, before: number[]) => {
      stopSettling()
      let last = performance.now()
      let quietSince = last
      let quiet = 0
      // Late frames from the start, including those before the first boundary.
      let busyMs = before.filter((gap) => gap > BUSY_FRAME_MS).reduce((sum, gap) => sum + gap, 0)
      const next = () => {
        const now = performance.now()
        const gap = now - last
        last = now
        if (gap > BUSY_FRAME_MS) {
          busyMs += gap
          quiet = 0
          quietSince = now
        } else quiet++
        const timedOut = now - started > SETTLE_TIMEOUT_MS
        if (quiet < QUIET_FRAMES && !timedOut) {
          settling.current = requestAnimationFrame(next)
          return
        }
        settling.current = null
        console.info(
          '[Hozo CodeBlock timing]',
          JSON.stringify({
            name: `settle-${name}`,
            boundary: timedOut ? 'not-settled' : `quiet-${QUIET_FRAMES}-frames`,
            elapsedMs: quietSince - started,
            busyMs,
            rafCount: 0,
            rafChunks: 0,
          }),
        )
      }
      settling.current = requestAnimationFrame(next)
    },
    [stopSettling],
  )
  const begin = (name: string) => {
    stop()
    stopSettling()
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
      if (sample.name !== 'scroll') settle(sample.name, sample.started, sample.gaps)
    },
    [selection, stop, settle],
  )
  useLayoutEffect(() => {
    if (!selection || (selection.tick === 0 && selection.edit === 0)) return
    // This is a JS commit + two-rAF observation, not a GPU presentation fence.
    const first = requestAnimationFrame(() => {
      frame.current = requestAnimationFrame(() => finish('commit-plus-two-raf'))
    })
    return () => cancelAnimationFrame(first)
  }, [selection, finish])
  useLayoutEffect(
    () => () => {
      stop()
      stopSettling()
    },
    [stop, stopSettling],
  )
  const lines = selection
    ? selection.variant
      ? variants.get(selection.variant)
      : selection.edit
        ? edits.get(selection.count)?.[selection.edit - 1]
        : fixtures.get(selection.count)?.[selection.tick]
    : undefined

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
              setSelection({ count, tick: 0, edit: 0 })
            }}
          >
            <Text>{count} lines</Text>
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mount plain list"
          onPress={() => {
            begin('baseline-mount')
            setSelection({ count: 1000, tick: 0, edit: 0, baseline: true })
          }}
        >
          <Text>Plain list</Text>
        </Pressable>
        {VARIANTS.map((variant) => (
          <Pressable
            key={variant}
            accessibilityRole="button"
            accessibilityLabel={`Mount variant ${variant}`}
            onPress={() => {
              begin(`variant-${variant}-mount`)
              setSelection({ count: 1000, tick: 0, edit: 0, variant })
            }}
          >
            <Text>{variant}</Text>
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear block"
          onPress={() => {
            stop()
            stopSettling()
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
          accessibilityLabel="Edit one line"
          disabled={!selection || selection.tick < 3 || selection.edit >= 3}
          onPress={() => {
            if (!selection) return
            begin(`edit-${selection.count}-${selection.edit + 1}`)
            setSelection({ ...selection, edit: selection.edit + 1 })
          }}
        >
          <Text>Edit</Text>
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
      {windowed ? (
        // The block is the scroller here, so the outer ScrollView would only
        // be a second one around it. Its offset is not visible from outside;
        // the collector checks the screen instead.
        <View style={{ flex: 1 }}>
          {selection ? (
            <View
              key={selection.baseline ? 'baseline' : (selection.variant ?? selection.count)}
              onLayout={() => {
                if (/^(mount-|baseline-|variant-)/.test(operation.current?.name ?? ''))
                  finish('native-layout-callback')
              }}
            >
              {selection.baseline ? (
                <FlatList
                  data={lines}
                  keyExtractor={(_, index) => String(index)}
                  renderItem={plainLine}
                  style={{ maxHeight: height * 0.6 }}
                  nestedScrollEnabled
                />
              ) : (
                <CodeBlock
                  title={`${selection.count} lines, revision ${selection.tick}.${selection.edit}`}
                  lines={lines ?? []}
                  lineNumbers={
                    !selection.variant?.endsWith('no-gutter') && selection.variant !== 'bare'
                  }
                  wrap={!selection.variant?.startsWith('unwrapped')}
                  maxHeight={height * 0.6}
                  // Every size, so the matrix compares like with like; `auto`
                  // would leave the 10 and 100 line blocks whole.
                  windowing="on"
                  style={{
                    backgroundColor: '#f8fafc',
                    color: '#0f172a',
                    fontSize: 12,
                    lineHeight: 18,
                  }}
                />
              )}
            </View>
          ) : (
            <Text>Block cleared</Text>
          )}
        </View>
      ) : (
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
              key={selection.baseline ? 'baseline' : (selection.variant ?? selection.count)}
              onLayout={() => {
                if (/^(mount-|baseline-|variant-)/.test(operation.current?.name ?? ''))
                  finish('native-layout-callback')
              }}
            >
              {selection.baseline ? (
                <View>
                  {lines?.map((item) => (
                    // Every fixture line names its own index.
                    <Text key={plainText(item)} style={plainStyle}>
                      {plainText(item)}
                    </Text>
                  ))}
                </View>
              ) : (
                <CodeBlock
                  title={`${selection.count} lines, revision ${selection.tick}.${selection.edit}`}
                  lines={lines ?? []}
                  lineNumbers={
                    !selection.variant?.endsWith('no-gutter') && selection.variant !== 'bare'
                  }
                  wrap={!selection.variant?.startsWith('unwrapped')}
                  style={{
                    backgroundColor: '#f8fafc',
                    color: '#0f172a',
                    fontSize: 12,
                    lineHeight: 18,
                  }}
                />
              )}
            </View>
          ) : (
            <Text>Block cleared</Text>
          )}
        </ScrollView>
      )}
    </View>
  )
}
const meta = {
  title: 'Diagnostics/CodeBlock performance',
  component: CodeBlockPerformance,
} satisfies Meta<typeof CodeBlockPerformance>
export default meta
export const Matrix: StoryObj<typeof meta> = {}
export const Windowed: StoryObj<typeof meta> = { args: { windowed: true } }
