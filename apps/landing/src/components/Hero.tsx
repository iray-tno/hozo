import { Heading, Link, Paragraph, Section, Text, View } from '@hozo/core'

export interface HeroProps {
  baseUrl?: string
}

export function Hero({ baseUrl = '' }: HeroProps) {
  const cleanBase = baseUrl.replace(/\/$/, '')
  const storybookUrl = `${cleanBase}/storybook/`

  return (
    <Section className="relative pt-32 pb-20 md:pt-40 md:pb-28 overflow-hidden">
      {/* Timber & plaster architectural ambient lighting */}
      <View className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[640px] h-[360px] bg-glow-hinoki rounded-full blur-[140px] pointer-events-none -z-10" />
      <View className="absolute top-1/3 left-1/3 w-[420px] h-[320px] bg-glow-bengara rounded-full blur-[120px] pointer-events-none -z-10" />

      <View className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <View className="text-center max-w-4xl mx-auto flex flex-col items-center">
          {/* Architectural eyebrow tagline (Text-only) */}
          <View className="inline-flex items-center gap-2.5 mb-8">
            <View className="flex h-2 w-2 rounded-full bg-tatami-light animate-pulse" />
            <Text className="text-xs sm:text-sm font-bold uppercase tracking-widest text-hinoki">
              Hozo — Rust-powered Universal UI Compiler
            </Text>
            <Text className="text-xs text-stone-600 select-none">•</Text>
            <Text className="text-xs sm:text-sm text-shikkui-muted font-medium tracking-wide">
              Zero Runtime • Semantic Web & Fabric
            </Text>
          </View>

          {/* Main Headline */}
          <Heading
            level={1}
            className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-shikkui mb-6 leading-[1.12]"
          >
            Like joinery without nails.
            <br />
            <Text className="gradient-text">Compiled cleanly to Semantic Web & Fabric.</Text>
          </Heading>

          {/* Subtitle */}
          <Paragraph className="text-lg sm:text-xl text-shikkui-muted mb-10 leading-relaxed max-w-3xl mx-auto">
            Inspired by traditional Japanese joinery, Hozo fits React Native components into each
            platform's native primitives without extraneous runtime glue:
            <Text className="text-shikkui font-semibold"> Semantic HTML, CSS, and W3C ARIA</Text> on
            Web, and <Text className="text-shikkui font-semibold">Fabric and StyleSheet</Text> on
            Native.
          </Paragraph>

          {/* CTA Links */}
          <View className="flex flex-wrap items-center justify-center gap-4 mb-12">
            <Link
              href={`${cleanBase}/repl/`}
              className="px-6 py-3.5 rounded-xl font-semibold text-sm text-shikkui bg-bengara hover:bg-bengara-hover shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98] inline-flex items-center gap-2"
            >
              <span>Interactive REPL</span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-yakisugi-950 text-hinoki-light border border-wood">
                Playground
              </span>
            </Link>
            <Link
              href={storybookUrl}
              className="px-6 py-3.5 rounded-xl font-semibold text-sm text-shikkui bg-yakisugi-800 hover:bg-yakisugi-700 border border-wood hover:border-wood-strong shadow-md transition-all hover:scale-[1.02] active:scale-[0.98] inline-flex items-center gap-2"
            >
              <span>Explore Storybook</span>
            </Link>
            <Link
              href={`${cleanBase}/reports/`}
              className="px-6 py-3.5 rounded-xl font-semibold text-sm text-hinoki-light hover:text-shikkui bg-yakisugi-800 hover:bg-yakisugi-700 border border-wood hover:border-wood-strong shadow-md transition-all hover:scale-[1.02] active:scale-[0.98] inline-flex items-center gap-2"
            >
              <span>Test Reports (Allure)</span>
            </Link>
            <Link
              href={`${cleanBase}/conformance/`}
              className="px-6 py-3.5 rounded-xl font-semibold text-sm text-shikkui-muted hover:text-shikkui bg-yakisugi-800 hover:bg-yakisugi-700 border border-wood hover:border-wood-strong shadow-md transition-all hover:scale-[1.02] active:scale-[0.98] inline-flex items-center gap-2"
            >
              <span>Conformance Matrix</span>
            </Link>
          </View>

          {/* Quick Command Snippet */}
          <View className="inline-flex items-center gap-3 px-4 py-2.5 rounded-xl bg-yakisugi-950 border border-wood text-xs text-shikkui-muted shadow-2xl backdrop-blur-md">
            <Text className="text-hinoki font-bold select-none">$</Text>
            <Text className="text-shikkui font-medium">pnpm add -D @hozo/vite @hozo/compiler</Text>
            <Text className="text-stone-600">|</Text>
            <Text className="text-stone-400">Zero config fallback</Text>
          </View>

          {/* Key Metrics & Badges */}
          <View className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-16 max-w-4xl w-full text-left">
            <View className="p-4 rounded-xl bg-yakisugi-800 timber-grain timber-plank border-wood-strong shadow-md border">
              <Text className="text-2xl font-bold text-shikkui mb-1 block">0 ms</Text>
              <Text className="text-xs text-stone-400 block">Runtime cost for static styles</Text>
            </View>
            <View className="p-4 rounded-xl bg-yakisugi-800 timber-grain timber-plank border-wood-strong shadow-md border">
              <Text className="text-2xl font-bold text-hinoki mb-1 block">W3C ARIA</Text>
              <Text className="text-xs text-stone-400 block">
                Static validation via{' '}
                <code className="text-shikkui-muted text-xs font-mono">aria-query</code>
              </Text>
            </View>
            <View className="p-4 rounded-xl bg-yakisugi-800 timber-grain timber-plank border-wood-strong shadow-md border">
              <Text className="text-2xl font-bold text-tatami-light mb-1 block">5 Bundlers</Text>
              <Text className="text-xs text-stone-400 block">
                Vite, Next, Metro, Storybook, TanStack
              </Text>
            </View>
            <View className="p-4 rounded-xl bg-yakisugi-800 timber-grain timber-plank border-wood-strong shadow-md border">
              <Text className="text-2xl font-bold text-bengara mb-1 block">Rust Core</Text>
              <Text className="text-xs text-stone-400 block">High-speed AST parsing with oxc</Text>
            </View>
          </View>
        </View>
      </View>
    </Section>
  )
}
