import { Heading, Link, Paragraph, Section, Text, View } from '@hozo/core'

export function Architecture() {
  return (
    <Section
      nativeID="architecture"
      className="py-24 border-t border-wood relative bg-gradient-to-b from-transparent via-yakisugi-950 to-transparent"
    >
      <View className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <View className="text-center max-w-3xl mx-auto mb-16 flex flex-col items-center">
          <Text className="text-xs font-bold uppercase tracking-widest text-hinoki mb-3 block">
            Internal Design
          </Text>
          <Heading
            level={2}
            className="text-3xl sm:text-5xl font-extrabold text-shikkui tracking-tight mb-4"
          >
            Compiler Architecture
          </Heading>
          <Paragraph className="text-shikkui-muted text-base sm:text-lg leading-relaxed">
            High-performance AST parsing powered by Rust and{' '}
            <Link href="https://oxc.rs/" className="text-hinoki hover:underline font-semibold">
              oxc
            </Link>
            . A shared IR drives both backends while making platform asymmetries explicit.
          </Paragraph>
        </View>

        {/* Architecture Pipeline Diagram */}
        <View className="max-w-4xl mx-auto p-8 rounded-2xl timber-panel-glow border border-wood-strong">
          <View className="space-y-6 flex flex-col gap-6">
            {/* Level 1: Input */}
            <View className="p-4 rounded-xl bg-yakisugi-900 border border-wood text-center">
              <Text className="text-xs font-mono uppercase tracking-widest text-stone-400 mb-1 block">
                Source Code
              </Text>
              <Text className="text-base font-bold text-shikkui block">
                React Native TSX / @hozo/core Primitives
              </Text>
            </View>

            <View className="flex justify-center text-hinoki items-center">
              <svg
                className="w-6 h-6 animate-bounce"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M19 14l-7 7m0 0l-7-7m7 7V3"
                />
              </svg>
            </View>

            {/* Level 2: Rust Compiler Core */}
            <View className="p-6 rounded-xl bg-yakisugi-950 border border-wood-strong">
              <View className="flex items-center justify-between mb-4">
                <Text className="text-xs font-mono font-bold text-hinoki uppercase tracking-widest">
                  Rust Compiler Engine
                </Text>
                <Text className="text-xs font-mono px-2.5 py-0.5 rounded bg-wood-subtle text-hinoki-light border border-wood">
                  hozo_parser & hozo_ir
                </Text>
              </View>

              <View className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
                <View className="p-3 rounded-lg bg-yakisugi-900 border border-wood text-xs">
                  <Text className="font-bold text-hinoki mb-1 block">Style IR</Text>
                  <Text className="text-stone-400 text-[11px] block">
                    Tailwind & static style extraction
                  </Text>
                </View>
                <View className="p-3 rounded-lg bg-yakisugi-900 border border-wood text-xs">
                  <Text className="font-bold text-tatami-light mb-1 block">Semantic IR</Text>
                  <Text className="text-stone-400 text-[11px] block">
                    Roles, elements & state transitions
                  </Text>
                </View>
                <View className="p-3 rounded-lg bg-yakisugi-900 border border-wood text-xs">
                  <Text className="font-bold text-bengara mb-1 block">Diagnostics</Text>
                  <Text className="text-stone-400 text-[11px] block">
                    W3C ARIA static validation
                  </Text>
                </View>
              </View>
            </View>

            <View className="flex justify-center text-hinoki items-center">
              <svg
                className="w-6 h-6 animate-bounce"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M19 14l-7 7m0 0l-7-7m7 7V3"
                />
              </svg>
            </View>

            {/* Level 3: Platform Lowering */}
            <View className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Web Backend */}
              <View className="p-5 rounded-xl bg-yakisugi-900 border border-wood">
                <View className="flex items-center justify-between mb-2">
                  <Text className="text-xs font-mono font-bold text-hinoki-light">Web Backend</Text>
                  <Text className="text-[10px] font-mono text-stone-400">crates/hozo_web</Text>
                </View>
                <Text className="text-sm font-semibold text-shikkui mb-2 block">
                  Semantic DOM + CSS + ARIA
                </Text>
                <Paragraph className="text-xs text-stone-400 leading-relaxed">
                  Pure semantic HTML tags (&lt;h1&gt;, &lt;p&gt;, &lt;button&gt;), precomputed CSS
                  classes, zero runtime on static paths.
                </Paragraph>
              </View>

              {/* Native Backend */}
              <View className="p-5 rounded-xl bg-yakisugi-900 border border-tatami-subtle">
                <View className="flex items-center justify-between mb-2">
                  <Text className="text-xs font-mono font-bold text-tatami-light">
                    Native Backend
                  </Text>
                  <Text className="text-[10px] font-mono text-stone-400">crates/hozo_native</Text>
                </View>
                <Text className="text-sm font-semibold text-shikkui mb-2 block">
                  React Native Primitives (Fabric)
                </Text>
                <Paragraph className="text-xs text-stone-400 leading-relaxed">
                  View, Text, Pressable, and precomputed StyleSheet objects rendered by React
                  Native's Fabric engine.
                </Paragraph>
              </View>
            </View>
          </View>
        </View>
      </View>
    </Section>
  )
}
