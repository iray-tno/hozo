import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { openCandidateCache } from '@hozo/compiler'
import './native-render.ts'

const require = createRequire(import.meta.url)
const react = require('react')
const renderer = require('react-test-renderer')
const { StyleSheet } = require('react-native')

test('CodeBlock delivers row classes, mark styles and explicit overrides in both Native list modes', async (t) => {
  const project = mkdtempSync(fileURLToPath(new URL('../.code-block-row-', import.meta.url)))
  t.after(() => rmSync(project, { recursive: true, force: true }))
  const lineClassName = 'bg-[#123456] p-2 text-[#abcdef]'
  const insClassName = 'bg-[#112233] opacity-50'
  const cache = openCandidateCache()
  cache.scanFile(
    'Example.tsx',
    `<CodeBlock lineClassName="${lineClassName}" insClassName="${insClassName}" />`,
    1,
  )
  const sheet = path.join(project, 'candidates.mjs')
  writeFileSync(sheet, cache.renderNativeModule())
  const hook = registerHooks({
    resolve(specifier, context, next) {
      if (specifier === '@hozo/engine/project')
        return { url: pathToFileURL(sheet).href, shortCircuit: true }
      if (specifier === '@hozo/typography/code/lines/native')
        return {
          url: new URL('../../typography/src/code-lines.native.tsx', import.meta.url).href,
          shortCircuit: true,
        }
      return next(specifier, context)
    },
  })
  t.after(() => hook.deregister())
  const { CodeBlock } = require('../../patterns/src/code-block.native.tsx')
  const lines = [{ tokens: 'ordinary' }, { tokens: 'marked', mark: 'ins' }]
  for (const windowing of ['off', 'on']) {
    let view: ReturnType<typeof renderer.create>
    renderer.act(() => {
      view = renderer.create(
        react.createElement(CodeBlock, {
          lines,
          wrap: true,
          maxHeight: 200,
          windowing,
          lineClassName,
          insClassName,
          lineStyle: { paddingTop: 19 },
          insStyle: { backgroundColor: '#445566' },
        }),
      )
    })
    try {
      const drawn =
        windowing === 'on'
          ? (() => {
              const list = view.root.findByType('FlatList')
              return list.props.data.map((item, index) => {
                const row = list.props.renderItem({ item, index })
                return [row.props.style, row.props.children[1].props.style]
              })
            })()
          : view.root
              .findAll((node) => node.type === 'Text' && node.props.accessible)
              .map((node) => [node.parent.props.style, node.props.style])
      assert.equal(drawn.length, 2)
      assert.deepEqual(
        drawn.map(([box, text]) => {
          const { backgroundColor, paddingTop, paddingRight, opacity } = StyleSheet.flatten(box)
          return [
            backgroundColor,
            paddingTop,
            paddingRight,
            opacity,
            StyleSheet.flatten(text).color,
          ]
        }),
        [
          ['#123456', 19, 8, undefined, '#abcdef'],
          ['#445566', 19, 8, 0.5, '#abcdef'],
        ],
      )
    } finally {
      renderer.act(() => view.unmount())
    }
  }
})
