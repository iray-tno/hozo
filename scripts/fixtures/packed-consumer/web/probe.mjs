import assert from 'node:assert/strict'
import { existsSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { compile, compileNative } from '@hozo/compiler'
import { Button, Text } from '@hozo/core'
import { projectThreeScene } from '@hozo/three'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { BoxGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene } from 'three'

const require = createRequire(import.meta.url)
const compilerRoot = path.dirname(require.resolve('@hozo/compiler/package.json'))
assert.equal(existsSync(path.join(compilerRoot, 'hozo_napi.node')), false)
// biome-ignore lint/suspicious/noUndeclaredEnvVars: this uncached consumer must not borrow the development addon.
assert.equal(process.env.HOZO_NATIVE_BINDING, undefined)
const source =
  "import { View } from '@hozo/core'; export function Sample() { return <View className='p-4' /> }"
assert.match(compile(source)[0].jsx, /div/)
assert.match(compileNative(source)[0].styles, /padding/)
assert.match(renderToStaticMarkup(createElement(Text, null, 'SSR text')), /SSR text/)
assert.match(renderToStaticMarkup(createElement(Button, null, 'SSR button')), /<button/)
const scene = new Scene()
scene.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial({ color: '#2563eb' })))
const camera = new PerspectiveCamera(50, 1, 0.1, 100)
camera.position.z = 4
const projected = projectThreeScene(scene, camera, { width: 96, height: 96 })
assert.ok(projected.scene.length > 0)
assert.deepEqual(projected.diagnostics, [])
for (const name of ['@hozo/compiler', '@hozo/core', '@hozo/three', '@hozo/ui']) {
  const resolved = realpathSync(fileURLToPath(import.meta.resolve(name)))
  assert.ok(resolved.startsWith(`${process.cwd()}${path.sep}node_modules${path.sep}`), resolved)
}
assert.throws(() => require.resolve('react-native'), { code: 'MODULE_NOT_FOUND' })
assert.throws(() => require.resolve('react-native-web'), { code: 'MODULE_NOT_FOUND' })
console.log(
  'packed compiler binding, Web/Native compilation, SSR and portable Three passed without RN/RNW',
)
