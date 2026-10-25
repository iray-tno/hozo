import { Code, Heading, List, ListItem, Paragraph, Section, Strong, Text, View } from '@hozo/core'
import type { ReactNode } from 'react'
import type { CodeSnippet } from '../../lib/code-snippets.ts'
import { StaticCodeSnippet } from '../StaticCodeSnippet.tsx'

// The static sections around the /three/ demo, in Hozo primitives.

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

export function ThreeAuthoring({ snippet }: { snippet: CodeSnippet }) {
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
      <StaticCodeSnippet snippet={snippet} />
    </Section>
  )
}
