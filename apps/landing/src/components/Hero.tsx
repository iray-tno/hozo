import { Heading, Link, Paragraph, Section, Text, View } from '@hozo/core'

export interface HeroProps {
  baseUrl?: string
}

export function Hero({ baseUrl = '' }: HeroProps) {
  const cleanBase = baseUrl.replace(/\/$/, '')

  return (
    <Section className="relative pt-24 pb-12 sm:pt-32 sm:pb-20 md:pt-40 md:pb-28 overflow-hidden">
      {/* Timber & plaster architectural ambient lighting */}
      <View className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[640px] h-[360px] bg-glow-hinoki rounded-full blur-[140px] pointer-events-none -z-10" />
      <View className="absolute top-1/3 left-1/3 w-[420px] h-[320px] bg-glow-bengara rounded-full blur-[120px] pointer-events-none -z-10" />

      <View className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <View className="text-center max-w-4xl mx-auto flex flex-col items-center">
          {/* Architectural eyebrow tagline (Text-only) */}
          <View className="inline-flex flex-row items-center gap-2 mb-8">
            <View className="h-2 w-2 rounded-full bg-tatami-light animate-pulse" />
            <Text className="text-xs sm:text-sm font-bold uppercase tracking-widest text-hinoki">
              Rust-powered Universal UI Compiler
            </Text>
          </View>

          {/* Main Headline */}
          <Heading
            level={1}
            className="text-3xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-shikkui mb-6 leading-[1.12]"
          >
            {/* The product's name in the page's one <h1>, for search engines
                and screen readers, without changing the headline anyone sees:
                the visible line already has "Hozo" in the navbar above it. */}
            <Text className="sr-only">Hozo — </Text>
            Write React Native.
            <br />
            <Text className="gradient-text">Ship Semantic Web & Native UI.</Text>
          </Heading>

          {/* Subtitle */}
          <View className="max-w-3xl mx-auto mb-6 sm:mb-10 text-center flex flex-col gap-3">
            <Paragraph className="text-base sm:text-xl text-shikkui-muted leading-relaxed">
              Compile React Native components and styles to semantic HTML and CSS on the Web, and
              native primitives on iOS and Android.
            </Paragraph>
            <Paragraph className="text-base sm:text-lg text-hinoki font-medium leading-relaxed">
              Static paths compile away. Only truly dynamic behavior remains at runtime.
            </Paragraph>
          </View>

          {/* CTA Links */}
          <View className="flex flex-row flex-wrap items-center justify-center gap-4 mb-12">
            <Link
              href={`${cleanBase}/repl/`}
              className="px-6 py-3.5 rounded-xl font-semibold text-sm text-shikkui bg-bengara hover:bg-bengara-hover shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98] inline-flex flex-row items-center gap-2"
            >
              <span>Try the REPL</span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-yakisugi-950 text-hinoki-light border border-wood">
                Playground
              </span>
            </Link>
            <Link
              href="#try-hozo"
              className="px-6 py-3.5 rounded-xl font-semibold text-sm text-shikkui bg-yakisugi-800 hover:bg-yakisugi-700 border border-wood hover:border-wood-strong shadow-md transition-all hover:scale-[1.02] active:scale-[0.98] inline-flex flex-row items-center gap-2"
            >
              <span>Try the showcase</span>
            </Link>
            <Link
              href={`${cleanBase}/conformance/`}
              className="px-6 py-3.5 rounded-xl font-semibold text-sm text-shikkui-muted hover:text-shikkui bg-yakisugi-800 hover:bg-yakisugi-700 border border-wood hover:border-wood-strong shadow-md transition-all hover:scale-[1.02] active:scale-[0.98] inline-flex flex-row items-center gap-2"
            >
              <span>View Conformance</span>
            </Link>
          </View>

          {/* Quick Command Snippet */}
          <View
            nativeID="quick-install"
            className="w-full max-w-xl min-w-0 p-4 rounded-xl bg-yakisugi-950 border border-wood text-xs text-shikkui-muted shadow-2xl text-left"
          >
            <pre className="whitespace-pre-wrap break-words text-shikkui">
              <code>{'pnpm add @hozo/core\npnpm add -D @hozo/vite @hozo/compiler'}</code>
            </pre>
            <Link
              href="https://github.com/iray-tno/hozo#getting-started"
              className="inline-flex mt-3 text-hinoki-light underline hover:text-shikkui"
            >
              Vite setup &amp; other integrations &rarr;
            </Link>
          </View>

          {/* Key Metrics & Badges */}
          <View className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-16 max-w-4xl w-full text-left">
            <View className="p-4 rounded-xl bg-yakisugi-800 timber-grain timber-plank border-wood-strong shadow-md border">
              <Text className="text-lg sm:text-xl font-bold text-shikkui mb-1 block">
                Static paths
              </Text>
              <Text className="text-xs text-stone-400 block">Zero-runtime styling</Text>
            </View>
            <View className="p-4 rounded-xl bg-yakisugi-800 timber-grain timber-plank border-wood-strong shadow-md border">
              <Text className="text-lg sm:text-xl font-bold text-hinoki mb-1 block">
                Accessibility
              </Text>
              <Text className="text-xs text-stone-400 block">First-class by design</Text>
            </View>
            <View className="p-4 rounded-xl bg-yakisugi-800 timber-grain timber-plank border-wood-strong shadow-md border">
              <Text className="text-lg sm:text-xl font-bold text-tatami-light mb-1 block">
                Integrations
              </Text>
              <Text className="text-xs text-stone-400 block leading-tight">
                Vite · Next.js · Metro · Storybook · TanStack
              </Text>
            </View>
            <View className="p-4 rounded-xl bg-yakisugi-800 timber-grain timber-plank border-wood-strong shadow-md border">
              <Text className="text-lg sm:text-xl font-bold text-bengara mb-1 block">Compiler</Text>
              <Text className="text-xs text-stone-400 block">Rust + oxc</Text>
            </View>
          </View>
        </View>
      </View>
    </Section>
  )
}
