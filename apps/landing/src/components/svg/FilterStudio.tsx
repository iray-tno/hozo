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

type Shape = 'joint' | 'lantern' | 'seal'

const SHAPES: readonly { value: Shape; label: string; description: string }[] = [
  { value: 'joint', label: 'Joint', description: 'A dovetail joint, drawn apart' },
  { value: 'lantern', label: 'Lantern', description: 'A paper lantern with a latticed frame' },
  { value: 'seal', label: 'Seal', description: 'A red seal with the character 組' },
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
  const hinokiId = `${ids}-hinoki`
  const kuriId = `${ids}-kuri`
  const paperId = `${ids}-paper`
  const [shape, setShape] = useState<Shape>('joint')
  const [dx, setDx] = useState(0)
  const [dy, setDy] = useState(4)
  const [blur, setBlur] = useState(6)
  const [opacity, setOpacity] = useState(40)
  const [colour, setColour] = useState<string>('#000000')
  const [glow, setGlow] = useState(8)
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
          <Svg viewBox="0 0 200 200" className="w-72 h-72" accessibilityLabel={description}>
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
              <Svg.Filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
                <Svg.FeGaussianBlur stdDeviation={glow} />
              </Svg.Filter>
              <Svg.LinearGradient id={hinokiId} x1="0" y1="0" x2="0" y2="1">
                <Svg.Stop offset="0%" stopColor="#e6cfac" />
                <Svg.Stop offset="100%" stopColor="#c49f74" />
              </Svg.LinearGradient>
              <Svg.LinearGradient id={kuriId} x1="0" y1="0" x2="0" y2="1">
                <Svg.Stop offset="0%" stopColor="#8f6c4f" />
                <Svg.Stop offset="100%" stopColor="#5e4632" />
              </Svg.LinearGradient>
              <Svg.RadialGradient id={paperId} cx="50%" cy="55%" r="65%">
                <Svg.Stop offset="0%" stopColor="#fff6e0" />
                <Svg.Stop offset="70%" stopColor="#f5d9a2" />
                <Svg.Stop offset="100%" stopColor="#e3b26a" />
              </Svg.RadialGradient>
            </Svg.Defs>
            {/* The sheet the piece rests on, so a shadow of any colour has
                somewhere to fall. It takes no filter itself. */}
            <Svg.Rect x={8} y={8} width={184} height={184} rx={14} fill="#ebe5d8" />
            {shape === 'joint' ? (
              // A dovetail drawn apart: the tail of the upper piece and the
              // socket it fits, the joint the mark at the top of the page is cut from.
              <Svg.G filter={`url(#${shadowId})`}>
                <Svg.Polygon
                  points="44,36 156,36 156,90 120,90 128,118 72,118 80,90 44,90"
                  fill={`url(#${hinokiId})`}
                />
                <Svg.Polygon
                  points="44,96 80,96 72,124 128,124 120,96 156,96 156,160 44,160"
                  fill={`url(#${kuriId})`}
                />
                <Svg.Path
                  d="M50 50C80 46 118 54 150 48M50 64C84 60 116 68 150 62M50 78C78 75 122 81 150 76"
                  stroke="#a8855e"
                  strokeWidth={1}
                  strokeOpacity={0.5}
                  fill="none"
                />
                <Svg.Path
                  d="M50 136C82 132 118 140 150 134M50 149C80 146 120 152 150 147"
                  stroke="#3d2e21"
                  strokeWidth={1}
                  strokeOpacity={0.6}
                  fill="none"
                />
              </Svg.G>
            ) : null}
            {shape === 'lantern' ? (
              // An andon: the light is a blurred shape behind the paper, so
              // the glow slider is what makes it shine.
              <>
                <Svg.Ellipse
                  cx={100}
                  cy={102}
                  rx={44}
                  ry={54}
                  fill="#f2b45a"
                  fillOpacity={0.7}
                  filter={`url(#${glowId})`}
                />
                <Svg.G filter={`url(#${shadowId})`}>
                  <Svg.Rect x={58} y={34} width={84} height={10} rx={3} fill="#3a2e22" />
                  <Svg.Rect x={66} y={44} width={68} height={104} fill={`url(#${paperId})`} />
                  <Svg.Path
                    d="M100 44V148M66 70H134M66 96H134M66 122H134"
                    stroke="#3a2e22"
                    strokeWidth={2}
                    fill="none"
                  />
                  <Svg.Rect
                    x={66}
                    y={44}
                    width={68}
                    height={104}
                    stroke="#3a2e22"
                    strokeWidth={4}
                    fill="none"
                  />
                  <Svg.Rect x={60} y={148} width={80} height={8} rx={2} fill="#3a2e22" />
                  <Svg.Rect x={66} y={156} width={8} height={10} fill="#3a2e22" />
                  <Svg.Rect x={126} y={156} width={8} height={10} fill="#3a2e22" />
                </Svg.G>
              </>
            ) : null}
            {shape === 'seal' ? (
              // A hakubun seal: the character is the paper showing through
              // the ink, so it shares the sheet's colour. Set a little askew,
              // as a hand presses it.
              <Svg.G filter={`url(#${shadowId})`} transform="rotate(-4 100 100)">
                <Svg.Rect x={50} y={50} width={100} height={100} rx={6} fill="#b03a2e" />
                <Svg.Rect
                  x={58}
                  y={58}
                  width={84}
                  height={84}
                  rx={3}
                  stroke="#ebe5d8"
                  strokeWidth={2.5}
                  fill="none"
                />
                <Svg.Text
                  x={100}
                  y={124}
                  textAnchor="middle"
                  fill="#ebe5d8"
                  fontFamily="Zen Kaku Gothic New, sans-serif"
                  fontSize={64}
                  fontWeight="bold"
                >
                  組
                </Svg.Text>
              </Svg.G>
            ) : null}
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
            <Text className="font-normal text-stone-400">(the lantern&apos;s glow)</Text>
          </Heading>
          <Control label="stdDeviation" value={glow} unit="" min={0} max={16} onChange={setGlow} />
          <View className="flex flex-row flex-wrap gap-2 pt-2 border-t border-hinoki/18">
            <Button
              onPress={() => {
                setDx(0)
                setDy(4)
                setBlur(6)
                setOpacity(40)
                setColour('#000000')
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
