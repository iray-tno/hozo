import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadTheme } from '@hozo/tailwind'
import { parseCodeMeta } from '@hozo/typography/code/meta'
import { type CodeLine, markCodeLines } from '@hozo/typography/code/model'
import { highlightCodeListings } from './code-highlighting.ts'

export interface CodeFenceData {
  title: string
  language: string
  lines: CodeLine[]
  lineNumbers?: boolean | { start: number }
  unknown: string[]
}

/** MDX owns the import; the explicit `hozo` flag selects only these fences. */
export function mdxCodeBlocks({
  themeFile = new URL('../styles/global.css', import.meta.url),
  root = fileURLToPath(new URL('../../', import.meta.url)),
}: {
  themeFile?: URL
  root?: string
} = {}) {
  let theme: ReturnType<typeof loadTheme> | undefined
  return {
    name: 'hozo-mdx-code-blocks',
    async code(
      node: { lang?: string | null; meta?: string | null; value: string },
      context: { sourceFormat: string },
    ) {
      if (context.sourceFormat !== 'mdx') return
      const meta = parseCodeMeta(node.lang ?? '', node.meta ?? '')
      if (!meta.unknown.includes('hozo')) return
      theme ??= loadTheme(readFileSync(themeFile, 'utf8'), root)
      const { fence } = await highlightCodeListings(
        { fence: node.value },
        await theme,
        meta.language,
      )
      const data: CodeFenceData = {
        title: meta.title ?? (meta.language || 'code'),
        language: meta.language,
        lines: markCodeLines(fence.lines, meta.marks),
        lineNumbers: meta.lineNumbers,
        unknown: meta.unknown.filter((token) => token !== 'hozo'),
      }
      // MDX prints a literal attribute: neither code nor metadata becomes an
      // executable expression or highlighter-generated HTML.
      return {
        type: 'mdxJsxFlowElement' as const,
        name: 'MdxCodeBlock',
        attributes: [
          { type: 'mdxJsxAttribute' as const, name: 'data', value: JSON.stringify(data) },
        ],
        children: [],
      }
    },
  }
}
