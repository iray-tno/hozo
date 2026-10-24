import type { CodeLine, CodeToken } from './model.ts'

export interface ShikiTokenLike {
  content: string
  color?: string
  fontStyle?: number
  htmlStyle?: Readonly<Record<string, string>>
}

/** Maps output theme slots to Shiki's htmlStyle suffixes (for example dark -> dark). */
export function fromShiki(
  lines: readonly (readonly ShikiTokenLike[])[],
  options?: { themes?: Readonly<Record<string, string>> },
): CodeLine[] {
  return lines.map((line) => ({
    tokens: line.map((token): CodeToken => {
      let color: CodeToken['color'] = token.color ?? token.htmlStyle?.color
      if (options?.themes) {
        const colors: Record<string, string> = {}
        for (const [slot, key] of Object.entries(options.themes)) {
          const value =
            token.htmlStyle?.[key.startsWith('--') ? key : `--shiki-${key}`] ??
            (slot === 'light' ? (token.color ?? token.htmlStyle?.color) : undefined)
          if (value) colors[slot] = value
        }
        if (Object.keys(colors).length) color = colors
      }
      const flags = token.fontStyle !== undefined && token.fontStyle > 0 ? token.fontStyle : 0
      return {
        text: token.content,
        ...(color ? { color } : {}),
        ...(flags & 1 ? { italic: true } : {}),
        ...(flags & 2 ? { bold: true } : {}),
        ...(flags & 4 ? { underline: true } : {}),
      }
    }),
  }))
}
