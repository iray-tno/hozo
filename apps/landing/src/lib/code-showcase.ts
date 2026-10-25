import { createCompiler } from '@hozo/compiler'
import { loadTheme } from '@hozo/tailwind'
import type { CodeLine } from '@hozo/typography/code/model'
import { fromShiki } from '@hozo/typography/code/shiki'
import { createHighlighter, type ThemeRegistration } from 'shiki'
import { formatJsx } from '../scripts/format-jsx.ts'

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

export interface HighlightedListing {
  code: string
  lines: CodeLine[]
}

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

  const color = (name: string) => {
    const value = theme.colors.find((entry) => entry.token === name)?.hex
    if (!value) throw new Error(`CodeShowcase theme is missing ${name}`)
    return value
  }
  const codeTheme: ThemeRegistration = {
    name: 'hozo-landing-code-theme',
    type: 'dark',
    colors: {
      'editor.background': color('yakisugi-950'),
      'editor.foreground': color('shikkui-muted'),
    },
    tokenColors: [
      {
        scope: ['comment', 'punctuation.definition.comment'],
        settings: { foreground: color('stone-400') },
      },
      { scope: ['keyword', 'storage'], settings: { foreground: color('hinoki') } },
      {
        scope: ['entity.name.function', 'entity.name.type', 'entity.name.tag'],
        settings: { foreground: color('hinoki-light') },
      },
      { scope: ['string'], settings: { foreground: color('tatami-code') } },
      {
        scope: ['constant.numeric', 'constant.language'],
        settings: { foreground: color('hinoki-light') },
      },
    ],
  }
  const highlighter = await createHighlighter({ themes: [codeTheme], langs: ['tsx'] })
  try {
    const highlight = (code: string): HighlightedListing => ({
      code,
      lines: fromShiki(
        highlighter.codeToTokens(code, { lang: 'tsx', theme: codeTheme.name! }).tokens,
      ),
    })
    return {
      source: highlight(CODE_SHOWCASE_SOURCE),
      web: highlight(
        `// Compiled JSX; CSS and imports are emitted separately.\n${formatJsx(web[0]!.jsx)}`,
      ),
      native: highlight(
        `// Compiled JSX; StyleSheet and imports are emitted separately.\n${formatJsx(native[0]!.jsx)}`,
      ),
    }
  } finally {
    highlighter.dispose()
  }
}
