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

type Shape = 'asanoha' | 'shippo' | 'seigaiha'

const SHAPES: readonly { value: Shape; label: string; description: string }[] = [
  { value: 'asanoha', label: 'Asanoha', description: 'Asanoha, the hemp-leaf pattern' },
  { value: 'shippo', label: 'Shippo', description: 'Shippo, the seven-treasures pattern' },
  { value: 'seigaiha', label: 'Seigaiha', description: 'Seigaiha, the wave pattern' },
]

const COLOURS = [
  { value: '#c8a882', label: 'Hinoki' },
  { value: '#9e3d31', label: 'Bengara' },
  { value: '#708260', label: 'Tatami' },
  { value: '#000000', label: 'Sumi' },
] as const

const OPTION =
  'px-3 py-1.5 rounded-lg text-xs font-semibold text-stone-400 border border-transparent hover:text-shikkui aria-checked:bg-hinoki/20 aria-checked:text-hinoki aria-checked:border-hinoki/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hinoki'

// The three patterns are computed, not traced: each is a lattice, and the
// drawing is the lattice's lines. All three centre a motif on (100, 100),
// which is the one drawn bright and given the glow.
const CENTRE = 100
const round = (value: number) => Math.round(value * 100) / 100
type Point = readonly [number, number]
const segment = ([ax, ay]: Point, [bx, by]: Point) =>
  `M${round(ax)} ${round(ay)}L${round(bx)} ${round(by)}`

// Asanoha, the hemp leaf: a triangular lattice, with each triangle's
// centroid joined to its three corners. Around every lattice point that
// leaves a six-leaved star.
const ASANOHA_SIDE = 40
function asanoha() {
  const height = (ASANOHA_SIDE * Math.sqrt(3)) / 2
  const at = (i: number, j: number): Point => [
    CENTRE + i * ASANOHA_SIDE + (Math.abs(j) % 2 ? ASANOHA_SIDE / 2 : 0),
    CENTRE + j * height,
  ]
  const triangles: Point[][] = []
  for (let j = -6; j < 6; j++)
    for (let i = -6; i < 6; i++) {
      const odd = Math.abs(j) % 2 === 1
      triangles.push([at(i, j), at(i + 1, j), odd ? at(i + 1, j + 1) : at(i, j + 1)])
      triangles.push([at(i, j + 1), at(i + 1, j + 1), odd ? at(i, j) : at(i + 1, j)])
    }
  const draw = (shapes: Point[][]) =>
    shapes
      .flatMap(([a, b, c]) => {
        const centroid: Point = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3]
        return [
          segment(a, b),
          segment(b, c),
          segment(c, a),
          segment(centroid, a),
          segment(centroid, b),
          segment(centroid, c),
        ]
      })
      .join('')
  const central = triangles.filter((corners) =>
    corners.some(([x, y]) => Math.hypot(x - CENTRE, y - CENTRE) < 0.5),
  )
  return { lattice: draw(triangles), motif: draw(central) }
}

// Shippo, the seven treasures: equal circles on a square lattice, spaced so
// that each overlaps its four neighbours in petals that meet at their tips.
const SHIPPO_SPACING = 50
const SHIPPO_RADIUS = SHIPPO_SPACING / Math.SQRT2
function shippo() {
  const centres: Point[] = []
  for (let j = -3; j <= 3; j++)
    for (let i = -3; i <= 3; i++)
      centres.push([CENTRE + i * SHIPPO_SPACING, CENTRE + j * SHIPPO_SPACING])
  const r = round(SHIPPO_RADIUS)
  const tip = round(SHIPPO_RADIUS * Math.SQRT1_2)
  // The petal towards the right-hand neighbour; the others are it, turned.
  const petal = `M${CENTRE + tip} ${CENTRE - tip}A${r} ${r} 0 0 1 ${CENTRE + tip} ${CENTRE + tip}A${r} ${r} 0 0 1 ${CENTRE + tip} ${CENTRE - tip}Z`
  return { centres, petal }
}

// Seigaiha, the blue sea's waves: rows of concentric rings, each row half a
// ring lower and half a step across, drawn top to bottom so that every row
// hides the lower half of the one before.
const SEIGAIHA_RADIUS = 34
const SEIGAIHA_RINGS = [1, 0.75, 0.5, 0.25].map((share) => share * SEIGAIHA_RADIUS)
function seigaiha() {
  const units: { centre: Point; motif: boolean }[] = []
  for (let row = -10; row <= 12; row++)
    for (let i = -4; i <= 4; i++) {
      const x = CENTRE + i * SEIGAIHA_RADIUS * 2 + (Math.abs(row) % 2 ? SEIGAIHA_RADIUS : 0)
      const y = CENTRE + (row * SEIGAIHA_RADIUS) / 2
      units.push({ centre: [x, y], motif: row === 0 && i === 0 })
    }
  return units
}

const ASANOHA = asanoha()
const SHIPPO = shippo()
const SEIGAIHA = seigaiha()

export function FilterStudio() {
  const ids = useId().replaceAll(':', '')
  const shadowId = `${ids}-shadow`
  const glowId = `${ids}-glow`
  const gradientId = `${ids}-gradient`
  const clipId = `${ids}-clip`
  const [shape, setShape] = useState<Shape>('asanoha')
  const [dx, setDx] = useState(0)
  const [dy, setDy] = useState(4)
  const [blur, setBlur] = useState(6)
  const [opacity, setOpacity] = useState(40)
  const [colour, setColour] = useState<string>('#c8a882')
  const [glow, setGlow] = useState(3)
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
              <Svg.ClipPath id={clipId}>
                <Svg.Circle cx={100} cy={100} r={78} />
              </Svg.ClipPath>
              <Svg.LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
                <Svg.Stop offset="0%" stopColor="#dfc8ab" />
                <Svg.Stop offset="100%" stopColor="#9e3d31" />
              </Svg.LinearGradient>
            </Svg.Defs>
            {/* A medallion: the pattern cut to a circle, lifted by the shadow.
                The motif at its centre is drawn twice, blurred under sharp,
                which is what the glow slider brightens. */}
            <Svg.G filter={`url(#${shadowId})`}>
              <Svg.Circle cx={100} cy={100} r={78} fill="#141312" />
              <Svg.G clipPath={`url(#${clipId})`}>
                {shape === 'asanoha' ? (
                  <>
                    <Svg.Path
                      d={ASANOHA.lattice}
                      stroke="#c8a882"
                      strokeOpacity={0.45}
                      strokeWidth={0.9}
                      fill="none"
                    />
                    <Svg.Path
                      d={ASANOHA.motif}
                      stroke="#e9cf9f"
                      strokeWidth={2.5}
                      fill="none"
                      filter={`url(#${glowId})`}
                    />
                    <Svg.Path d={ASANOHA.motif} stroke="#f3e2c4" strokeWidth={1.4} fill="none" />
                  </>
                ) : null}
                {shape === 'shippo' ? (
                  <>
                    {SHIPPO.centres.map(([cx, cy]) => (
                      <Svg.Circle
                        key={`${cx} ${cy}`}
                        cx={cx}
                        cy={cy}
                        r={SHIPPO_RADIUS}
                        stroke="#c8a882"
                        strokeOpacity={0.45}
                        strokeWidth={0.9}
                        fill="none"
                      />
                    ))}
                    <Svg.G filter={`url(#${glowId})`}>
                      {[0, 90, 180, 270].map((turn) => (
                        <Svg.Path
                          key={turn}
                          d={SHIPPO.petal}
                          transform={`rotate(${turn} 100 100)`}
                          fill={`url(#${gradientId})`}
                        />
                      ))}
                    </Svg.G>
                    {[0, 90, 180, 270].map((turn) => (
                      <Svg.Path
                        key={turn}
                        d={SHIPPO.petal}
                        transform={`rotate(${turn} 100 100)`}
                        fill={`url(#${gradientId})`}
                        stroke="#f3e2c4"
                        strokeWidth={1}
                      />
                    ))}
                  </>
                ) : null}
                {shape === 'seigaiha'
                  ? SEIGAIHA.map(({ centre: [cx, cy], motif }) => (
                      <Svg.G key={`${cx} ${cy}`}>
                        <Svg.Circle cx={cx} cy={cy} r={SEIGAIHA_RADIUS} fill="#141312" />
                        {motif ? (
                          <Svg.G filter={`url(#${glowId})`}>
                            {SEIGAIHA_RINGS.map((r) => (
                              <Svg.Circle
                                key={r}
                                cx={cx}
                                cy={cy}
                                r={r}
                                stroke="#e9cf9f"
                                strokeWidth={4}
                                fill="none"
                              />
                            ))}
                          </Svg.G>
                        ) : null}
                        {SEIGAIHA_RINGS.map((r) => (
                          <Svg.Circle
                            key={r}
                            cx={cx}
                            cy={cy}
                            r={r}
                            stroke={motif ? '#f3e2c4' : '#c8a882'}
                            strokeOpacity={motif ? 1 : 0.45}
                            strokeWidth={motif ? 1.4 : 0.9}
                            fill="none"
                          />
                        ))}
                      </Svg.G>
                    ))
                  : null}
              </Svg.G>
              <Svg.Circle cx={100} cy={100} r={78} stroke="#c8a882" strokeWidth={2} fill="none" />
              <Svg.Circle
                cx={100}
                cy={100}
                r={84}
                stroke="#c8a882"
                strokeOpacity={0.4}
                strokeWidth={0.75}
                fill="none"
              />
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
            <Text className="font-normal text-stone-400">(the centre motif&apos;s glow)</Text>
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
