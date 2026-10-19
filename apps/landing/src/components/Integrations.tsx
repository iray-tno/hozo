import { Code, Heading, Link, Paragraph, Preformatted, Section, Text, View } from '@hozo/core'

export interface IntegrationsProps {
  baseUrl?: string
}

// The card's way on: the docs page that sets this integration up.
function GuideLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="mt-4 inline-flex flex-row items-center gap-1.5 text-xs font-semibold text-hinoki-light hover:text-shikkui underline transition-colors"
    >
      <Text>{`${label} setup guide`}</Text>
      <Text aria-hidden="true">&rarr;</Text>
    </Link>
  )
}

export function Integrations({ baseUrl = '' }: IntegrationsProps) {
  const cleanBase = baseUrl ? baseUrl.replace(/\/$/, '') : ''
  const storybookUrl = `${cleanBase}/storybook/`
  const guidesUrl = `${cleanBase}/docs/getting-started`

  return (
    <Section
      nativeID="integrations"
      className="py-24 border-t border-hinoki/18 relative bg-yakisugi-950"
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
            Works in the Build You Already Have
          </Heading>
          <Paragraph className="text-shikkui-muted text-base sm:text-lg leading-relaxed">
            Vite, Next.js, Metro, Astro, Storybook, and TanStack Start. Each is one plugin or
            wrapper in the config you already have, and each has a setup guide.
          </Paragraph>
        </View>

        {/* Integrations Grid */}
        <View className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {/* Vite */}
          <View className="p-6 rounded-2xl timber-panel border border-hinoki/18 hover:border-hinoki/35 transition-all flex flex-col justify-between">
            <View>
              <View className="flex flex-row items-center justify-between mb-4">
                <Heading
                  level={4}
                  className="text-lg font-bold text-shikkui flex flex-row items-center gap-2"
                >
                  <Text className="w-7 h-7 rounded-lg bg-hinoki/10 text-hinoki inline-flex flex-row items-center justify-center font-mono text-xs font-bold border border-hinoki/35">
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
              <Preformatted className="p-3 rounded-lg bg-yakisugi-900 border border-hinoki/18 font-mono text-[11px] text-shikkui-muted overflow-x-auto">
                <Code>
                  <Text className="text-hinoki">import</Text> {'{ hozo }'}{' '}
                  <Text className="text-hinoki">from</Text>{' '}
                  <Text className="text-tatami-light">'@hozo/vite'</Text>
                  {'\n\n'}
                  <Text className="text-hinoki">export default</Text> defineConfig({'{'}
                  {'\n'}
                  {'  '}
                  <Text className="text-stone-400">plugins:</Text> [{'\n'}
                  {'    '}hozo({'{ '}
                  <Text className="text-stone-400">css:</Text>{' '}
                  <Text className="text-tatami-light">'src/theme.css'</Text> {'}'}),
                  {'\n'}
                  {'    '}react(),
                  {'\n'}
                  {'  '}],
                  {'\n'}
                  {'}'})
                </Code>
              </Preformatted>
            </View>
            <GuideLink href={`${guidesUrl}/vite/`} label="Vite" />
          </View>

          {/* Next.js */}
          <View className="p-6 rounded-2xl timber-panel border border-hinoki/18 hover:border-hinoki/35 transition-all flex flex-col justify-between">
            <View>
              <View className="flex flex-row items-center justify-between mb-4">
                <Heading
                  level={4}
                  className="text-lg font-bold text-shikkui flex flex-row items-center gap-2"
                >
                  <Text className="w-7 h-7 rounded-lg bg-hinoki/10 text-shikkui inline-flex flex-row items-center justify-center font-mono text-xs font-bold border border-hinoki/18">
                    N
                  </Text>
                  <Text>Next.js</Text>
                </Heading>
                <Text className="text-xs font-mono text-stone-400">@hozo/next</Text>
              </View>
              <Paragraph className="text-stone-400 text-xs mb-4">
                Tested with Turbopack (Next.js 16) and Webpack.
              </Paragraph>
              <Preformatted className="p-3 rounded-lg bg-yakisugi-900 border border-hinoki/18 font-mono text-[11px] text-shikkui-muted overflow-x-auto">
                <Code>
                  <Text className="text-hinoki">import</Text> {'{ withHozo }'}{' '}
                  <Text className="text-hinoki">from</Text>{' '}
                  <Text className="text-tatami-light">'@hozo/next'</Text>
                  {'\n\n'}
                  <Text className="text-hinoki">export default</Text> withHozo(
                  {'\n'}
                  {'  '}
                  {'{ '}
                  <Text className="text-stone-500">{'/* next config */'}</Text> {'}'},{'\n'}
                  {'  '}
                  {'{ '}
                  <Text className="text-stone-400">css:</Text>{' '}
                  <Text className="text-tatami-light">'src/theme.css'</Text> {'}'}
                  {'\n'})
                </Code>
              </Preformatted>
            </View>
            <GuideLink href={`${guidesUrl}/next/`} label="Next.js" />
          </View>

          {/* Metro (Expo / React Native) */}
          <View className="p-6 rounded-2xl timber-panel border border-hinoki/18 hover:border-hinoki/35 transition-all flex flex-col justify-between">
            <View>
              <View className="flex flex-row items-center justify-between mb-4">
                <Heading
                  level={4}
                  className="text-lg font-bold text-shikkui flex flex-row items-center gap-2"
                >
                  <Text className="w-7 h-7 rounded-lg bg-tatami/15 text-tatami-light inline-flex flex-row items-center justify-center font-mono text-xs font-bold border border-tatami/30">
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
              <Preformatted className="p-3 rounded-lg bg-yakisugi-900 border border-hinoki/18 font-mono text-[11px] text-shikkui-muted overflow-x-auto">
                <Code>
                  <Text className="text-hinoki">const</Text> {'{ withHozo }'} = require(
                  <Text className="text-tatami-light">'@hozo/metro/config'</Text>){'\n\n'}
                  module.exports = withHozo(
                  {'\n'}
                  {'  '}getDefaultConfig(__dirname),
                  {'\n'}
                  {'  '}
                  {'{ '}
                  <Text className="text-stone-400">css:</Text>{' '}
                  <Text className="text-tatami-light">'src/theme.css'</Text> {'}'}
                  {'\n'})
                </Code>
              </Preformatted>
            </View>
            <GuideLink href={`${guidesUrl}/metro/`} label="Metro / Expo" />
          </View>

          {/* Storybook */}
          <View className="p-6 rounded-2xl timber-panel border border-hinoki/18 hover:border-hinoki/35 transition-all flex flex-col justify-between">
            <View>
              <View className="flex flex-row items-center justify-between mb-4">
                <Heading
                  level={4}
                  className="text-lg font-bold text-shikkui flex flex-row items-center gap-2"
                >
                  <Text className="w-7 h-7 rounded-lg bg-bengara/12 text-bengara inline-flex flex-row items-center justify-center font-mono text-xs font-bold border border-bengara/30">
                    S
                  </Text>
                  <Text>Storybook</Text>
                </Heading>
                <Text className="text-xs font-mono text-stone-400">@hozo/storybook</Text>
              </View>
              <Paragraph className="text-stone-400 text-xs mb-4">
                Zero-configuration preset built on top of the Vite Web backend.
              </Paragraph>
              <Preformatted className="p-3 rounded-lg bg-yakisugi-900 border border-hinoki/18 font-mono text-[11px] text-shikkui-muted overflow-x-auto mb-4">
                <Code>
                  <Text className="text-hinoki">export default</Text> {'{'}
                  {'\n'}
                  {'  '}
                  <Text className="text-stone-400">framework:</Text>{' '}
                  <Text className="text-tatami-light">'@storybook/react-vite'</Text>,{'\n'}
                  {'  '}
                  <Text className="text-stone-400">addons:</Text> [
                  <Text className="text-tatami-light">'@hozo/storybook'</Text>],
                  {'\n'}
                  {'}'}
                </Code>
              </Preformatted>
              <Link
                href={storybookUrl}
                className="inline-flex flex-row items-center gap-1.5 text-xs font-semibold text-bengara hover:text-bengara-hover transition-colors"
              >
                <Text>Open Storybook Preview</Text>
                <Text>&rarr;</Text>
              </Link>
            </View>
            <GuideLink href={`${guidesUrl}/storybook/`} label="Storybook" />
          </View>

          {/* TanStack Start */}
          <View className="p-6 rounded-2xl timber-panel border border-hinoki/18 hover:border-hinoki/35 transition-all flex flex-col justify-between">
            <View>
              <View className="flex flex-row items-center justify-between mb-4">
                <Heading
                  level={4}
                  className="text-lg font-bold text-shikkui flex flex-row items-center gap-2"
                >
                  <Text className="w-7 h-7 rounded-lg bg-hinoki/10 text-hinoki-light inline-flex flex-row items-center justify-center font-mono text-xs font-bold border border-hinoki/18">
                    T
                  </Text>
                  <Text>TanStack Start</Text>
                </Heading>
                <Text className="text-xs font-mono text-stone-400">@hozo/vite</Text>
              </View>
              <Paragraph className="text-stone-400 text-xs mb-4">
                Full-stack SSR with TanStack Start, Nitro, and Hozo Vite compilation.
              </Paragraph>
              <Preformatted className="p-3 rounded-lg bg-yakisugi-900 border border-hinoki/18 font-mono text-[11px] text-shikkui-muted overflow-x-auto">
                <Code>
                  <Text className="text-hinoki">export default</Text> defineConfig({'{'}
                  {'\n'}
                  {'  '}
                  <Text className="text-stone-400">plugins:</Text> [{'\n'}
                  {'    '}hozo({'{ '}
                  <Text className="text-stone-400">css:</Text>{' '}
                  <Text className="text-tatami-light">'src/theme.css'</Text> {'}'}),
                  {'\n'}
                  {'    '}tanstackStart(),
                  {'\n'}
                  {'  '}],
                  {'\n'}
                  {'}'})
                </Code>
              </Preformatted>
            </View>
            <GuideLink href={`${guidesUrl}/tanstack-start/`} label="TanStack Start" />
          </View>

          {/* Astro */}
          <View className="p-6 rounded-2xl timber-panel border border-hinoki/18 hover:border-hinoki/35 transition-all flex flex-col justify-between">
            <View>
              <View className="flex flex-row items-center justify-between mb-4">
                <Heading
                  level={4}
                  className="text-lg font-bold text-shikkui flex flex-row items-center gap-2"
                >
                  <Text className="w-7 h-7 rounded-lg bg-bengara/10 text-bengara inline-flex flex-row items-center justify-center font-mono text-xs font-bold border border-bengara/30">
                    A
                  </Text>
                  <Text>Astro</Text>
                </Heading>
                <Text className="text-xs font-mono text-stone-400">@hozo/vite</Text>
              </View>
              <Paragraph className="text-stone-400 text-xs mb-4">
                Static components ship no JavaScript; islands hydrate as usual.
              </Paragraph>
              <Preformatted className="p-3 rounded-lg bg-yakisugi-900 border border-hinoki/18 font-mono text-[11px] text-shikkui-muted overflow-x-auto">
                <Code>
                  <Text className="text-hinoki">export default</Text> defineConfig({'{'}
                  {'\n'}
                  {'  '}
                  <Text className="text-stone-400">integrations:</Text> [react()],
                  {'\n'}
                  {'  '}
                  <Text className="text-stone-400">vite:</Text> {'{ '}
                  <Text className="text-stone-400">plugins:</Text> [hozo({'{ '}
                  <Text className="text-stone-400">css:</Text>{' '}
                  <Text className="text-tatami-light">'src/theme.css'</Text> {'}'})] {'}'},{'\n'}
                  {'}'})
                </Code>
              </Preformatted>
            </View>
            <GuideLink href={`${guidesUrl}/astro/`} label="Astro" />
          </View>
        </View>
      </View>
    </Section>
  )
}
