import { Code, Heading, Paragraph, Preformatted, View } from '@hozo/core'
import type { ReactNode } from 'react'

// A titled box of compiler input or output, for the pages that show the
// compiler's own words (/tailwind/, /stylex/).

export function CompilerPanel({
  title,
  detail,
  children,
}: {
  title: string
  detail?: ReactNode
  children: ReactNode
}) {
  return (
    <View className="min-w-0 rounded-xl border border-hinoki/18 bg-yakisugi-950 overflow-hidden">
      <View className="px-4 py-2.5 border-b border-hinoki/18 bg-yakisugi-900/60 gap-0.5">
        <Heading level={3} className="text-xs font-mono font-bold text-hinoki">
          {title}
        </Heading>
        {detail ? <Paragraph className="text-[11px] text-stone-400">{detail}</Paragraph> : null}
      </View>
      {children}
    </View>
  )
}

export function CompilerListing({ children }: { children: string }) {
  return (
    <Preformatted className="p-4 max-h-96 overflow-auto text-[11px] sm:text-xs font-mono text-stone-300 leading-relaxed whitespace-pre-wrap break-words">
      <Code>{children}</Code>
    </Preformatted>
  )
}
