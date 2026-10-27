import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { defineHastPlugin, type HastPluginEntry, htmlToHast } from 'satteri'
import { docsCodeData } from './docs-code-data.ts'
import { renderDocsCode } from './docs-code-render.ts'

export function isDocsFile(fileURL?: URL) {
  return Boolean(fileURL?.href.startsWith(new URL('../content/docs/', import.meta.url).href))
}

/** One AST transform handles every fence, including those nested in lists/quotes. */
export function docsCodeBlocks(): HastPluginEntry {
  return ({ fileURL }) => {
    if (!isDocsFile(fileURL)) return
    const document = createHash('sha256').update(fileURLToPath(fileURL!)).digest('hex').slice(0, 12)
    let serial = 0
    return defineHastPlugin({
      name: 'hozo-docs-code-blocks',
      element: {
        filter: ['pre'],
        async visit(node, context) {
          const code = node.children?.find(
            (child) => child.type === 'element' && child.tagName === 'code',
          )
          if (code?.type !== 'element') return
          // An unlabelled fence has no language data at all.
          const fence = code.data as { lang?: unknown; meta?: unknown } | undefined
          const language = typeof fence?.lang === 'string' ? fence.lang : ''
          const metadata = typeof fence?.meta === 'string' ? fence.meta : ''
          const data = await docsCodeData(
            context.textContent(code).replace(/\n$/, ''),
            language,
            metadata,
          )
          const prefix = `docs-fence-${document}-${++serial}-`
          const html = renderDocsCode(data, prefix)
          if (context.sourceFormat === 'mdx') {
            // MDX normally removes HTML comments, including React's adjacent
            // text markers in numbered gutters. Astro's literal HTML directive
            // preserves canonical SSR markup and does not evaluate fence text.
            return {
              type: 'mdxJsxFlowElement',
              name: 'div',
              attributes: [
                { type: 'mdxJsxAttribute', name: 'class', value: 'not-content hozo-docs-code' },
                {
                  type: 'mdxJsxAttribute',
                  name: 'data-hozo-docs-code',
                  value: JSON.stringify(data),
                },
                { type: 'mdxJsxAttribute', name: 'data-code-prefix', value: prefix },
                { type: 'mdxJsxAttribute', name: 'set:html', value: html },
              ],
              children: [],
            }
          }
          const tree = htmlToHast(html, { fragment: true })
          if (tree.type !== 'root') throw new Error('Expected a code HTML fragment')
          const children = tree.children.map((child) => {
            if (child.type === 'element' || child.type === 'text' || child.type === 'comment')
              return child
            throw new Error(`Unexpected node in code HTML: ${child.type}`)
          })
          return {
            type: 'element',
            tagName: 'div',
            properties: {
              className: ['not-content', 'hozo-docs-code'],
              'data-hozo-docs-code': JSON.stringify(data),
              'data-code-prefix': prefix,
            },
            children,
          }
        },
      },
    })
  }
}
