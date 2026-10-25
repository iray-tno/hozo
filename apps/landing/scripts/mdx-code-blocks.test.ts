import assert from 'node:assert/strict'
import test from 'node:test'
import { codeText } from '@hozo/typography/code/model'
import { type CodeFenceData, mdxCodeBlocks } from '../src/lib/mdx-code-blocks.ts'

test('ordinary fences, quoted hozo titles and Markdown keep their existing renderer', async () => {
  const plugin = mdxCodeBlocks({ themeFile: new URL('file:///absent-theme.css') })
  const ordinary = { lang: 'tsx', meta: 'title="hozo"', value: 'const ordinary = true' }
  assert.equal(await plugin.code(ordinary, { sourceFormat: 'mdx' }), undefined)
  assert.equal(
    await plugin.code({ ...ordinary, meta: 'hozo' }, { sourceFormat: 'markdown' }),
    undefined,
  )
})

test('opted-in fences preserve code, literal metadata and physical line marks', async () => {
  const source = `const stable = '<View title="&" />'\nconst highlight = true\nconst add = 'new'\nconst remove = '</script><script>alert(1)</script>'`
  const node = await mdxCodeBlocks().code(
    {
      lang: 'tsx',
      meta: 'hozo title="Migration.tsx" showLineNumbers startLineNumber=7 {2} ins={3} del={4} unknown copy',
      value: source,
    },
    { sourceFormat: 'mdx' },
  )
  assert.ok(node)
  assert.equal(node.type, 'mdxJsxFlowElement')
  assert.equal(node.name, 'MdxCodeBlock')
  const data: CodeFenceData = JSON.parse(node.attributes[0]!.value)
  assert.equal(codeText(data.lines), source)
  assert.equal(data.title, 'Migration.tsx')
  assert.deepEqual(data.lineNumbers, { start: 7 })
  assert.deepEqual(
    data.lines.map((line) => line.mark),
    [undefined, 'mark', 'ins', 'del'],
  )
  assert.deepEqual(data.unknown, ['unknown', 'copy'])
  assert.equal(Object.hasOwn(data, 'copy'), false)
})

test('unsupported languages and unlabelled fences remain literal and readable', async () => {
  for (const lang of ['unknown-language', '__proto__', null]) {
    const node = await mdxCodeBlocks().code(
      { lang, meta: 'hozo ins={2}', value: '<tag>&</tag>\n{literal} `text`' },
      { sourceFormat: 'mdx' },
    )
    assert.ok(node)
    const data: CodeFenceData = JSON.parse(node.attributes[0]!.value)
    assert.equal(codeText(data.lines), '<tag>&</tag>\n{literal} `text`')
    assert.equal(data.title, lang ?? 'code')
    assert.equal(data.lines[1]!.mark, 'ins')
  }
})

test('quoted metadata is a literal attribute even when it resembles markup or an expression', async () => {
  const title = '"quoted" </figcaption><script>alert(1)</script> {expression}'
  const node = await mdxCodeBlocks().code(
    {
      lang: 'json',
      meta: `hozo title=${JSON.stringify(title)}`,
      value: '{"literal": "<tag> & text"}',
    },
    { sourceFormat: 'mdx' },
  )
  assert.ok(node)
  assert.equal(node.attributes.length, 1)
  assert.equal(JSON.parse(node.attributes[0]!.value).title, title)
})
