import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { createClassResolver } from '../../engine/src/class-resolver.ts'
import { hozoGradientStyles } from '../../engine/src/gradient-slots.ts'
import { hozoShadowStyles } from '../../engine/src/shadow-slots.ts'
import { openCandidateCache } from './index.ts'

function moduleFor(names: string[]) {
  const cache = openCandidateCache()
  cache.scanFile('runtime.ts', JSON.stringify(names.join(' ')), 1)
  return cache.renderNativeModule()
}

function execute(names: string[], composer = hozoShadowStyles) {
  return runInNewContext(
    `${moduleFor(names)
      .replace(/^import .*$/gm, '')
      .replaceAll('export const ', 'const ')}; hozoClasses`,
    { createClassResolver, hozoShadowStyles: composer, hozoGradientStyles },
  ) as ReturnType<typeof createClassResolver>
}

test('selected size, colour, ring and gradient identities survive the runtime pipeline', () => {
  const names = [
    'shadow-sm',
    'hover:shadow-red-500',
    'focus:ring-2',
    'bg-linear-to-r',
    'from-blue-500',
  ]
  const resolve = execute(names)
  const styles = resolve(names.join(' '), { hovered: true, focused: true })
  const active = Object.assign({}, ...styles)
  assert.match(String(active.boxShadow), /^0 0 0 2px currentcolor, 0 1px 3px 0 #fb2c36,/)
  assert.match(String(active.backgroundImage), /^linear-gradient\(to right, #2b7fff 0%/)
  const idle = Object.assign({}, ...resolve(names.join(' '), { hovered: false, focused: false }))
  assert.match(String(idle.boxShadow), /^0 1px 3px 0 rgb\(/)
  assert.doesNotMatch(String(idle.boxShadow), /#fb2c36|currentcolor/)
})

test('single drawable field does not load the composer and modifier-only output has no shadow', () => {
  assert.doesNotMatch(moduleFor(['shadow-sm', 'hover:shadow-lg', 'shadow-none']), /shadow-slots/)
  assert.doesNotMatch(moduleFor(['p-4']), /shadow-slots/)
  const resolve = execute(['shadow-red-500', 'hover:ring-blue-500'])
  assert.equal(
    Object.assign({}, ...resolve('shadow-red-500 hover:ring-blue-500', { hovered: true }))
      .boxShadow,
    undefined,
  )
})

test('a project with shadow metadata bypasses it for nonparticipating style strings', () => {
  let calls = 0
  const resolve = execute(['p-4', 'shadow-sm', 'shadow-red-500'], (...args) => {
    calls++
    return hozoShadowStyles(...args)
  })
  const plain = resolve('p-4')
  assert.equal(resolve('p-4'), plain)
  assert.equal(calls, 0)
  const shadow = resolve('shadow-sm shadow-red-500')
  assert.equal(resolve('shadow-sm shadow-red-500'), shadow)
  assert.equal(calls, 1)
})
