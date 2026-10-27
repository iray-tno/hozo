import { ScrollView, Text, View } from '@hozo/core'
import { CodeBlock } from '@hozo/patterns'
import type { CodeLine } from '@hozo/typography/code/model'

export const REPL_PANES = [
  { id: 'repl-web-jsx', title: 'Web', note: 'JSX' },
  { id: 'repl-web-css', title: 'Web', note: 'CSS' },
  { id: 'repl-native-jsx', title: 'React Native', note: 'JSX' },
  { id: 'repl-native-styles', title: 'React Native', note: 'StyleSheet' },
] as const

export function ReplOutput({ listings = [] }: { listings?: CodeLine[][] }) {
  return (
    <>
      {REPL_PANES.map((pane, index) => (
        <View
          key={pane.id}
          className="rounded-xl bg-yakisugi-950/80 border border-hinoki/18 overflow-hidden min-w-0"
        >
          <View className="flex-row items-baseline gap-2 px-4 py-2 border-b border-hinoki/18 bg-hinoki/5">
            <Text className="text-sm font-semibold text-stone-200">{pane.title}</Text>
            <Text className="font-mono text-xs text-stone-500">{pane.note}</Text>
          </View>
          <ScrollView
            nativeID={pane.id}
            accessibilityLabel={`${pane.title} ${pane.note} output`}
            className="p-4 max-h-64 min-w-0"
          >
            <CodeBlock
              title={`${pane.title} ${pane.note}`}
              lines={listings[index] ?? ''}
              captionClassName="sr-only"
              className="text-xs text-stone-300 min-w-0"
              lineStyle={{
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                lineHeight: 1.625,
              }}
            />
          </ScrollView>
        </View>
      ))}
    </>
  )
}
