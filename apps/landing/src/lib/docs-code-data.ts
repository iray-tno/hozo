import { parseCodeMeta } from '@hozo/typography/code/meta'
import { markCodeLines } from '@hozo/typography/code/model'
import { fromShiki } from '@hozo/typography/code/shiki'
import { type BundledLanguage, bundledLanguages, createHighlighter } from 'shiki'
import type { DocsCodeData } from '../components/docs/DocsCode.ts'

// A small semantic palette lets CSS follow Starlight's selector independently
// of the OS scheme, without rerendering a focused Copy button on theme changes.
export const docsCodePalette = {
  foreground: '#dcd7cc',
  comment: '#a39b8e',
  keyword: '#c8a882',
  name: '#dfc8ab',
  string: '#a8c47f',
  number: '#b8aadf',
} as const
const names = new Map<string, string>(
  Object.entries(docsCodePalette).map(([name, hex]) => [hex, name]),
)
const theme = {
  name: 'hozo-docs',
  type: 'dark' as const,
  colors: { 'editor.background': '#100f0e', 'editor.foreground': docsCodePalette.foreground },
  tokenColors: [
    { scope: ['comment'], settings: { foreground: docsCodePalette.comment, fontStyle: 'italic' } },
    { scope: ['keyword', 'storage'], settings: { foreground: docsCodePalette.keyword } },
    {
      scope: ['entity.name.function', 'entity.name.type', 'entity.name.tag'],
      settings: { foreground: docsCodePalette.name },
    },
    { scope: ['string'], settings: { foreground: docsCodePalette.string } },
    {
      scope: ['constant.numeric', 'constant.language'],
      settings: { foreground: docsCodePalette.number },
    },
  ],
}
let highlighter: ReturnType<typeof createHighlighter> | undefined

export async function docsCodeData(
  code: string,
  language = '',
  metadata = '',
): Promise<DocsCodeData> {
  const meta = parseCodeMeta(language, metadata)
  const requested = language.toLowerCase()
  const lang = Object.hasOwn(bundledLanguages, requested) ? (requested as BundledLanguage) : 'text'
  const grammar = await (highlighter ??= createHighlighter({ themes: [theme], langs: [] }))
  if (lang !== 'text') await grammar.loadLanguage(lang)
  const lines = fromShiki(grammar.codeToTokens(code, { lang, theme: theme.name }).tokens).map(
    (line) => ({
      ...line,
      tokens: (typeof line.tokens === 'string' ? [{ text: line.tokens }] : line.tokens).map(
        (token) => {
          // Plain-text/empty tokens can omit a foreground; use the Docs base ink.
          const color =
            token.color === undefined
              ? 'foreground'
              : typeof token.color === 'string'
                ? names.get(token.color.toLowerCase())
                : undefined
          if (!color) throw new Error(`Unexpected Docs highlighter colour: ${token.color}`)
          return { ...token, color: `var(--docs-code-${color})` }
        },
      ),
    }),
  )
  return {
    code,
    language,
    title: meta.title ?? (language || 'Code'),
    lines: markCodeLines(lines, meta.marks),
    lineNumbers: meta.lineNumbers,
    wrap: meta.wrap,
    unknown: meta.unknown,
  }
}
