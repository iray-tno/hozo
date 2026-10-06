import { Heading, Link, Paragraph, Section, Text, View } from '@hozo/core'

export interface DomainShowcaseProps {
  baseUrl?: string
}

export function DomainShowcase({ baseUrl = '' }: DomainShowcaseProps) {
  const cleanBase = baseUrl ? baseUrl.replace(/\/$/, '') : ''

  return (
    <Section
      nativeID="domain-showcase"
      className="py-24 border-t border-wood bg-yakisugi-950 relative overflow-hidden"
    >
      <View className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <View className="text-center max-w-3xl mx-auto mb-16 flex flex-col items-center">
          <View className="inline-flex flex-row items-center gap-2 mb-3">
            <View className="w-2 h-2 rounded-full bg-hinoki animate-pulse" />
            <Text className="text-xs font-bold uppercase tracking-widest text-hinoki">
              Architectural Pillars
            </Text>
          </View>
          <Heading
            level={2}
            className="text-3xl sm:text-5xl font-extrabold text-shikkui tracking-tight mb-4"
          >
            Specialized Graphics & Styling Domains
          </Heading>
          <Paragraph className="text-shikkui-muted text-base sm:text-lg leading-relaxed">
            Hozo eliminates silos between 3D scenes, high-density 2D canvas, scalable vector
            filters, AOT utility styles, and type-safe CSS-in-JS. Explore the dedicated guides and
            live workbenches.
          </Paragraph>
        </View>

        {/* 5 Domains Grid */}
        <View className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {/* Card 1: Three.js 3D */}
          <Link
            href={`${cleanBase}/three/`}
            className="group p-6 rounded-2xl timber-panel border border-wood hover:border-hinoki/50 transition-all flex flex-col justify-between hover:scale-[1.01] active:scale-[0.99] shadow-lg"
          >
            <View>
              <View className="flex flex-row items-center justify-between mb-4">
                <Text className="text-[11px] font-mono font-bold px-2.5 py-1 rounded bg-hinoki/10 text-hinoki border border-hinoki/20">
                  Spatial 3D
                </Text>
                <Text className="text-xs font-mono text-stone-500">@hozo/three</Text>
              </View>
              <Heading
                level={3}
                className="text-xl font-bold text-shikkui group-hover:text-hinoki transition-colors mb-2"
              >
                Three.js & 3D Spatial
              </Heading>
              <Paragraph className="text-stone-400 text-sm leading-relaxed mb-6">
                Three.js scenes on WebGL and WebGPU, with a bounded Native GPU path. Try the
                Kumimono timber joinery proof with bounded shaders and demand rendering.
              </Paragraph>
            </View>
            <View className="pt-4 border-t border-wood-subtle flex flex-row items-center justify-between text-xs font-semibold text-hinoki">
              <Text>Explore 3D Guide & Workbench</Text>
              <Text aria-hidden="true">&rarr;</Text>
            </View>
          </Link>

          {/* Card 2: 2D Canvas */}
          <Link
            href={`${cleanBase}/canvas/`}
            className="group p-6 rounded-2xl timber-panel border border-wood hover:border-tatami-light/50 transition-all flex flex-col justify-between hover:scale-[1.01] active:scale-[0.99] shadow-lg"
          >
            <View>
              <View className="flex flex-row items-center justify-between mb-4">
                <Text className="text-[11px] font-mono font-bold px-2.5 py-1 rounded bg-tatami/15 text-tatami-light border border-tatami/30">
                  Data Density
                </Text>
                <Text className="text-xs font-mono text-stone-500">@hozo/canvas</Text>
              </View>
              <Heading
                level={3}
                className="text-xl font-bold text-shikkui group-hover:text-tatami-light transition-colors mb-2"
              >
                Declarative 2D Canvas
              </Heading>
              <Paragraph className="text-stone-400 text-sm leading-relaxed mb-6">
                Charts, particle fields, and heatmaps on a single drawing surface. Compiles to HTML5
                Canvas on Web and React Native Skia on Mobile.
              </Paragraph>
            </View>
            <View className="pt-4 border-t border-wood-subtle flex flex-row items-center justify-between text-xs font-semibold text-tatami-light">
              <Text>Explore 2D Canvas Guide & Demo</Text>
              <Text aria-hidden="true">&rarr;</Text>
            </View>
          </Link>

          {/* Card 3: Universal SVG */}
          <Link
            href={`${cleanBase}/svg/`}
            className="group p-6 rounded-2xl timber-panel border border-wood hover:border-hinoki-light/50 transition-all flex flex-col justify-between hover:scale-[1.01] active:scale-[0.99] shadow-lg"
          >
            <View>
              <View className="flex flex-row items-center justify-between mb-4">
                <Text className="text-[11px] font-mono font-bold px-2.5 py-1 rounded bg-hinoki-light/10 text-hinoki-light border border-hinoki-light/20">
                  Vector & Filters
                </Text>
                <Text className="text-xs font-mono text-stone-500">@hozo/svg</Text>
              </View>
              <Heading
                level={3}
                className="text-xl font-bold text-shikkui group-hover:text-hinoki-light transition-colors mb-2"
              >
                Universal SVG & Filters
              </Heading>
              <Paragraph className="text-stone-400 text-sm leading-relaxed mb-6">
                Zero-runtime vector lowering into native DOM SVG and react-native-svg. Features live
                filter effects (feDropShadow, feGaussianBlur) and Svg.Link.
              </Paragraph>
            </View>
            <View className="pt-4 border-t border-wood-subtle flex flex-row items-center justify-between text-xs font-semibold text-hinoki-light">
              <Text>Explore SVG Guide & Studio</Text>
              <Text aria-hidden="true">&rarr;</Text>
            </View>
          </Link>

          {/* Card 4: Ahead-of-Time Tailwind */}
          <Link
            href={`${cleanBase}/tailwind/`}
            className="group p-6 rounded-2xl timber-panel border border-wood hover:border-bengara/50 transition-all flex flex-col justify-between hover:scale-[1.01] active:scale-[0.99] shadow-lg"
          >
            <View>
              <View className="flex flex-row items-center justify-between mb-4">
                <Text className="text-[11px] font-mono font-bold px-2.5 py-1 rounded bg-bengara/15 text-bengara border border-bengara/30">
                  AOT Utility Styling
                </Text>
                <Text className="text-xs font-mono text-stone-500">@hozo/tailwind</Text>
              </View>
              <Heading
                level={3}
                className="text-xl font-bold text-shikkui group-hover:text-bengara-hover transition-colors mb-2"
              >
                Tailwind AOT Compiler
              </Heading>
              <Paragraph className="text-stone-400 text-sm leading-relaxed mb-6">
                Zero-runtime 3-tier style resolution, cross-platform pseudo-classes (hover:,
                focus-visible:, dark:), and verified official engine fidelity.
              </Paragraph>
            </View>
            <View className="pt-4 border-t border-wood-subtle flex flex-row items-center justify-between text-xs font-semibold text-bengara">
              <Text>Explore Tailwind AOT & Conformance</Text>
              <Text aria-hidden="true">&rarr;</Text>
            </View>
          </Link>

          {/* Card 5: StyleX CSS-in-JS */}
          <Link
            href={`${cleanBase}/stylex/`}
            className="group p-6 rounded-2xl timber-panel border border-wood hover:border-hinoki/50 transition-all flex flex-col justify-between hover:scale-[1.01] active:scale-[0.99] shadow-lg md:col-span-2 lg:col-span-1"
          >
            <View>
              <View className="flex flex-row items-center justify-between mb-4">
                <Text className="text-[11px] font-mono font-bold px-2.5 py-1 rounded bg-hinoki/10 text-hinoki border border-hinoki/20">
                  Type-Safe Tokens
                </Text>
                <Text className="text-xs font-mono text-stone-500">@hozo/stylex</Text>
              </View>
              <Heading
                level={3}
                className="text-xl font-bold text-shikkui group-hover:text-hinoki transition-colors mb-2"
              >
                StyleX CSS-in-JS
              </Heading>
              <Paragraph className="text-stone-400 text-sm leading-relaxed mb-6">
                Zero-runtime static analysis for Meta's StyleX. Deterministic style merge order and
                typed token contracts, seamlessly coexisting with Tailwind.
              </Paragraph>
            </View>
            <View className="pt-4 border-t border-wood-subtle flex flex-row items-center justify-between text-xs font-semibold text-hinoki">
              <Text>Explore StyleX Guide & Contracts</Text>
              <Text aria-hidden="true">&rarr;</Text>
            </View>
          </Link>

          {/* Card 6: Conformance & Evidence */}
          <Link
            href={`${cleanBase}/conformance/`}
            className="group p-6 rounded-2xl timber-panel border border-wood hover:border-white/40 transition-all flex flex-col justify-between hover:scale-[1.01] active:scale-[0.99] shadow-lg md:col-span-2 lg:col-span-1"
          >
            <View>
              <View className="flex flex-row items-center justify-between mb-4">
                <Text className="text-[11px] font-mono font-bold px-2.5 py-1 rounded bg-white/10 text-shikkui border border-white/20">
                  Differential Snapshot
                </Text>
                <Text className="text-xs font-mono text-emerald-400">CI Verified</Text>
              </View>
              <Heading
                level={3}
                className="text-xl font-bold text-shikkui group-hover:text-white transition-colors mb-2"
              >
                Conformance Matrix
              </Heading>
              <Paragraph className="text-stone-400 text-sm leading-relaxed mb-6">
                Live differential snapshot generated from automated CI suites, measuring exact
                oracle fidelity against Tailwind, React Native Fabric, and W3C ARIA.
              </Paragraph>
            </View>
            <View className="pt-4 border-t border-wood-subtle flex flex-row items-center justify-between text-xs font-semibold text-stone-300">
              <Text>View Automated Conformance</Text>
              <Text aria-hidden="true">&rarr;</Text>
            </View>
          </Link>
        </View>
      </View>
    </Section>
  )
}
