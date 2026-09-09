import { Heading, Link, Paragraph, Section, Text, View } from '@hozo/core'

export interface IntegrationsProps {
  baseUrl?: string
}

export function Integrations({ baseUrl = '' }: IntegrationsProps) {
  const cleanBase = baseUrl ? baseUrl.replace(/\/$/, '') : ''
  const storybookUrl = `${cleanBase}/storybook/`
  const conformanceUrl = `${cleanBase}/conformance/`

  return (
    <Section
      nativeID="integrations"
      className="py-24 border-t border-wood relative bg-yakisugi-950"
    >
      <View className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <View className="text-center max-w-3xl mx-auto mb-16 flex flex-col items-center">
          <Text className="text-xs font-bold uppercase tracking-widest text-hinoki mb-3 block">
            Ecosystem
          </Text>
          <Heading
            level={2}
            className="text-3xl sm:text-5xl font-extrabold text-shikkui tracking-tight mb-4"
          >
            Five Bundler and Framework Integrations
          </Heading>
          <Paragraph className="text-shikkui-muted text-base sm:text-lg leading-relaxed">
            Vite, Next.js, Metro, Storybook, and TanStack Start. Across supported stacks, Hozo
            integrates in a single line of configuration.
          </Paragraph>
        </View>

        {/* Integrations Grid */}
        <View className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {/* Vite */}
          <View className="p-6 rounded-2xl timber-panel border border-wood hover:border-wood-strong transition-all flex flex-col justify-between">
            <View>
              <View className="flex items-center justify-between mb-4">
                <Heading
                  level={4}
                  className="text-lg font-bold text-shikkui flex items-center gap-2"
                >
                  <Text className="w-7 h-7 rounded-lg bg-wood-subtle text-hinoki flex items-center justify-center font-mono text-xs font-bold border border-wood-strong">
                    V
                  </Text>
                  <Text>Vite</Text>
                </Heading>
                <Text className="text-xs font-mono text-stone-400">@hozo/vite</Text>
              </View>
              <Paragraph className="text-stone-400 text-xs mb-4">
                Executes ahead of the React plugin, lowering JSX directly to semantic DOM and
                compiled CSS.
              </Paragraph>
              <pre className="p-3 rounded-lg bg-yakisugi-900 border border-wood font-mono text-[11px] text-shikkui-muted overflow-x-auto">
                <code>
                  <span className="text-hinoki">import</span> {'{ hozo }'}{' '}
                  <span className="text-hinoki">from</span>{' '}
                  <span className="text-tatami-light">'@hozo/vite'</span>
                  {'\n\n'}
                  <span className="text-hinoki">export default</span> defineConfig({'{'}
                  {'\n'}
                  {'  '}
                  <span className="text-stone-400">plugins:</span> [{'\n'}
                  {'    '}hozo({'{ '}
                  <span className="text-stone-400">css:</span>{' '}
                  <span className="text-tatami-light">'src/theme.css'</span> {'}'}),
                  {'\n'}
                  {'    '}react(),
                  {'\n'}
                  {'  '}],
                  {'\n'}
                  {'}'})
                </code>
              </pre>
            </View>
          </View>

          {/* Next.js */}
          <View className="p-6 rounded-2xl timber-panel border border-wood hover:border-wood-strong transition-all flex flex-col justify-between">
            <View>
              <View className="flex items-center justify-between mb-4">
                <Heading
                  level={4}
                  className="text-lg font-bold text-shikkui flex items-center gap-2"
                >
                  <Text className="w-7 h-7 rounded-lg bg-wood-subtle text-shikkui flex items-center justify-center font-mono text-xs font-bold border border-wood">
                    N
                  </Text>
                  <Text>Next.js</Text>
                </Heading>
                <Text className="text-xs font-mono text-stone-400">@hozo/next</Text>
              </View>
              <Paragraph className="text-stone-400 text-xs mb-4">
                Verified with Turbopack (Next.js 16) and Webpack with zero manual setup.
              </Paragraph>
              <pre className="p-3 rounded-lg bg-yakisugi-900 border border-wood font-mono text-[11px] text-shikkui-muted overflow-x-auto">
                <code>
                  <span className="text-hinoki">import</span> {'{ withHozo }'}{' '}
                  <span className="text-hinoki">from</span>{' '}
                  <span className="text-tatami-light">'@hozo/next'</span>
                  {'\n\n'}
                  <span className="text-hinoki">export default</span> withHozo(
                  {'\n'}
                  {'  '}
                  {'{ '}
                  <span className="text-stone-500">{'/* next config */'}</span> {'}'},{'\n'}
                  {'  '}
                  {'{ '}
                  <span className="text-stone-400">css:</span>{' '}
                  <span className="text-tatami-light">'src/theme.css'</span> {'}'}
                  {'\n'})
                </code>
              </pre>
            </View>
          </View>

          {/* Metro (Expo / React Native) */}
          <View className="p-6 rounded-2xl timber-panel border border-wood hover:border-wood-strong transition-all flex flex-col justify-between">
            <View>
              <View className="flex items-center justify-between mb-4">
                <Heading
                  level={4}
                  className="text-lg font-bold text-shikkui flex items-center gap-2"
                >
                  <Text className="w-7 h-7 rounded-lg bg-tatami-subtle text-tatami-light flex items-center justify-center font-mono text-xs font-bold border border-tatami-subtle">
                    M
                  </Text>
                  <Text>Metro / Expo</Text>
                </Heading>
                <Text className="text-xs font-mono text-stone-400">@hozo/metro</Text>
              </View>
              <Paragraph className="text-stone-400 text-xs mb-4">
                Compiles React Native components into optimized native StyleSheets and Fabric
                primitives.
              </Paragraph>
              <pre className="p-3 rounded-lg bg-yakisugi-900 border border-wood font-mono text-[11px] text-shikkui-muted overflow-x-auto">
                <code>
                  <span className="text-hinoki">const</span> {'{ withHozo }'} = require(
                  <span className="text-tatami-light">'@hozo/metro/config'</span>){'\n\n'}
                  module.exports = withHozo(
                  {'\n'}
                  {'  '}getDefaultConfig(__dirname),
                  {'\n'}
                  {'  '}
                  {'{ '}
                  <span className="text-stone-400">css:</span>{' '}
                  <span className="text-tatami-light">'src/theme.css'</span> {'}'}
                  {'\n'})
                </code>
              </pre>
            </View>
          </View>

          {/* Storybook */}
          <View className="p-6 rounded-2xl timber-panel border border-wood hover:border-wood-strong transition-all flex flex-col justify-between">
            <View>
              <View className="flex items-center justify-between mb-4">
                <Heading
                  level={4}
                  className="text-lg font-bold text-shikkui flex items-center gap-2"
                >
                  <Text className="w-7 h-7 rounded-lg bg-bengara-subtle text-bengara flex items-center justify-center font-mono text-xs font-bold border border-bengara-subtle">
                    S
                  </Text>
                  <Text>Storybook</Text>
                </Heading>
                <Text className="text-xs font-mono text-stone-400">@hozo/storybook</Text>
              </View>
              <Paragraph className="text-stone-400 text-xs mb-4">
                Zero-configuration preset built on top of the Vite Web backend.
              </Paragraph>
              <pre className="p-3 rounded-lg bg-yakisugi-900 border border-wood font-mono text-[11px] text-shikkui-muted overflow-x-auto mb-4">
                <code>
                  <span className="text-hinoki">export default</span> {'{'}
                  {'\n'}
                  {'  '}
                  <span className="text-stone-400">framework:</span>{' '}
                  <span className="text-tatami-light">'@storybook/react-vite'</span>,{'\n'}
                  {'  '}
                  <span className="text-stone-400">addons:</span> [
                  <span className="text-tatami-light">'@hozo/storybook'</span>],
                  {'\n'}
                  {'}'}
                </code>
              </pre>
              <Link
                href={storybookUrl}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-bengara hover:text-bengara-hover transition-colors"
              >
                <Text>Open Storybook Preview</Text>
                <Text>&rarr;</Text>
              </Link>
            </View>
          </View>

          {/* TanStack Start */}
          <View className="p-6 rounded-2xl timber-panel border border-wood hover:border-wood-strong transition-all flex flex-col justify-between">
            <View>
              <View className="flex items-center justify-between mb-4">
                <Heading
                  level={4}
                  className="text-lg font-bold text-shikkui flex items-center gap-2"
                >
                  <Text className="w-7 h-7 rounded-lg bg-wood-subtle text-hinoki-light flex items-center justify-center font-mono text-xs font-bold border border-wood">
                    T
                  </Text>
                  <Text>TanStack Start</Text>
                </Heading>
                <Text className="text-xs font-mono text-stone-400">@hozo/vite</Text>
              </View>
              <Paragraph className="text-stone-400 text-xs mb-4">
                Full-stack SSR with TanStack Start, Nitro, and Hozo Vite compilation.
              </Paragraph>
              <pre className="p-3 rounded-lg bg-yakisugi-900 border border-wood font-mono text-[11px] text-shikkui-muted overflow-x-auto">
                <code>
                  <span className="text-hinoki">export default</span> defineConfig({'{'}
                  {'\n'}
                  {'  '}
                  <span className="text-stone-400">plugins:</span> [{'\n'}
                  {'    '}hozo({'{ '}
                  <span className="text-stone-400">css:</span>{' '}
                  <span className="text-tatami-light">'src/theme.css'</span> {'}'}),
                  {'\n'}
                  {'    '}tanstackStart(),
                  {'\n'}
                  {'  '}],
                  {'\n'}
                  {'}'})
                </code>
              </pre>
            </View>
          </View>

          {/* Conformance */}
          <View className="p-6 rounded-2xl timber-panel border border-wood hover:border-wood-strong transition-all flex flex-col justify-between">
            <View>
              <View className="flex items-center justify-between mb-4">
                <Heading
                  level={4}
                  className="text-lg font-bold text-shikkui flex items-center gap-2"
                >
                  <Text className="w-7 h-7 rounded-lg bg-tatami-subtle text-tatami-light flex items-center justify-center font-mono text-xs font-bold border border-tatami-subtle">
                    C
                  </Text>
                  <Text>Conformance</Text>
                </Heading>
                <Text className="text-xs font-mono text-stone-400">@hozo/tailwind-conformance</Text>
              </View>
              <Paragraph className="text-stone-400 text-xs mb-4">
                Automated differential test suite comparing Hozo 1:1 against the official Tailwind
                engine.
              </Paragraph>
              <View className="p-3 rounded-lg bg-yakisugi-900 border border-wood text-xs text-tatami-light font-mono mb-4">
                <Text>&check; Continuous differential snapshots verified in CI</Text>
              </View>
              <Link
                href={conformanceUrl}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-hinoki hover:text-hinoki-light transition-colors"
              >
                <Text>Open Conformance Matrix</Text>
                <Text>&rarr;</Text>
              </Link>
            </View>
          </View>
        </View>
      </View>
    </Section>
  )
}
