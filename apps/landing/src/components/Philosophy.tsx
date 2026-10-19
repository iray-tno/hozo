import { Code, Heading, Link, Paragraph, Section, Text, View } from '@hozo/core'

export function Philosophy() {
  return (
    <Section
      nativeID="philosophy"
      className="py-24 border-t border-hinoki/18 relative bg-yakisugi-900"
    >
      <View className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <View className="text-center max-w-3xl mx-auto mb-16 flex flex-col items-center">
          <Text className="text-xs font-bold uppercase tracking-widest text-hinoki mb-3 block">
            Why Hozo
          </Text>
          <Heading
            level={2}
            className="text-3xl sm:text-5xl font-extrabold text-shikkui tracking-tight mb-4"
          >
            Keep the source. Lose the runtime.
          </Heading>
          <Paragraph className="text-shikkui-muted text-base sm:text-lg leading-relaxed">
            React Native on the Web usually means React Native for Web: a runtime that turns
            components and styles into DOM in the browser, on every render. Hozo does that work at
            build time wherever the source says enough, and leaves a runtime only where it does not.
          </Paragraph>
        </View>

        <View className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {/* Pillar 1 */}
          <View className="p-8 rounded-2xl timber-panel relative overflow-hidden group hover:border-hinoki/35 transition-all border border-hinoki/18">
            <View className="w-12 h-12 rounded-xl bg-yakisugi-800 timber-grain timber-plank border border-hinoki/35 items-center justify-center text-hinoki font-bold text-base mb-6 group-hover:scale-105 transition-transform font-mono shadow-sm">
              01
            </View>
            <Heading level={3} className="text-xl font-bold text-shikkui mb-3">
              Existing Source First
            </Heading>
            <Paragraph className="text-stone-400 text-sm leading-relaxed mb-4">
              Write standard components imported from{' '}
              <Code className="text-shikkui-muted text-xs font-mono">react-native</Code> or{' '}
              <Code className="text-shikkui-muted text-xs font-mono">@hozo/core</Code>. No
              proprietary DSL, no framework rewrites. Adopt it file by file, and run the migration
              audit first to see what changes before anything does.
            </Paragraph>
            <View className="p-3 rounded-lg bg-yakisugi-950 border border-hinoki/18 text-xs text-shikkui-muted font-mono">
              <Text>
                <Text className="text-hinoki">import</Text> {'{ View, Text }'}{' '}
                <Text className="text-hinoki">from</Text>{' '}
                <Text className="text-tatami-light">'react-native'</Text>
              </Text>
            </View>
            <Link
              href="#integrations"
              className="mt-4 inline-flex text-sm font-semibold text-hinoki-light underline hover:text-shikkui"
            >
              Add it to your bundler &rarr;
            </Link>
          </View>

          {/* Pillar 2 */}
          <View className="p-8 rounded-2xl timber-panel relative overflow-hidden group hover:border-hinoki/35 transition-all border border-hinoki/18">
            <View className="w-12 h-12 rounded-xl bg-yakisugi-800 timber-grain timber-plank border border-bengara/30 items-center justify-center text-bengara font-bold text-base mb-6 group-hover:scale-105 transition-transform font-mono shadow-sm">
              02
            </View>
            <Heading level={3} className="text-xl font-bold text-shikkui mb-3">
              First-Class Accessibility
            </Heading>
            <Paragraph className="text-stone-400 text-sm leading-relaxed mb-4">
              ARIA is not an afterthought or runtime patch. Hozo checks roles and their required
              attributes against the WAI-ARIA data in{' '}
              <Code className="text-shikkui-muted text-xs font-mono">aria-query</Code> on every
              build, and names the file and line of each problem it finds.
            </Paragraph>
            <View className="p-3 rounded-lg bg-yakisugi-950 border border-hinoki/18 text-xs text-shikkui-muted font-mono">
              Build-time ARIA checks + semantic elements from semantic primitives
            </View>
            <Link
              href="#accessibility"
              className="mt-4 inline-flex text-sm font-semibold text-hinoki-light underline hover:text-shikkui"
            >
              How accessibility is checked &rarr;
            </Link>
          </View>

          {/* Pillar 3 */}
          <View className="p-8 rounded-2xl timber-panel relative overflow-hidden group hover:border-hinoki/35 transition-all border border-hinoki/18">
            <View className="w-12 h-12 rounded-xl bg-yakisugi-800 timber-grain timber-plank border border-tatami/30 items-center justify-center text-tatami-light font-bold text-base mb-6 group-hover:scale-105 transition-transform font-mono shadow-sm">
              03
            </View>
            <Heading level={3} className="text-xl font-bold text-shikkui mb-3">
              Zero-Runtime Static Paths
            </Heading>
            <Paragraph className="text-stone-400 text-sm leading-relaxed mb-4">
              Class names the build can read compile to CSS classes on the Web and precomputed
              StyleSheets on Native, with no style work left at runtime. A conditional class
              compiles each branch, so only the condition is left to run.
            </Paragraph>
            <View className="p-3 rounded-lg bg-yakisugi-950 border border-hinoki/18 text-xs text-tatami-light font-mono">
              Static (0 JS) &rarr; Structural (Boolean fold) &rarr; Dynamic fallback
            </View>
            <Link
              href="#performance"
              className="mt-4 inline-flex text-sm font-semibold text-hinoki-light underline hover:text-shikkui"
            >
              How styles compile &rarr;
            </Link>
          </View>
        </View>
      </View>
    </Section>
  )
}
