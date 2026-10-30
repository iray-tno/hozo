import { type CodeLine, View } from '@hozo/core'
import { CodeBlock } from '@hozo/ui'

const lines: CodeLine[] = [
  { tokens: 'const paths = [' },
  { tokens: '  "old/bin",', mark: 'del' },
  { tokens: '  "tools/bin",', mark: 'ins' },
  { tokens: '  "shared/bin",', mark: 'mark' },
  { tokens: ']' },
]

export function CodeBlockDemo() {
  return (
    <View className="w-full max-w-md">
      <CodeBlock title="paths.ts" language="ts" lines={lines} lineNumbers copy />
    </View>
  )
}
