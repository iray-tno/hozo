import { Code, Heading, Paragraph, Preformatted, Section, Text, View } from '@hozo/core'
import { Svg } from '@hozo/svg'
import type { ReactNode } from 'react'

// The /svg/ page around its studio, in Hozo primitives. Checked against the
// package README and the conformance snapshot: the old page called both the
// Web and Native filter numbers "100% Surface Lowering", when Hozo exposes 10
// of the 26 filter-family members `react-native-svg` exports.

export function SvgIntro() {
  return (
    <Section className="mb-12 max-w-4xl">
      <View className="self-start inline-flex flex-row items-center gap-2 px-3 py-1 rounded-full bg-hinoki/10 border border-hinoki/18 text-hinoki text-xs font-mono mb-4">
        <Text>@hozo/svg</Text>
        <Text className="text-stone-600">•</Text>
        <Text>{'<svg> · react-native-svg'}</Text>
      </View>
      <Heading
        level={1}
        className="text-3xl sm:text-5xl font-extrabold tracking-tight text-shikkui mb-5"
      >
        One <Text className="text-hinoki">Svg</Text> namespace, both platforms
      </Heading>
      <Paragraph className="text-base sm:text-lg text-stone-300 leading-relaxed">
        Write <Code className="text-hinoki">{'<Svg>'}</Code>,{' '}
        <Code className="text-hinoki">Svg.Path</Code>,{' '}
        <Code className="text-hinoki">Svg.Filter</Code> and the rest once. On the Web the compiler
        lowers them to the browser&apos;s own SVG elements, with nothing in between; on iOS and
        Android they become <Code className="text-hinoki">react-native-svg</Code> 15.9 or newer.
      </Paragraph>
    </Section>
  )
}

function Specimen({
  title,
  detail,
  children,
}: {
  title: string
  detail: string
  children: ReactNode
}) {
  return (
    <View className="p-6 rounded-xl border border-hinoki/10 bg-yakisugi-950/80 items-center text-center gap-1">
      {children}
      <Heading level={3} className="mt-3 text-sm font-bold text-shikkui">
        {title}
      </Heading>
      <Paragraph className="text-xs text-stone-400">{detail}</Paragraph>
    </View>
  )
}

export function SvgSpecimens() {
  return (
    <Section className="mb-16 rounded-2xl border border-hinoki/18 bg-yakisugi-900/60 p-6 sm:p-8 shadow-xl">
      <Heading level={2} className="text-xl sm:text-2xl font-bold text-shikkui mb-2">
        Compiled, not hydrated
      </Heading>
      <Paragraph className="text-xs sm:text-sm text-stone-400 mb-6">
        These three ship no JavaScript: Astro renders them at build time and the page holds plain{' '}
        <Code className="text-hinoki">{'<svg>'}</Code>. They are decoration beside their captions,
        so they are hidden from assistive technology.
      </Paragraph>
      <View className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <Specimen title="Shapes" detail="Svg.Polygon, Svg.Circle and Svg.Line">
          <Svg viewBox="0 0 100 100" className="w-24 h-24" fill="none" aria-hidden>
            <Svg.Polygon
              points="50,10 90,85 10,85"
              stroke="#c8a882"
              strokeWidth={3}
              fill="#c8a882"
              fillOpacity={0.1}
            />
            <Svg.Circle
              cx={50}
              cy={60}
              r={16}
              stroke="#dfc8ab"
              strokeWidth={2}
              fill="#9e3d31"
              fillOpacity={0.3}
            />
            <Svg.Line
              x1={50}
              y1={20}
              x2={50}
              y2={80}
              stroke="#c8a882"
              strokeWidth={1.5}
              strokeDasharray="4 2"
            />
          </Svg>
        </Specimen>
        <Specimen title="Drop shadow" detail="Svg.Filter with Svg.FeDropShadow">
          <Svg viewBox="0 0 100 100" className="w-24 h-24" aria-hidden>
            <Svg.Defs>
              <Svg.Filter id="specimen-shadow" x="-20%" y="-20%" width="140%" height="140%">
                <Svg.FeDropShadow
                  dx={0}
                  dy={4}
                  stdDeviation={6}
                  floodColor="#c8a882"
                  floodOpacity={0.6}
                />
              </Svg.Filter>
            </Svg.Defs>
            <Svg.Rect
              x={25}
              y={25}
              width={50}
              height={50}
              rx={12}
              fill="#c8a882"
              filter="url(#specimen-shadow)"
            />
            <Svg.Path
              d="M40 50 L47 57 L62 42"
              stroke="#100f0e"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </Svg>
        </Specimen>
        <Specimen title="Gradient and blur" detail="Svg.LinearGradient with Svg.FeGaussianBlur">
          <Svg viewBox="0 0 100 100" className="w-24 h-24" aria-hidden>
            <Svg.Defs>
              <Svg.LinearGradient id="specimen-gradient" x1="0" y1="0" x2="1" y2="1">
                <Svg.Stop offset="0%" stopColor="#9e3d31" />
                <Svg.Stop offset="100%" stopColor="#c8a882" />
              </Svg.LinearGradient>
              <Svg.Filter id="specimen-blur">
                <Svg.FeGaussianBlur stdDeviation={3} />
              </Svg.Filter>
            </Svg.Defs>
            <Svg.Circle
              cx={50}
              cy={50}
              r={28}
              fill="url(#specimen-gradient)"
              filter="url(#specimen-blur)"
              opacity={0.6}
            />
            <Svg.Circle cx={50} cy={50} r={24} fill="url(#specimen-gradient)" />
          </Svg>
        </Specimen>
      </View>
    </Section>
  )
}

function Point({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="p-6 rounded-xl border border-hinoki/18 bg-yakisugi-900/40 gap-2">
      <Heading level={3} className="text-lg font-bold text-shikkui">
        {title}
      </Heading>
      <Paragraph className="text-xs sm:text-sm text-stone-300 leading-relaxed">
        {children}
      </Paragraph>
    </View>
  )
}

export function SvgPoints() {
  return (
    <Section className="mb-20">
      <Heading
        level={2}
        className="text-2xl sm:text-3xl font-bold text-shikkui mb-8 tracking-tight"
      >
        What the namespace gives you
      </Heading>
      <View className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Point title="A name, or none">
          With <Code className="text-hinoki">accessibilityLabel</Code>, an{' '}
          <Code className="text-hinoki">Svg</Code> is an image with that name:{' '}
          <Code className="text-hinoki">role=&quot;img&quot;</Code> on the Web,{' '}
          <Code className="text-hinoki">accessibilityRole=&quot;image&quot;</Code> on Native. If it
          holds text, a pressable shape, or content the compiler cannot see into, on the Web it is a
          named <Code className="text-hinoki">group</Code> instead, because an image hides its
          children. Without a label it gets no role; mark pure decoration{' '}
          <Code className="text-hinoki">aria-hidden</Code>, as the specimens above are.
        </Point>
        <Point title="Filters both platforms draw">
          <Code className="text-hinoki">Svg.Filter</Code> with ColorMatrix, GaussianBlur, Offset,
          Flood, Composite, Blend, Merge and DropShadow: the set{' '}
          <Code className="text-hinoki">react-native-svg</Code> implements. On Android, Hozo
          corrects blur radii for screen density and <Code className="text-hinoki">viewBox</Code>{' '}
          scaling; it is not pixel parity, and the README lists what still differs.
        </Point>
        <Point title="Links inside a drawing">
          <Code className="text-hinoki">Svg.Link</Code> is an SVG anchor on the Web and a
          router-aware pressable group on Native, through the same navigation provider as{' '}
          <Code className="text-hinoki">@hozo/navigation</Code>.
        </Point>
        <Point title="Icons from your own set">
          <Code className="text-hinoki">Icon</Code> draws Lucide-shaped icon data. No set is
          bundled, so a Native bundle carries only the icons you import; unnamed icons are
          decoration and hidden, named ones are images.
        </Point>
      </View>
    </Section>
  )
}

export function SvgFilterCoverage({
  web,
  native,
}: {
  web: { covered: number; total: number }
  native: { covered: number; total: number; upstreamStubs?: number }
}) {
  return (
    <Section className="mb-16 rounded-2xl border border-hinoki/18 bg-yakisugi-900/60 p-6 sm:p-8 shadow-xl">
      <Heading level={2} className="text-xl sm:text-2xl font-bold text-shikkui tracking-tight mb-2">
        Filter coverage, measured
      </Heading>
      <Paragraph className="text-xs sm:text-sm text-stone-400 mb-6 leading-relaxed">
        From the conformance snapshot (<Code>pnpm --filter @hozo/tailwind-conformance report</Code>
        ). These count API, compiler and import routing — not pixel equivalence or rendering on a
        device.
      </Paragraph>
      <View className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <View className="p-5 rounded-xl border border-hinoki/10 bg-yakisugi-950/80 gap-1">
          <Text className="text-xs font-mono text-stone-400">Web</Text>
          <Text className="text-2xl font-bold text-shikkui">
            {web.covered} / {web.total}
          </Text>
          <Paragraph className="text-xs text-stone-400 leading-relaxed">
            Filter-family members exposed by Hozo, out of everything <Code>react-native-svg</Code>{' '}
            exports. The rest are not exposed yet.
          </Paragraph>
        </View>
        <View className="p-5 rounded-xl border border-hinoki/10 bg-yakisugi-950/80 gap-1">
          <Text className="text-xs font-mono text-stone-400">Native</Text>
          <Text className="text-2xl font-bold text-shikkui">
            {native.covered} / {native.total}
          </Text>
          <Paragraph className="text-xs text-stone-400 leading-relaxed">
            Of the members upstream actually implements.
            {native.upstreamStubs
              ? ` ${native.upstreamStubs} more are warning-only stubs upstream and are not counted.`
              : ''}
          </Paragraph>
        </View>
      </View>
    </Section>
  )
}

export function SvgAuthoring() {
  return (
    <Section className="mb-16">
      <Heading
        level={2}
        className="text-2xl sm:text-3xl font-bold text-shikkui mb-4 tracking-tight"
      >
        Writing one
      </Heading>
      <Paragraph className="text-sm text-stone-300 mb-6 max-w-2xl">
        Effects live in <Code className="text-hinoki">Svg.Defs</Code> and are referenced by id,
        exactly as in SVG itself.
      </Paragraph>
      <Preformatted className="rounded-xl border border-hinoki/18 bg-yakisugi-900 p-4 sm:p-6 overflow-x-auto text-xs sm:text-sm font-mono text-stone-300 leading-relaxed">
        <Code>
          <Text className="text-hinoki">import</Text>
          {' { Svg } '}
          <Text className="text-hinoki">from</Text>{' '}
          <Text className="text-tatami-light">'@hozo/svg'</Text>
          {'\n\n'}
          <Text className="text-hinoki">export function</Text>{' '}
          <Text className="text-shikkui">Verified</Text>
          {'() {\n  '}
          <Text className="text-hinoki">return</Text>
          {' (\n    <'}
          <Text className="text-bengara">Svg</Text>{' '}
          <Text className="text-hinoki-light">viewBox</Text>=
          <Text className="text-tatami-light">"0 0 80 80"</Text>{' '}
          <Text className="text-hinoki-light">accessibilityLabel</Text>=
          <Text className="text-tatami-light">"Verified"</Text>
          {'>\n      <'}
          <Text className="text-bengara">Svg.Defs</Text>
          {'>\n        <'}
          <Text className="text-bengara">Svg.Filter</Text>{' '}
          <Text className="text-hinoki-light">id</Text>=
          <Text className="text-tatami-light">"shadow"</Text>
          {'>\n          <'}
          <Text className="text-bengara">Svg.FeDropShadow</Text>{' '}
          <Text className="text-hinoki-light">dy</Text>
          {'={3} '}
          <Text className="text-hinoki-light">stdDeviation</Text>
          {'={2} '}
          <Text className="text-hinoki-light">floodOpacity</Text>
          {'={0.4} />\n        </'}
          <Text className="text-bengara">Svg.Filter</Text>
          {'>\n      </'}
          <Text className="text-bengara">Svg.Defs</Text>
          {'>\n      <'}
          <Text className="text-bengara">Svg.Circle</Text>{' '}
          <Text className="text-hinoki-light">cx</Text>
          {'={40} '}
          <Text className="text-hinoki-light">cy</Text>
          {'={40} '}
          <Text className="text-hinoki-light">r</Text>
          {'={24} '}
          <Text className="text-hinoki-light">fill</Text>=
          <Text className="text-tatami-light">"#c8a882"</Text>{' '}
          <Text className="text-hinoki-light">filter</Text>=
          <Text className="text-tatami-light">"url(#shadow)"</Text>
          {' />\n      <'}
          <Text className="text-bengara">Svg.Path</Text>{' '}
          <Text className="text-hinoki-light">d</Text>=
          <Text className="text-tatami-light">"M32 40 L38 46 L50 34"</Text>{' '}
          <Text className="text-hinoki-light">stroke</Text>=
          <Text className="text-tatami-light">"#100f0e"</Text>{' '}
          <Text className="text-hinoki-light">strokeWidth</Text>
          {'={3} />\n    </'}
          <Text className="text-bengara">Svg</Text>
          {'>\n  )\n}'}
        </Code>
      </Preformatted>
    </Section>
  )
}
