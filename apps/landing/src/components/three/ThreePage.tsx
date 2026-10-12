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
import { Kumimono } from '../Kumimono.tsx'

// The /three/ page, in Hozo primitives. The Kumimono frame is its own island
// because the demo inside it is interactive; Astro hydrates a component, not a
// child of one rendered on the server.

export function ThreeIntro() {
  return (
    <Section className="mb-12 max-w-4xl">
      <View className="self-start inline-flex flex-row items-center gap-2 px-3 py-1 rounded-full bg-hinoki/10 border border-hinoki/18 text-hinoki text-xs font-mono mb-4">
        <Text>@hozo/three</Text>
        <Text className="text-stone-600">•</Text>
        <Text>WebGL · WebGPU · Expo GL</Text>
      </View>
      <Heading
        level={1}
        className="text-3xl sm:text-5xl font-extrabold tracking-tight text-shikkui mb-5"
      >
        Three.js & <Text className="text-hinoki">3D Spatial Graphics</Text>
      </Heading>
      <Paragraph className="text-base sm:text-lg text-stone-300 leading-relaxed">
        3D graphics on the web and on mobile usually live in two isolated ecosystems with diverging
        shader languages and asset pipelines. Hozo bridges them with a unified 3D pipeline that
        lowers to WebGL / WebGPU on the Web and native OpenGL ES / Metal on React Native.
      </Paragraph>
    </Section>
  )
}

export function KumimonoProof({ baseUrl = '' }: { baseUrl?: string }) {
  return (
    <View className="mb-20 rounded-2xl border border-hinoki/18 bg-yakisugi-900/60 p-4 sm:p-8 backdrop-blur-sm shadow-xl">
      <View className="mb-6 border-b border-hinoki/10 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <View className="shrink">
          <Heading level={2} className="text-xl sm:text-2xl font-bold text-shikkui">
            Interactive Proof: Kumimono (組物)
          </Heading>
          <Paragraph className="text-xs sm:text-sm text-stone-400 mt-1">
            Live WebGL rendering of a traditional Japanese timber joinery bracket system using
            portable bounded shaders.
          </Paragraph>
        </View>
        <View className="flex flex-row items-center gap-2 text-xs font-mono text-hinoki">
          <View className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <Text>Zero idle frame draw</Text>
        </View>
      </View>
      <Kumimono baseUrl={baseUrl} />
    </View>
  )
}

function Capability({
  number,
  title,
  lead,
  children,
}: {
  number: string
  title: string
  lead: string
  children: ReactNode
}) {
  return (
    <View className="p-6 rounded-xl border border-hinoki/18 bg-yakisugi-900/40">
      <View className="w-8 h-8 rounded-lg bg-hinoki/10 border border-hinoki/30 items-center justify-center text-hinoki font-mono font-bold text-sm mb-4">
        {number}
      </View>
      <Heading level={3} className="text-lg font-bold text-shikkui mb-2">
        {title}
      </Heading>
      <Paragraph className="text-sm text-stone-300 leading-relaxed mb-4">{lead}</Paragraph>
      <List className="text-xs text-stone-400 space-y-2 list-disc list-inside">{children}</List>
    </View>
  )
}

/** A bulleted point: `list-item` so the marker shows and the text flows inline. */
function Point({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ListItem className="list-item">
      <Strong className="text-shikkui">{label}:</Strong> {children}
    </ListItem>
  )
}

/** A key name. Hozo has no keyboard-input primitive, so this is styled text. */
function Key({ children }: { children: ReactNode }) {
  return <Code className="px-1 py-0.5 rounded bg-yakisugi-800 text-stone-300">{children}</Code>
}

export function ThreeCapabilities() {
  return (
    <Section className="mb-20">
      <Heading
        level={2}
        className="text-2xl sm:text-3xl font-bold text-shikkui mb-8 tracking-tight"
      >
        Architecture & Key Capabilities
      </Heading>
      <View className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Capability
          number="01"
          title="Three-Tier Renderers"
          lead="Switch seamlessly between three distinct targets:"
        >
          <Point label="Portable Shaders">
            Zero vendor GLSL extensions; identical output on Web and Hermes mobile.
          </Point>
          <Point label="Classic WebGL">Maximum browser reach and canvas compatibility.</Point>
          <Point label="Modern WebGPU">Compute-backed pipeline for next-generation devices.</Point>
        </Capability>
        <Capability
          number="02"
          title="R3F Native Host"
          lead="Full authoring compatibility with declarative React Three Fiber syntax."
        >
          <Point label="Declarative JSX">
            Use standard <Code className="text-hinoki">{'<mesh>'}</Code> and{' '}
            <Code className="text-hinoki">{'<group>'}</Code> tags.
          </Point>
          <Point label="Expo GL Integration">
            Direct native buffer submission without serializing vertices across the bridge.
          </Point>
          <Point label="Demand Rendering">
            Only redraws when the scene state moves, saving mobile battery.
          </Point>
        </Capability>
        <Capability
          number="03"
          title="Accessible 3D Controls"
          lead="3D objects are accompanied by semantic accessibility controls out of the box."
        >
          <Point label="ARIA Slider">
            Full keyboard stepping (<Key>Home</Key>, <Key>End</Key>, Arrows).
          </Point>
          <Point label="Screen Reader Feedback">
            Announces <Code className="text-hinoki">aria-valuetext</Code> states clearly.
          </Point>
          <Point label="Reduced Motion">
            Jumps directly to targets when the user prefers no animation.
          </Point>
        </Capability>
      </View>
    </Section>
  )
}

export function ThreeAuthoring() {
  return (
    <Section className="mb-16">
      <Heading
        level={2}
        className="text-2xl sm:text-3xl font-bold text-shikkui mb-4 tracking-tight"
      >
        Declarative Authoring
      </Heading>
      <Paragraph className="text-sm text-stone-300 mb-6 max-w-2xl">
        Author scenes with standard React patterns. Hozo compiles the scene to WebGL on the browser
        and maps directly to the Native GPU runtime on iOS/Android.
      </Paragraph>
      <Preformatted className="rounded-xl border border-hinoki/18 bg-yakisugi-900 p-4 sm:p-6 overflow-x-auto text-xs sm:text-sm font-mono text-stone-300 leading-relaxed">
        <Code>
          <Text className="text-hinoki">import</Text>
          {' { ThreeCanvas } '}
          <Text className="text-hinoki">from</Text>{' '}
          <Text className="text-tatami-light">'@hozo/three'</Text>
          {'\n'}
          <Text className="text-hinoki">import</Text>
          {' { useRef } '}
          <Text className="text-hinoki">from</Text>{' '}
          <Text className="text-tatami-light">'react'</Text>
          {'\n\n'}
          <Text className="text-hinoki">export function</Text>{' '}
          <Text className="text-shikkui">ProductViewer</Text>
          {'() {\n  '}
          <Text className="text-hinoki">return</Text>
          {' (\n    <'}
          <Text className="text-bengara">ThreeCanvas</Text>
          {'\n      '}
          <Text className="text-hinoki-light">camera</Text>
          {'={{ position: [0, 2, 5], fov: 45 }}\n      '}
          <Text className="text-hinoki-light">frameloop</Text>=
          <Text className="text-tatami-light">"demand"</Text>
          {'\n      '}
          <Text className="text-hinoki-light">accessibilityLabel</Text>=
          <Text className="text-tatami-light">"Interactive 3D Kumimono Bracket"</Text>
          {'\n    >\n      <'}
          <Text className="text-bengara">ambientLight</Text>{' '}
          <Text className="text-hinoki-light">intensity</Text>
          {'={0.6} />\n      <'}
          <Text className="text-bengara">directionalLight</Text>{' '}
          <Text className="text-hinoki-light">position</Text>
          {'={[10, 10, 5]} '}
          <Text className="text-hinoki-light">intensity</Text>
          {'={1.2} />\n      <'}
          <Text className="text-bengara">KumimonoMesh</Text>
          {' />\n    </'}
          <Text className="text-bengara">ThreeCanvas</Text>
          {'>\n  )\n}'}
        </Code>
      </Preformatted>
    </Section>
  )
}
