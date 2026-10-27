import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { codeText } from '@hozo/typography/code/model'
import { type HastNode, htmlToHast, markdownToHtml, markdownToMdast, mdxToMdast } from 'satteri'
import type { DocsCodeData } from '../src/components/docs/DocsCode.ts'
import { docsCodeBlocks } from '../src/lib/docs-code-blocks.ts'
import { docsCodeData } from '../src/lib/docs-code-data.ts'
import { docsMarkdown } from '../src/lib/docs-markdown.ts'

const docs = new URL('../src/content/docs/', import.meta.url)
function listings(html: string) {
  const result: DocsCodeData[] = []
  const visit = (node: HastNode) => {
    if (node.type === 'element') {
      // A literal <script> inside a quoted data attribute is not an element.
      assert.notEqual(node.tagName, 'script')
      assert.notEqual(node.tagName, 'button')
      const value = node.properties?.['data-hozo-docs-code'] ?? node.properties?.dataHozoDocsCode
      if (typeof value === 'string') result.push(JSON.parse(value))
    }
    if ('children' in node) for (const child of node.children) visit(child)
  }
  visit(htmlToHast(html, { fragment: true }))
  return result
}

test('one Markdown renderer replaces nested and unlabelled fences, preserving literal metadata/text', async () => {
  const source =
    'const literal = "</script><script>alert(1)</script>&日😀"\n\tconst added = true\nconst removed = false\n'
  const title = '"quoted" <frame> & {expression}'
  const result = await markdownToHtml(
    `\`\`\`tsx title='${title}' showLineNumbers startLineNumber=7 {1} ins={2} del={3} unknown\n${source}\n\`\`\`\n\n> \`\`\`unknown-language\n> <literal>&</literal>\n> \`\`\`\n\n- Nested\n\n  \`\`\`\n  unlabelled\n  \`\`\``,
    { fileURL: new URL('docs/probe.md', docs), hastPlugins: [docsCodeBlocks()] },
  )
  const data = listings(result.html)
  assert.equal(data.length, 3)
  assert.equal(data[0]!.title, title)
  assert.equal(data[0]!.code, source)
  assert.equal(codeText(data[0]!.lines), source)
  assert.deepEqual(data[0]!.lineNumbers, { start: 7 })
  assert.deepEqual(
    data[0]!.lines.map((line) => line.mark),
    ['mark', 'ins', 'del', undefined],
  )
  assert.deepEqual(data[0]!.unknown, ['unknown'])
  assert.equal(data[1]!.code, '<literal>&</literal>')
  assert.equal(data[2]!.code, 'unlabelled')
  assert.equal(data[2]!.title, 'Code')
  assert.match(result.html, /<ins\b/)
  assert.match(result.html, /<del\b/)
  assert.match(result.html, /<mark\b/)
  const ids = [...result.html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1])
  assert.equal(ids.length, new Set(ids).size)
})

test('Docs-only routing keeps ordinary pages and static MDX opt-in independent', async () => {
  const processor = docsMarkdown()
  const renderer = await processor.createRenderer({ syntaxHighlight: false })
  const code = '```js title="sample.js" showLineNumbers ins={1}\nconst value = 1\n```'
  const ordinary = await renderer.render(code, {
    fileURL: new URL('../src/pages/ordinary.md', import.meta.url),
  })
  const rendered = await renderer.render(code, { fileURL: new URL('docs/probe.md', docs) })
  assert.equal(listings(ordinary.code).length, 0)
  assert.equal(listings(rendered.code).length, 1)
  const mdx = await processor.createMdxRenderer!(
    { syntaxHighlight: false },
    { srcDir: new URL('../src/', import.meta.url), optimize: false },
  )
  const compiled = await mdx.process(code, fileURLToPath(new URL('docs/probe.mdx', docs)), {})
  assert.match(compiled.code, /data-hozo-docs-code/)
  assert.match(compiled.code, /set:html/)
  assert.match(compiled.code, /<!-- -->/)
  assert.doesNotMatch(compiled.code, /import.*DocsCode/)
})

test('theme tokens use CSS variables and Copy retains tabs instead of display expansion', async () => {
  for (const language of ['tsx', 'sh', 'astro', 'groovy', '', 'missing-language']) {
    const data = await docsCodeData('\tconst value = "<&日😀>"\n', language, 'wrap')
    assert.equal(data.code, '\tconst value = "<&日😀>"\n')
    assert.equal(codeText(data.lines), data.code)
    assert.equal(data.wrap, true)
    for (const line of data.lines)
      if (typeof line.tokens !== 'string')
        for (const token of line.tokens)
          assert.match(String(token.color), /^var\(--docs-code-\w+\)$/)
  }
})

test('the real Markdown/MDX parser enumerates the entire Docs fence corpus', () => {
  let fences = 0
  const files = readdirSync(docs, { recursive: true, encoding: 'utf8' }).filter((file) =>
    /\.mdx?$/.test(file),
  )
  for (const file of files) {
    const source = readFileSync(new URL(file.replaceAll('\\', '/'), docs), 'utf8')
    const tree = file.endsWith('.mdx') ? mdxToMdast(source) : markdownToMdast(source)
    const visit = (node: typeof tree) => {
      if (node.type === 'code') fences++
      if ('children' in node) for (const child of node.children) visit(child)
    }
    visit(tree)
  }
  assert.ok(fences > 0, 'an empty corpus cannot validate a renderer')
  console.log(`Docs source corpus: ${files.length} files, ${fences} parsed fences`)
})
