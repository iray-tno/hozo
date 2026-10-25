import { View } from '@hozo/core'
import { CodeBlock } from '@hozo/patterns'
import type { CodeFenceData } from '../lib/mdx-code-blocks.ts'

/** Fences wrap without Copy so MDX needs no client directive. */
export function MdxCodeBlock({ data }: { data: string }) {
  const fence: CodeFenceData = JSON.parse(data)
  return (
    <View className="my-6 min-w-0">
      <CodeBlock
        lines={fence.lines}
        title={fence.title}
        language={fence.language}
        lineNumbers={fence.lineNumbers}
        wrap
        className="rounded-xl border border-hinoki/18 bg-yakisugi-900 text-xs sm:text-sm text-shikkui-muted min-w-0 overflow-hidden"
        captionClassName="border-b border-hinoki/18 px-3 py-2 text-hinoki"
        lineClassName="px-3"
        gutterClassName="px-2 text-stone-400"
        insClassName="bg-[#14251b] text-shikkui-muted no-underline"
        delClassName="bg-[#2c1918] text-shikkui-muted no-underline"
        markClassName="bg-[#292413] text-shikkui-muted"
        lineStyle={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', lineHeight: 1.625 }}
        gutterStyle={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', lineHeight: 1.625 }}
      />
    </View>
  )
}
