import type { Theme } from '@hozo/tailwind'
import type { CodeLine } from '@hozo/typography/code/model'
import { fromShiki } from '@hozo/typography/code/shiki'
import {
  type BundledLanguage,
  bundledLanguages,
  createHighlighter,
  type ThemeRegistration,
} from 'shiki'

export interface HighlightedListing {
  code: string
  lines: CodeLine[]
}

/** Build-time only: token colours belong to the landing palette. */
export async function highlightCodeListings<T extends Record<string, string>>(
  sources: T,
  theme: Theme,
  language = 'tsx',
): Promise<{ [K in keyof T]: HighlightedListing }> {
  const color = (name: string) => {
    const value = theme.colors.find((entry) => entry.token === name)?.hex
    if (!value) throw new Error(`Landing code theme is missing ${name}`)
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
  const requested = language.toLowerCase()
  const lang = Object.hasOwn(bundledLanguages, requested) ? (requested as BundledLanguage) : 'text'
  const highlighter = await createHighlighter({
    themes: [codeTheme],
    langs: lang === 'text' ? [] : [lang],
  })
  try {
    return Object.fromEntries(
      Object.entries(sources).map(([name, code]) => [
        name,
        {
          code,
          lines: fromShiki(highlighter.codeToTokens(code, { lang, theme: codeTheme.name! }).tokens),
        },
      ]),
    ) as { [K in keyof T]: HighlightedListing }
  } finally {
    highlighter.dispose()
  }
}
