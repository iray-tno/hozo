import { pathToFileURL } from 'node:url'
import { satteri } from '@astrojs/markdown-satteri'
import { docsCodeBlocks, isDocsFile } from './docs-code-blocks.ts'
import { mdxCodeBlocks } from './mdx-code-blocks.ts'

/** Keep Starlight's normal Satteri hooks, with a Docs-only code renderer. */
export function docsMarkdown() {
  const processor = satteri({ mdastPlugins: [mdxCodeBlocks()], hastPlugins: [docsCodeBlocks()] })
  const createRenderer = processor.createRenderer.bind(processor)
  processor.createRenderer = async (shared) => {
    const ordinary = await createRenderer(shared)
    const docs = await createRenderer({ ...shared, syntaxHighlight: false })
    return {
      render: (content, options) =>
        (isDocsFile(options?.fileURL) ? docs : ordinary).render(content, options),
    }
  }
  const createMdxRenderer = processor.createMdxRenderer!.bind(processor)
  processor.createMdxRenderer = async (shared, options) => {
    const ordinary = await createMdxRenderer(shared, options)
    const docs = await createMdxRenderer({ ...shared, syntaxHighlight: false }, options)
    return {
      process: (content, filePath, frontmatter) =>
        (isDocsFile(pathToFileURL(filePath)) ? docs : ordinary).process(
          content,
          filePath,
          frontmatter,
        ),
    }
  }
  return processor
}
