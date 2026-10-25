import { View } from '@hozo/core'
import { CodeBlock } from '@hozo/patterns'
import type { CodeSnippet } from '../lib/code-snippets.ts'

export function StaticCodeSnippet({
  snippet,
  compact = false,
}: {
  snippet: CodeSnippet
  compact?: boolean
}) {
  return (
    <View
      className={
        compact
          ? 'p-3 rounded-lg bg-yakisugi-950 border border-hinoki/18 min-w-0'
          : 'rounded-xl border border-hinoki/18 bg-yakisugi-900 p-4 sm:p-6 min-w-0'
      }
    >
      <CodeBlock
        lines={snippet.lines}
        title={snippet.title}
        wrap
        captionClassName="sr-only"
        className={
          compact
            ? 'text-xs text-shikkui-muted min-w-0'
            : 'text-xs sm:text-sm text-shikkui-muted min-w-0'
        }
        lineStyle={{
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          lineHeight: 1.625,
        }}
      />
    </View>
  )
}
