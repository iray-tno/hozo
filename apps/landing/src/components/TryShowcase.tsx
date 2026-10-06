import { Heading, Link, Paragraph, Section, Text, View } from '@hozo/core'
import type { ShowcaseRelease } from '../lib/showcase-release'

export function TryShowcase({
  baseUrl = '',
  release,
}: {
  baseUrl?: string
  release?: ShowcaseRelease
}) {
  const base = baseUrl.replace(/\/$/, '')
  return (
    <Section nativeID="try-hozo" className="py-16 sm:py-24 border-t border-wood bg-yakisugi-900">
      <View className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <View className="max-w-3xl mb-8">
          <Heading
            level={2}
            className="text-3xl sm:text-5xl font-extrabold text-shikkui tracking-tight mb-4"
          >
            Try Hozo
          </Heading>
          <Paragraph className="text-shikkui-muted leading-relaxed">
            Explore the components, SVG effects and 3D scenes in the browser or the native showcase.
          </Paragraph>
        </View>
        <View className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <View className="p-6 rounded-2xl timber-panel flex flex-col gap-4">
            <Heading level={3} className="text-xl font-bold text-shikkui">
              Web
            </Heading>
            <Paragraph className="text-sm text-shikkui-muted leading-relaxed">
              Open the component catalogue. No install needed.
            </Paragraph>
            <Link
              href={`${base}/storybook/`}
              className="showcase-action mt-auto inline-flex flex-row items-center justify-center rounded-lg px-4 py-3 bg-bengara hover:bg-bengara-hover text-shikkui text-sm font-semibold"
            >
              Open Web Storybook
            </Link>
          </View>
          <View className="p-6 rounded-2xl timber-panel flex flex-col gap-4">
            <Heading level={3} className="text-xl font-bold text-shikkui">
              Android
            </Heading>
            <Paragraph className="text-sm text-shikkui-muted leading-relaxed">
              Standalone APK for an Android phone. No Metro server or Expo Go needed.
            </Paragraph>
            {release ? (
              <Link
                href={release.android}
                className="showcase-action mt-auto inline-flex flex-row items-center justify-center rounded-lg px-4 py-3 bg-yakisugi-800 border border-wood hover:border-wood-strong text-hinoki-light text-sm font-semibold"
              >
                Download Android APK
              </Link>
            ) : (
              <Link
                href="https://github.com/iray-tno/hozo/releases"
                className="showcase-action mt-auto inline-flex flex-row items-center justify-center rounded-lg px-4 py-3 bg-yakisugi-800 border border-wood hover:border-wood-strong text-hinoki-light text-sm font-semibold"
              >
                Check native releases
              </Link>
            )}
          </View>
          <View className="p-6 rounded-2xl timber-panel flex flex-col gap-4">
            <Heading level={3} className="text-xl font-bold text-shikkui">
              iOS Simulator
            </Heading>
            <Paragraph className="text-sm text-shikkui-muted leading-relaxed">
              For a Mac with Xcode. Simulator app only—not an iPhone app or TestFlight build.
            </Paragraph>
            {release ? (
              <Link
                href={release.ios}
                className="showcase-action mt-auto inline-flex flex-row items-center justify-center rounded-lg px-4 py-3 bg-yakisugi-800 border border-wood hover:border-wood-strong text-hinoki-light text-sm font-semibold"
              >
                Download Simulator app
              </Link>
            ) : (
              <Link
                href="https://github.com/iray-tno/hozo/tree/main/examples/native-showcase"
                className="showcase-action mt-auto inline-flex flex-row items-center justify-center rounded-lg px-4 py-3 bg-yakisugi-800 border border-wood hover:border-wood-strong text-hinoki-light text-sm font-semibold"
              >
                Build the native showcase
              </Link>
            )}
          </View>
        </View>
        <View className="flex flex-row flex-wrap items-center gap-x-6 gap-y-3 mt-6 text-sm text-shikkui-muted">
          {release ? (
            <>
              <Link href={release.url} className="underline hover:text-shikkui">
                <Text>{release.tag} release notes &amp; checksums</Text>
              </Link>
              <Link href={release.instructions} className="underline hover:text-shikkui">
                Installation instructions
              </Link>
            </>
          ) : (
            <Paragraph>
              Native downloads appear here when a release includes both apps and installation
              instructions.
            </Paragraph>
          )}
          <Link
            href="https://github.com/iray-tno/hozo#getting-started"
            className="underline hover:text-shikkui"
          >
            Use Hozo in your project
          </Link>
        </View>
      </View>
    </Section>
  )
}
