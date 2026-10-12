import { Canvas, type CanvasPressEvent } from '@hozo/canvas'
import {
  Button,
  Heading,
  Paragraph,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
  View,
} from '@hozo/core'
import { useState } from 'react'

// The /canvas/ demo: one data series, drawn by `@hozo/canvas` and read by a
// screen reader from a table built out of the same rows.
//
// The previous workbench drew with the raw Canvas 2D API and only claimed to
// be `@hozo/canvas`, and its "sibling table" showed eight candlesticks
// whatever the canvas was drawing. Here the chart and the table cannot
// disagree, because neither is derived from the other: both read `DAYS`.

export interface Day {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

/**
 * Twenty trading days, generated once from a fixed seed so the server render,
 * the hydrated chart and the fallback table are the same numbers.
 */
export const DAYS: readonly Day[] = (() => {
  let seed = 7
  const random = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  const days: Day[] = []
  let price = 182
  for (let i = 0; i < 20; i++) {
    const open = price
    const close = Math.round(open + (random() - 0.46) * 10)
    days.push({
      date: `Sep ${i + 1 + Math.floor(i / 5) * 2}`,
      open,
      high: Math.max(open, close) + Math.round(random() * 5) + 1,
      low: Math.min(open, close) - Math.round(random() * 5) - 1,
      close,
      volume: Math.round(6000 + random() * 14000),
    })
    price = close
  }
  return days
})()

const WIDTH = 800
const HEIGHT = 400
// Wide enough for a price label at the largest size `labelSize` picks.
const LEFT = 76
const RIGHT = 788
const PRICE_TOP = 24
const PRICE_BOTTOM = 290
const VOLUME_TOP = 316
const VOLUME_BOTTOM = 380
const UP = '#708260'
const DOWN = '#c0584a'

const low = Math.floor(Math.min(...DAYS.map((day) => day.low)) / 5) * 5
const high = Math.ceil(Math.max(...DAYS.map((day) => day.high)) / 5) * 5
const maxVolume = Math.max(...DAYS.map((day) => day.volume))
const slot = (RIGHT - LEFT) / DAYS.length
const priceY = (price: number) =>
  PRICE_BOTTOM - ((price - low) / (high - low)) * (PRICE_BOTTOM - PRICE_TOP)
const ticks = Array.from({ length: (high - low) / 10 + 1 }, (_, i) => low + i * 10)

const money = (value: number) => `$${value}`
const summary = (day: Day) =>
  `${day.date}: opened ${money(day.open)}, closed ${money(day.close)}, high ${money(day.high)}, low ${money(day.low)}`

export function CandleChart() {
  const [indicated, setIndicated] = useState<{ index: number; event: CanvasPressEvent }>()
  const [pinned, setPinned] = useState<number>()
  const [showFallback, setShowFallback] = useState(false)
  // The scene is drawn in viewBox units and scaled to the surface, so a fixed
  // font size is unreadable on a phone. Keep labels near 11 CSS pixels.
  const [labelSize, setLabelSize] = useState(12)
  const shown = indicated?.index ?? pinned
  const day = shown === undefined ? undefined : DAYS[shown]
  const first = DAYS[0]
  const last = DAYS[DAYS.length - 1]
  const label = `Daily price, ${first.date} to ${last.date}: ${money(first.open)} to ${money(last.close)}`

  return (
    <View className="mb-16 rounded-2xl border border-hinoki/18 bg-yakisugi-950 overflow-hidden shadow-2xl">
      <View className="p-4 sm:p-6 border-b border-hinoki/18 bg-yakisugi-900/60 gap-1">
        <Heading level={2} className="text-lg font-bold text-shikkui">
          One series, drawn and read
        </Heading>
        <Paragraph className="text-xs text-stone-400">
          Point at a day, hold it on a touch screen, or Tab to it: each candle is a shape with its
          own hit area and its own hidden button.
        </Paragraph>
      </View>

      <View className="relative bg-[#0d0c0a]">
        <Canvas
          viewBox={[0, 0, WIDTH, HEIGHT]}
          style={{ width: '100%', height: 'auto', aspectRatio: `${WIDTH} / ${HEIGHT}` }}
          accessibilityLabel={label}
          accessibleFallback={<DayTable caption={label} />}
          onSizeChange={({ width }) =>
            setLabelSize(Math.min(26, Math.max(12, Math.round((11 * WIDTH) / Math.max(width, 1)))))
          }
        >
          {ticks.map((tick) => (
            <Canvas.Group key={tick}>
              <Canvas.Line
                x1={LEFT}
                x2={RIGHT}
                y1={priceY(tick)}
                y2={priceY(tick)}
                stroke="rgba(200, 168, 130, 0.08)"
              />
              <Canvas.Text
                text={money(tick)}
                x={6}
                y={priceY(tick) + labelSize / 3}
                fontSize={labelSize}
                fontFamily="monospace"
                fill="#8a8274"
              />
            </Canvas.Group>
          ))}
          {DAYS.map((entry, index) => {
            const center = LEFT + slot * index + slot / 2
            const up = entry.close >= entry.open
            const colour = up ? UP : DOWN
            const volumeHeight = (entry.volume / maxVolume) * (VOLUME_BOTTOM - VOLUME_TOP)
            const top = priceY(Math.max(entry.open, entry.close))
            const active = shown === index
            // Wick and body are two shapes and one thing to press: one
            // control id gives them one hidden button between them.
            const control = {
              accessibilityControlId: entry.date,
              accessibilityLabel: summary(entry),
              onPress: () => setPinned((current) => (current === index ? undefined : index)),
              onActiveChange: (event: CanvasPressEvent | undefined) =>
                setIndicated((current) =>
                  event ? { index, event } : current?.index === index ? undefined : current,
                ),
            }
            return (
              <Canvas.Group key={entry.date}>
                {active ? (
                  <Canvas.Rect
                    x={LEFT + slot * index}
                    y={PRICE_TOP - 8}
                    width={slot}
                    height={VOLUME_BOTTOM - PRICE_TOP + 8}
                    fill="rgba(200, 168, 130, 0.08)"
                  />
                ) : null}
                <Canvas.Rect
                  x={center - slot * 0.3}
                  y={VOLUME_BOTTOM - volumeHeight}
                  width={slot * 0.6}
                  height={volumeHeight}
                  fill={up ? 'rgba(112, 130, 96, 0.35)' : 'rgba(192, 88, 74, 0.35)'}
                />
                <Canvas.Line
                  x1={center}
                  x2={center}
                  y1={priceY(entry.high)}
                  y2={priceY(entry.low)}
                  stroke={colour}
                  strokeWidth={2}
                  {...control}
                />
                <Canvas.Rect
                  x={center - slot * 0.32}
                  y={top}
                  width={slot * 0.64}
                  height={Math.max(2, Math.abs(priceY(entry.open) - priceY(entry.close)))}
                  fill={colour}
                  {...control}
                />
              </Canvas.Group>
            )
          })}
        </Canvas>

        {day ? (
          <View
            aria-hidden
            className="absolute top-3 right-3 p-3 rounded-xl bg-yakisugi-900/95 border border-hinoki/35 font-mono text-xs shadow-2xl pointer-events-none gap-1"
          >
            <Text className="font-bold text-shikkui">{day.date}</Text>
            <Text className="text-stone-300">
              O {money(day.open)} · C{' '}
              <Text className={day.close >= day.open ? 'text-tatami-light' : 'text-[#e07a6c]'}>
                {money(day.close)}
              </Text>
            </Text>
            <Text className="text-stone-400">
              H {money(day.high)} · L {money(day.low)}
            </Text>
            <Text className="text-hinoki">Vol {day.volume.toLocaleString('en-US')}</Text>
          </View>
        ) : null}
      </View>

      <View className="p-4 sm:p-5 border-t border-hinoki/18 bg-yakisugi-900/60 gap-4">
        <View className="flex flex-row flex-wrap items-center justify-between gap-3">
          <Paragraph className="text-xs text-stone-400 shrink">
            A screen reader is given the table below instead of the pixels. It is in the page either
            way; this only makes it visible.
          </Paragraph>
          <Button
            onPress={() => setShowFallback((current) => !current)}
            className="px-3 py-1.5 rounded-lg bg-tatami/20 text-tatami-light border border-tatami/40 hover:bg-tatami/30 text-xs font-semibold"
          >
            {showFallback ? 'Hide the screen-reader table' : 'Show the screen-reader table'}
          </Button>
        </View>
        {/* The same component the Canvas hands to assistive technology, shown
            to sighted readers. Hidden from the accessibility tree here, since
            the Canvas already exposes the real one. */}
        {showFallback ? (
          <View aria-hidden className="max-h-80 overflow-y-auto rounded-lg border border-hinoki/18">
            <DayTable caption={label} />
          </View>
        ) : null}
      </View>
    </View>
  )
}

function DayTable({ caption }: { caption: string }) {
  return (
    <Table className="w-full text-left text-xs font-mono text-stone-300">
      <TableCaption className="p-3 text-left text-stone-400">{caption}</TableCaption>
      <TableHeader className="text-stone-400">
        <TableRow>
          {['Date', 'Open', 'High', 'Low', 'Close', 'Volume'].map((name) => (
            <TableHead key={name} className="px-3 py-1.5 border-b border-hinoki/18 font-semibold">
              {name}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {DAYS.map((entry) => (
          <TableRow key={entry.date}>
            <TableHead scope="row" className="px-3 py-1.5 font-normal text-stone-400">
              {entry.date}
            </TableHead>
            <TableCell className="px-3 py-1.5">{money(entry.open)}</TableCell>
            <TableCell className="px-3 py-1.5">{money(entry.high)}</TableCell>
            <TableCell className="px-3 py-1.5">{money(entry.low)}</TableCell>
            <TableCell
              className={
                entry.close >= entry.open
                  ? 'px-3 py-1.5 font-semibold text-tatami-light'
                  : 'px-3 py-1.5 font-semibold text-[#e07a6c]'
              }
            >
              {money(entry.close)}
            </TableCell>
            <TableCell className="px-3 py-1.5 text-hinoki">
              {entry.volume.toLocaleString('en-US')}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
