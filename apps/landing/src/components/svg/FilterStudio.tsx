import { Button, Code, Heading, Paragraph, Text, View } from '@hozo/core'
import { CodeBlock, RadioGroup, Slider } from '@hozo/patterns'
import { Svg } from '@hozo/svg'
import { useId, useState } from 'react'

// The /svg/ filter studio, drawn with `@hozo/svg`.
//
// The workbench this replaced wrote raw `<svg>` and `<feDropShadow>` under an
// "@hozo/svg" label, and its "Lowered Web DOM" and "Native" tabs were text
// typed by hand rather than anything the compiler produced. The drawing here
// is the namespace the page is about, and the only code shown is the source
// for what is on screen; the REPL is where compiler output is real.

type Shape = 'badge' | 'emblem' | 'stamp'

const SHAPES: readonly { value: Shape; label: string; description: string }[] = [
  { value: 'badge', label: 'Badge', description: 'A check mark in a ring' },
  { value: 'emblem', label: 'Emblem', description: 'A hexagonal joinery emblem' },
  { value: 'stamp', label: 'Stamp', description: 'A square seal with the character 組' },
]

const COLOURS = [
  { value: '#c8a882', label: 'Hinoki' },
  { value: '#9e3d31', label: 'Bengara' },
  { value: '#708260', label: 'Tatami' },
  { value: '#000000', label: 'Sumi' },
] as const

const OPTION =
  'px-3 py-1.5 rounded-lg text-xs font-semibold text-stone-400 border border-transparent hover:text-shikkui aria-checked:bg-hinoki/20 aria-checked:text-hinoki aria-checked:border-hinoki/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hinoki'

export function FilterStudio() {
  const ids = useId().replaceAll(':', '')
  const shadowId = `${ids}-shadow`
  const glowId = `${ids}-glow`
  const gradientId = `${ids}-gradient`
  const [shape, setShape] = useState<Shape>('badge')
  const [dx, setDx] = useState(0)
  const [dy, setDy] = useState(4)
  const [blur, setBlur] = useState(6)
  const [opacity, setOpacity] = useState(40)
  const [colour, setColour] = useState<string>('#c8a882')
  const [glow, setGlow] = useState(2)
  const description = SHAPES.find((entry) => entry.value === shape)?.description ?? ''

  const source = `import { Svg } from '@hozo/svg'

<Svg viewBox="0 0 200 200" accessibilityLabel="${description}">
  <Svg.Defs>
    <Svg.Filter id="shadow" x="-40%" y="-40%" width="180%" height="180%">
      <Svg.FeDropShadow
        dx={${dx}}
        dy={${dy}}
        stdDeviation={${blur}}
        floodColor="${colour}"
        floodOpacity={${opacity / 100}}
      />
    </Svg.Filter>
  </Svg.Defs>
  <Svg.G filter="url(#shadow)">{/* the ${shape} */}</Svg.G>
</Svg>`

  return (
    <View className="mb-16 rounded-2xl border border-hinoki/18 bg-yakisugi-950 overflow-hidden shadow-2xl">
      <View className="p-4 sm:p-6 border-b border-hinoki/18 bg-yakisugi-900/60 flex flex-row flex-wrap items-center justify-between gap-4">
        <View className="shrink gap-1">
          <Heading level={2} className="text-lg font-bold text-shikkui">
            Filter studio
          </Heading>
          <Paragraph className="text-xs text-stone-400">
            A drop shadow and a blur, defined once in <Code>Svg.Defs</Code> and referenced by id.
          </Paragraph>
        </View>
        <RadioGroup
          accessibilityLabel="Shape"
          options={SHAPES.map(({ value, label }) => ({ value, label }))}
          value={shape}
          onValueChange={setShape}
          className="flex flex-row gap-1.5 p-1 rounded-xl bg-yakisugi-950 border border-hinoki/18"
          optionClassName={OPTION}
        />
      </View>

      <View className="grid grid-cols-1 lg:grid-cols-2">
        <View className="p-6 sm:p-10 items-center justify-center bg-[#0d0c0a] min-h-[320px] border-b lg:border-b-0 lg:border-r border-hinoki/18">
          <Svg viewBox="0 0 200 200" className="w-64 h-64" accessibilityLabel={description}>
            <Svg.Defs>
              <Svg.Filter id={shadowId} x="-40%" y="-40%" width="180%" height="180%">
                <Svg.FeDropShadow
                  dx={dx}
                  dy={dy}
                  stdDeviation={blur}
                  floodColor={colour}
                  floodOpacity={opacity / 100}
                />
              </Svg.Filter>
              <Svg.Filter id={glowId}>
                <Svg.FeGaussianBlur stdDeviation={glow} />
              </Svg.Filter>
              <Svg.LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
                <Svg.Stop offset="0%" stopColor="#dfc8ab" />
                <Svg.Stop offset="100%" stopColor="#9e3d31" />
              </Svg.LinearGradient>
            </Svg.Defs>
            <Svg.G filter={`url(#${shadowId})`}>
              {shape === 'badge' ? (
                <>
                  <Svg.Circle cx={100} cy={100} r={64} fill="#c8a882" />
                  <Svg.Circle cx={100} cy={100} r={54} fill="#141312" />
                  <Svg.Path
                    d="M75 100 L92 117 L128 80"
                    stroke="#c8a882"
                    strokeWidth={8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                  <Svg.Circle
                    cx={100}
                    cy={100}
                    r={46}
                    stroke="#c8a882"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                    fill="none"
                  />
                </>
              ) : null}
              {shape === 'emblem' ? (
                <>
                  <Svg.Polygon
                    points="100,28 168,68 168,148 100,188 32,148 32,68"
                    fill="#1c1a18"
                    stroke="#c8a882"
                    strokeWidth={3}
                  />
                  <Svg.Polygon
                    points="100,48 148,76 148,136 100,164 52,136 52,76"
                    fill="#141312"
                    stroke="#a8855e"
                    strokeWidth={2}
                  />
                  <Svg.Circle
                    cx={100}
                    cy={106}
                    r={28}
                    fill={`url(#${gradientId})`}
                    filter={`url(#${glowId})`}
                  />
                  <Svg.Line x1={100} y1={56} x2={100} y2={156} stroke="#c8a882" strokeWidth={2} />
                  <Svg.Line x1={56} y1={106} x2={144} y2={106} stroke="#c8a882" strokeWidth={2} />
                </>
              ) : null}
              {shape === 'stamp' ? (
                <>
                  <Svg.Rect x={36} y={36} width={128} height={128} rx={20} fill="#9e3d31" />
                  <Svg.Rect
                    x={46}
                    y={46}
                    width={108}
                    height={108}
                    rx={14}
                    fill="#141312"
                    stroke="#9e3d31"
                    strokeWidth={2}
                  />
                  <Svg.Text
                    x={100}
                    y={118}
                    textAnchor="middle"
                    fill="#dfc8ab"
                    fontFamily="Zen Kaku Gothic New, sans-serif"
                    fontSize={46}
                    fontWeight="bold"
                  >
                    組
                  </Svg.Text>
                  <Svg.Circle
                    cx={100}
                    cy={100}
                    r={50}
                    stroke="#9e3d31"
                    strokeWidth={1.5}
                    strokeDasharray="3 3"
                    fill="none"
                  />
                </>
              ) : null}
            </Svg.G>
          </Svg>
        </View>

        <View className="p-6 sm:p-8 gap-4 bg-yakisugi-900/40 text-xs">
          <Heading level={3} className="text-sm font-bold text-shikkui">
            <Code className="text-hinoki">Svg.FeDropShadow</Code>
          </Heading>
          <Control label="dx" value={dx} unit="" min={-10} max={10} onChange={setDx} />
          <Control label="dy" value={dy} unit="" min={0} max={20} onChange={setDy} />
          <Control label="stdDeviation" value={blur} unit="" min={0} max={20} onChange={setBlur} />
          <Control
            label="floodOpacity"
            value={opacity}
            unit="%"
            min={10}
            max={100}
            step={5}
            onChange={setOpacity}
          />
          <View className="flex flex-row flex-wrap items-center gap-3">
            <Text className="w-28 text-stone-300 font-medium">floodColor</Text>
            <RadioGroup
              accessibilityLabel="floodColor"
              options={COLOURS.map(({ value, label }) => ({ value, label }))}
              value={colour}
              onValueChange={setColour}
              className="flex flex-row flex-wrap gap-1.5"
              optionClassName={OPTION}
            />
          </View>
          <Heading level={3} className="pt-2 text-sm font-bold text-shikkui">
            <Code className="text-hinoki">Svg.FeGaussianBlur</Code>{' '}
            <Text className="font-normal text-stone-400">(the emblem&apos;s glow)</Text>
          </Heading>
          <Control label="stdDeviation" value={glow} unit="" min={0} max={8} onChange={setGlow} />
          <View className="flex flex-row flex-wrap gap-2 pt-2 border-t border-hinoki/18">
            <Button
              onPress={() => {
                setDx(0)
                setDy(4)
                setBlur(6)
                setOpacity(40)
                setColour('#c8a882')
              }}
              className="px-2.5 py-1 rounded border border-hinoki/18 text-stone-300 hover:border-hinoki/35"
            >
              Soft shadow
            </Button>
            <Button
              onPress={() => {
                setDx(0)
                setDy(8)
                setBlur(16)
                setOpacity(80)
                setColour('#9e3d31')
              }}
              className="px-2.5 py-1 rounded border border-hinoki/18 text-stone-300 hover:border-hinoki/35"
            >
              Deep crimson
            </Button>
          </View>
        </View>
      </View>

      <View className="border-t border-hinoki/18 p-4 sm:p-6 gap-3">
        <Paragraph className="text-xs text-stone-400">
          The source for what is drawn above. To see what the compiler makes of it on the Web, paste
          it into the REPL.
        </Paragraph>
        <CodeBlock
          lines={source}
          title="SVG filter source"
          captionClassName="sr-only"
          className="rounded-xl border border-hinoki/18 bg-yakisugi-900 p-4 text-xs text-stone-300 min-w-0"
          lineStyle={{
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            lineHeight: 1.625,
          }}
        />
      </View>
    </View>
  )
}

function Control({
  label,
  value,
  unit,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string
  value: number
  unit: string
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
}) {
  return (
    <View className="flex flex-row items-center gap-3">
      <Text aria-hidden className="w-28 shrink-0 text-stone-300 font-medium">
        {label}
      </Text>
      <Slider
        accessibilityLabel={label}
        min={min}
        max={max}
        step={step}
        value={value}
        valueText={(current) => `${current}${unit}`}
        onValueChange={onChange}
        className="relative mx-2.5 flex-1 min-w-0 h-6 cursor-pointer touch-none before:absolute before:inset-x-0 before:top-1/2 before:h-1 before:-translate-y-1/2 before:rounded-full before:bg-hinoki/18"
        fillClassName="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-hinoki"
        thumbClassName="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-hinoki-light focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-hinoki-light"
      />
      <Text className="w-12 text-right font-mono text-stone-300 tabular-nums">
        {value}
        {unit}
      </Text>
    </View>
  )
}
