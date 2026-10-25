import { createCompiler } from '@hozo/compiler'
import { loadTheme } from '@hozo/tailwind'
import { formatJsx } from '../scripts/format-jsx.ts'
import { type HighlightedListing, highlightCodeListings } from './code-highlighting.ts'

// Keep the three panes connected: a compiler change must reach the displayed
// output, rather than leaving a hand-written example claiming to be current.
export const CODE_SHOWCASE_SOURCE = `import { View, Heading, Paragraph, Button } from '@hozo/core'

export function NotificationCard({ title, message, onDismiss }) {
  return (
    <View role="alert" className="p-6 rounded-2xl bg-yakisugi-800 border border-hinoki/20">
      <Heading level={2} className="text-xl font-bold text-shikkui mb-2">{title}</Heading>
      <Paragraph className="text-stone-400 text-sm mb-4">{message}</Paragraph>
      <Button onPress={onDismiss} className="bg-bengara px-4 py-2 rounded-lg text-shikkui font-medium">
        Dismiss
      </Button>
    </View>
  )
}`

export interface CodeShowcaseSamples {
  source: HighlightedListing
  web: HighlightedListing
  native: HighlightedListing
}

/** Build-time only: Astro passes data to the static TSX component. */
export async function buildCodeShowcase(
  themeSource: string,
  root = process.cwd(),
): Promise<CodeShowcaseSamples> {
  const theme = await loadTheme(themeSource, root)
  const compiler = createCompiler(theme)
  const web = compiler.compile(CODE_SHOWCASE_SOURCE)
  const native = compiler.compileNative(CODE_SHOWCASE_SOURCE)
  if (web.length !== 1 || native.length !== 1)
    throw new Error('CodeShowcase must compile one component on each platform')
  const diagnostics = [...web[0]!.diagnostics, ...native[0]!.diagnostics]
  if (diagnostics.length)
    throw new Error(
      `CodeShowcase compiler diagnostics: ${diagnostics.map((item) => `${item.code}: ${item.message}`).join('; ')}`,
    )

  return highlightCodeListings(
    {
      source: CODE_SHOWCASE_SOURCE,
      web: `// Compiled JSX; CSS and imports are emitted separately.\n${formatJsx(web[0]!.jsx)}`,
      native: `// Compiled JSX; StyleSheet and imports are emitted separately.\n${formatJsx(native[0]!.jsx)}`,
    },
    theme,
  )
}
