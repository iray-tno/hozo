import { type CodeLine, Text } from '@hozo/core'
import { CodeBlock, ResizablePane, Stack } from '@hozo/ui'

const lines: CodeLine[] = [
  { tokens: 'const paths = [' },
  { tokens: '  "old/bin",', mark: 'del' },
  { tokens: '  "tools/bin",', mark: 'ins' },
  { tokens: '  "shared/bin",', mark: 'mark' },
  { tokens: ']' },
]

export function CodeBlockDemo() {
  return (
    <Stack direction="row" className="w-full gap-0">
      <ResizablePane side="start" label="Files" min={72} max={160} defaultSize={96} collapsible>
        <Stack className="p-2">
          <Text>paths.ts</Text>
        </Stack>
      </ResizablePane>
      <Stack className="min-w-0 flex-1">
        <CodeBlock title="paths.ts" language="ts" lines={lines} lineNumbers copy />
      </Stack>
    </Stack>
  )
}
