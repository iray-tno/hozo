import {
  Code,
  Heading,
  List,
  ListItem,
  Paragraph,
  Preformatted,
  Section,
  Strong,
  Text,
  View,
} from '@hozo/core'
import type { ReactNode } from 'react'

// The /canvas/ page around its demo, in Hozo primitives. What it says is
// what `@hozo/canvas` does today, checked against the package README: the
// old page credited it with fallback tables made "automatically", which it
// does not do, and showed an API (`import { Rect }`) it does not export.

export function CanvasIntro() {
  return (
    <Section className="mb-12 max-w-4xl">
      <View className="self-start inline-flex flex-row items-center gap-2 px-3 py-1 rounded-full bg-hinoki/10 border border-hinoki/18 text-hinoki text-xs font-mono mb-4">
        <Text>@hozo/canvas</Text>
        <Text className="text-stone-600">•</Text>
        <Text>Canvas 2D · React Native Skia</Text>
      </View>
      <Heading
        level={1}
        className="text-3xl sm:text-5xl font-extrabold tracking-tight text-shikkui mb-5"
      >
        One scene, drawn by <Text className="text-hinoki">both platforms</Text>
      </Heading>
      <Paragraph className="text-base sm:text-lg text-stone-300 leading-relaxed">
        Describe a drawing once as JSX — rectangles, lines, paths, text, groups and clips — and Hozo
        draws the same retained scene with the browser&apos;s Canvas 2D API on the Web and with
        React Native Skia on iOS and Android. Pointer and touch hit-testing come from the
        scene&apos;s geometry, and every surface has to say what it means to a screen reader.
      </Paragraph>
    </Section>
  )
}

function Card({ label, title, children }: { label: string; title: string; children: ReactNode }) {
  return (
    <View className="p-6 rounded-xl border border-hinoki/18 bg-yakisugi-900/40 gap-3">
      <Text className="self-start px-2 py-0.5 rounded bg-hinoki/10 border border-hinoki/30 text-hinoki font-mono text-xs">
        {label}
      </Text>
      <Heading level={3} className="text-lg font-bold text-shikkui">
        {title}
      </Heading>
      <Paragraph className="text-sm text-stone-300 leading-relaxed">{children}</Paragraph>
    </View>
  )
}

export function CanvasAccessibility() {
  return (
    <Section className="mb-20">
      <Heading
        level={2}
        className="text-2xl sm:text-3xl font-bold text-shikkui mb-3 tracking-tight"
      >
        Pixels are not content, so the type says what is
      </Heading>
      <Paragraph className="text-sm text-stone-300 mb-8 max-w-3xl leading-relaxed">
        A canvas is one element; what is drawn on it is invisible to a keyboard and a screen reader.
        Every <Code className="text-hinoki">{'<Canvas>'}</Code> therefore has to choose one of three
        meanings, and leaving all three out is a type error.
      </Paragraph>
      <View className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <Card label="accessibilityLabel" title="A named image">
          The surface is exposed as one image with that name. Right for a sparkline whose point fits
          in a sentence.
        </Card>
        <Card label="accessibleFallback" title="A real alternative">
          The pixels leave the accessibility tree and your fallback — a table, a list — is placed
          beside them, visually hidden. You build it from the same data as the drawing, as the demo
          above does.
        </Card>
        <Card label="decorative" title="Nothing to say">
          Ornament. The canvas and its surface are hidden from assistive technology completely.
        </Card>
      </View>
      <View className="p-6 rounded-xl border border-tatami/30 bg-tatami/15">
        <Heading level={3} className="text-base font-bold text-shikkui mb-2">
          A shape you can press is a control
        </Heading>
        <Paragraph className="text-sm text-stone-300 leading-relaxed">
          Give a shape <Code className="text-hinoki">onPress</Code> or{' '}
          <Code className="text-hinoki">href</Code> and an{' '}
          <Code className="text-hinoki">accessibilityLabel</Code>, and Hozo puts a real button or
          link for it in a hidden layer, in drawing order. Focusing it indicates the shape the way
          hovering does, so the demo&apos;s tooltip follows the keyboard too. Shapes drawn in
          several parts share one control through{' '}
          <Code className="text-hinoki">accessibilityControlId</Code>. A pressable shape with no
          name stays pointer-only and says so in development.
        </Paragraph>
      </View>
    </Section>
  )
}

function Choice({
  title,
  tone,
  children,
}: {
  title: string
  tone: 'hinoki' | 'tatami'
  children: ReactNode
}) {
  return (
    <View className="p-5 rounded-xl border border-hinoki/10 bg-yakisugi-950/80">
      <Heading
        level={3}
        className={
          tone === 'hinoki'
            ? 'text-hinoki font-bold text-base mb-2'
            : 'text-tatami-light font-bold text-base mb-2'
        }
      >
        {title}
      </Heading>
      <List className="text-xs sm:text-sm text-stone-300 space-y-2 list-disc list-inside leading-relaxed">
        {children}
      </List>
    </View>
  )
}

export function CanvasOrSvg() {
  return (
    <Section className="mb-20 rounded-2xl border border-hinoki/18 bg-yakisugi-900/60 p-6 sm:p-8 shadow-xl">
      <Heading level={2} className="text-xl sm:text-2xl font-bold text-shikkui mb-4">
        Canvas or SVG?
      </Heading>
      <Paragraph className="text-sm text-stone-300 leading-relaxed mb-6">
        Hozo has both, and they are different tools rather than two speeds of one. Choose by how
        much is drawn and by what each mark has to be.
      </Paragraph>
      <View className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Choice title="SVG (@hozo/svg)" tone="hinoki">
          <ListItem className="list-item">Icons, logos and other marks that are design</ListItem>
          <ListItem className="list-item">
            Charts of hundreds of marks, each a DOM element you can style and hover with CSS
          </ListItem>
          <ListItem className="list-item">
            Filter effects such as blur, which <Strong>@hozo/canvas</Strong> does not apply to
            shapes
          </ListItem>
          <ListItem className="list-item">
            Emits real <Code className="text-hinoki">{'<svg>'}</Code> on the Web
          </ListItem>
        </Choice>
        <Choice title="Canvas (@hozo/canvas)" tone="tatami">
          <ListItem className="list-item">
            Thousands of marks, where one DOM node each would be the cost
          </ListItem>
          <ListItem className="list-item">
            Scenes redrawn often, and textured or vertex-coloured triangle meshes
          </ListItem>
          <ListItem className="list-item">
            Hit-testing from geometry rather than from one element per mark
          </ListItem>
          <ListItem className="list-item">
            One surface; meaning comes from a label or a fallback you provide
          </ListItem>
        </Choice>
      </View>
    </Section>
  )
}

export function CanvasAuthoring() {
  return (
    <Section className="mb-16">
      <Heading
        level={2}
        className="text-2xl sm:text-3xl font-bold text-shikkui mb-4 tracking-tight"
      >
        Writing one
      </Heading>
      <Paragraph className="text-sm text-stone-300 mb-6 max-w-2xl">
        The shapes are properties of <Code className="text-hinoki">Canvas</Code>. The fallback is
        built from the same rows as the bars, so the two cannot drift apart.
      </Paragraph>
      <Preformatted className="rounded-xl border border-hinoki/18 bg-yakisugi-900 p-4 sm:p-6 overflow-x-auto text-xs sm:text-sm font-mono text-stone-300 leading-relaxed">
        <Code>
          <Text className="text-hinoki">import</Text>
          {' { Canvas } '}
          <Text className="text-hinoki">from</Text>{' '}
          <Text className="text-tatami-light">'@hozo/canvas'</Text>
          {'\n\n'}
          <Text className="text-hinoki">export function</Text>{' '}
          <Text className="text-shikkui">Revenue</Text>
          {'({ quarters }) {\n  '}
          <Text className="text-hinoki">return</Text>
          {' (\n    <'}
          <Text className="text-bengara">Canvas</Text>
          {'\n      '}
          <Text className="text-hinoki-light">viewBox</Text>
          {'={[0, 0, 400, 200]}\n      '}
          <Text className="text-hinoki-light">accessibilityLabel</Text>=
          <Text className="text-tatami-light">"Revenue by quarter"</Text>
          {'\n      '}
          <Text className="text-hinoki-light">accessibleFallback</Text>
          {'={<'}
          <Text className="text-bengara">RevenueTable</Text>{' '}
          <Text className="text-hinoki-light">quarters</Text>
          {'={quarters} />}\n    >\n      {quarters.map((q, i) => (\n        <'}
          <Text className="text-bengara">Canvas.Rect</Text>
          {'\n          '}
          <Text className="text-hinoki-light">key</Text>
          {'={q.name}\n          '}
          <Text className="text-hinoki-light">x</Text>
          {'={i * 100 + 20} '}
          <Text className="text-hinoki-light">y</Text>
          {'={200 - q.value} '}
          <Text className="text-hinoki-light">width</Text>
          {'={60} '}
          <Text className="text-hinoki-light">height</Text>
          {'={q.value}\n          '}
          <Text className="text-hinoki-light">fill</Text>=
          <Text className="text-tatami-light">"#c8a882"</Text>
          {'\n          '}
          <Text className="text-hinoki-light">accessibilityLabel</Text>
          {'={q.name}\n          '}
          <Text className="text-hinoki-light">onPress</Text>
          {'={() => select(q)}\n        />\n      ))}\n    </'}
          <Text className="text-bengara">Canvas</Text>
          {'>\n  )\n}'}
        </Code>
      </Preformatted>
    </Section>
  )
}
