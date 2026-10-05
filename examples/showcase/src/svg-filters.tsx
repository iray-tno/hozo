import { Button, Text, View } from '@hozo/primitives'
import { Heading } from '@hozo/typography'
import { useId, useState } from 'react'
import { SVG_FILTER_KINDS, SVG_FILTER_LABELS, SvgFilterScene } from './svg-filter-scene.tsx'

function FilterCard({
  kind,
  enabled,
  idPrefix,
}: {
  kind: (typeof SVG_FILTER_KINDS)[number]
  enabled: boolean
  idPrefix: string
}) {
  return (
    <View className="gap-2">
      <Text className="text-base text-slate-900">{SVG_FILTER_LABELS[kind]}</Text>
      <SvgFilterScene kind={kind} enabled={enabled} idPrefix={idPrefix} />
    </View>
  )
}

export function SvgFiltersDemo() {
  const [enabled, setEnabled] = useState(true)
  // Native also resolves url(#id); separate mounted galleries must not share
  // definitions. Restrict useId's punctuation to a portable SVG identifier.
  const idPrefix = `filters-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  return (
    <View className="w-full max-w-lg gap-4 rounded-2xl bg-white p-6">
      <Heading level={2} className="text-xl font-bold text-slate-900">
        SVG filters
      </Heading>
      <Button
        onPress={() => setEnabled((value) => !value)}
        className="rounded-lg bg-indigo-600 px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
      >
        <Text className="text-base font-semibold text-white">
          {enabled ? 'Turn filters off' : 'Turn filters on'}
        </Text>
      </Button>
      {SVG_FILTER_KINDS.map((kind) => (
        <FilterCard key={kind} kind={kind} enabled={enabled} idPrefix={idPrefix} />
      ))}
    </View>
  )
}
