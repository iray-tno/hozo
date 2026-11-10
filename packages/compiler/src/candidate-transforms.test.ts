import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { createClassResolver } from '../../engine/src/class-resolver.ts'
import { hozoTransformStyles } from '../../engine/src/transform-slots.ts'
import { openCandidateCache } from './index.ts'

test('Web candidate axes compose through registers where Native already uses its slot composer', () => {
  const names = ['translate-x-2', 'translate-y-3', 'scale-50', 'scale-x-75']
  const cache = openCandidateCache()
  cache.scanFile('runtime.ts', JSON.stringify(names.join(' ')), 1)
  const css = cache.renderCss()
  assert.match(css, /--hozo-translate-x: 8px;/)
  assert.match(css, /--hozo-translate-y: 12px;/)
  assert.match(css, /translate: var\(--hozo-translate-x\) var\(--hozo-translate-y\);/)
  assert.match(css, /scale: var\(--hozo-scale-x\) var\(--hozo-scale-y\);/)
  assert.equal([...css.matchAll(/@property --hozo-translate-x \{/g)].length, 1)
  const code = cache.renderNativeModule()
  const resolve = runInNewContext(
    `${code.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ')}; hozoClasses`,
    { createClassResolver, hozoTransformStyles },
  )
  for (const list of [names, names.toReversed()]) {
    const value = Object.assign({}, ...resolve(list.join(' ')))
    assert.equal(
      JSON.stringify(value.transform),
      JSON.stringify([{ translateX: 8 }, { translateY: 12 }, { scaleX: 0.75 }, { scaleY: 0.5 }]),
    )
  }
})
