import { Heading, Paragraph, View } from '@hozo/core'
import { CodeBlock } from '@hozo/patterns'
import type { ReactNode } from 'react'

// A titled box of compiler input or output, for the pages that show the
// compiler's own words (/tailwind/, /stylex/).

export function CompilerPanel({
  title,
  detail,
  code,
}: {
  title: string
  detail?: ReactNode
  code: string
}) {
  return (
    <View className="min-w-0 rounded-xl border border-hinoki/18 bg-yakisugi-950 overflow-hidden">
      <View className="px-4 py-2.5 border-b border-hinoki/18 bg-yakisugi-900/60 gap-0.5">
        <Heading level={3} className="text-xs font-mono font-bold text-hinoki">
          {title}
        </Heading>
        {detail ? <Paragraph className="text-[11px] text-stone-400">{detail}</Paragraph> : null}
      </View>
      <CompilerListing title={title}>{code}</CompilerListing>
    </View>
  )
}

export function CompilerListing({ title, children }: { title: string; children: string }) {
  return (
    <View
      role="region"
      accessibilityLabel={`${title} code`}
      className="p-4 max-h-96 overflow-auto min-w-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-hinoki"
    >
      <CodeBlock
        lines={children}
        title={title}
        wrap
        captionClassName="sr-only"
        className="text-[11px] sm:text-xs text-stone-300 min-w-0"
        lineStyle={{
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          lineHeight: 1.625,
        }}
      />
    </View>
  )
}
