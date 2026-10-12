import { Paragraph, Text, View } from '@hozo/core'
import { Tabs } from '@hozo/patterns'
import { CompilerListing, CompilerPanel } from '../CompilerListing.tsx'
import type { StylexSample } from './compiled.ts'

// The /stylex/ samples, one tab each. The outputs are compiled when the site
// is built and handed in as props; this island only switches between them.
export function StylexSamples({ samples }: { samples: StylexSample[] }) {
  return (
    <Tabs
      accessibilityLabel="StyleX samples"
      className="mb-16 rounded-2xl border border-hinoki/18 bg-yakisugi-900/60 overflow-hidden shadow-xl"
      tabListClassName="flex flex-row flex-wrap gap-1 p-2 border-b border-hinoki/18 bg-yakisugi-950/60"
      tabClassName="px-3 py-1.5 rounded-lg text-xs font-mono text-stone-400 hover:text-shikkui hover:bg-hinoki/10 aria-selected:bg-hinoki/15 aria-selected:text-hinoki"
      panelClassName="p-4 sm:p-6 focus-visible:outline-2 focus-visible:outline-hinoki"
      tabs={samples.map((sample) => ({
        label: sample.title,
        content: <Sample sample={sample} />,
      }))}
    />
  )
}

function Sample({ sample }: { sample: StylexSample }) {
  return (
    <View className="gap-4">
      <Paragraph className="text-sm text-stone-300 leading-relaxed max-w-3xl">
        {sample.summary}
      </Paragraph>
      <CompilerPanel title="Source">
        <CompilerListing>{sample.source}</CompilerListing>
      </CompilerPanel>
      <View className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CompilerPanel title="Web">
          <CompilerListing>{sample.web}</CompilerListing>
        </CompilerPanel>
        <CompilerPanel title="iOS and Android">
          <CompilerListing>{sample.native}</CompilerListing>
        </CompilerPanel>
      </View>
      {sample.diagnostics.length ? (
        <View className="gap-2">
          {sample.diagnostics.map((diagnostic) => (
            <View
              key={`${diagnostic.code}:${diagnostic.message}`}
              className="p-3 rounded-lg border border-amber-500/25 bg-amber-500/5 gap-1"
            >
              <Text className="text-xs font-mono font-semibold text-amber-300">
                {diagnostic.platform} · {diagnostic.severity} · {diagnostic.code}
              </Text>
              <Paragraph className="text-xs text-stone-300 leading-relaxed">
                {diagnostic.message}
              </Paragraph>
            </View>
          ))}
        </View>
      ) : (
        <Paragraph className="text-xs font-mono text-stone-500">No diagnostics.</Paragraph>
      )}
    </View>
  )
}
