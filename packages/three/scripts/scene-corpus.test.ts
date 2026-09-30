import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { Mesh, MeshStandardMaterial, PointLight, REVISION, Texture, TextureLoader } from 'three'

import { MINIMAL_PBR_GLTF_SOURCE, SCENE_CORPUS_SCENES } from '../src/conformance-scenes.ts'
import { runSceneCorpus, SCENE_CORPUS_FIXTURES } from './scene-corpus.ts'

test('the real-scene corpus is version-pinned, representative, and executable', async () => {
  assert.deepEqual(
    JSON.parse(MINIMAL_PBR_GLTF_SOURCE),
    JSON.parse(await readFile(new URL('../fixtures/minimal-pbr.gltf', import.meta.url), 'utf8')),
  )
  assert.equal(SCENE_CORPUS_FIXTURES.length, 6)
  assert.equal(new Set(SCENE_CORPUS_FIXTURES.map((fixture) => fixture.id)).size, 6)
  assert.deepEqual(
    SCENE_CORPUS_SCENES.map((fixture) => fixture.id),
    SCENE_CORPUS_FIXTURES.map((fixture) => fixture.id),
  )
  assert.ok(
    SCENE_CORPUS_FIXTURES.every((fixture) => fixture.source.version.includes(`r${REVISION}`)),
  )
  assert.deepEqual(
    SCENE_CORPUS_FIXTURES.map((fixture) => fixture.archetype),
    [
      'flat diagram / labelled interaction',
      'wireframe or CAD-like scene',
      'points / sprite scene',
      'instancing plus morph with a portable material',
      'animated textured glTF product viewer',
      'ordinary glTF/PBR scene',
    ],
  )

  const report = await runSceneCorpus()
  assert.equal(report.schemaVersion, 1)
  assert.equal(report.generatedAgainst, `Three.js r${REVISION}`)
  assert.equal(report.summary.failed, 0)
  assert.equal(report.summary.useful, 4)
  assert.equal(report.summary.diagnostic, 2)
  assert.deepEqual(report.summary.notRunByFamily, {
    'classic-webgl': 6,
    'modern-webgpu': 6,
    'native-host': 6,
  })
  assert.ok(report.fixtures.every((fixture) => fixture.verified))
  assert.deepEqual(report.fixtures.at(-1)?.portableObservation.diagnosticCodes, [
    'UNSUPPORTED_MATERIAL',
  ])
})

test('the product viewer loads a textured, lit, animated glTF scene', async () => {
  const fixture = SCENE_CORPUS_SCENES.find(({ id }) => id === 'product-viewer-gltf')
  assert.ok(fixture)
  const { scene, animation, textureImage } = await fixture.create(async () => '')
  const housing = scene.getObjectByName('Product_housing')
  const display = scene.getObjectByName('Product_display')
  assert.ok(housing instanceof Mesh)
  assert.ok(display instanceof Mesh)
  assert.ok(display.material instanceof MeshStandardMaterial)
  assert.ok(display.material.map?.isDataTexture)
  assert.ok(display.geometry.getAttribute('uv'))
  assert.ok(scene.getObjectByName('Product_key_light') instanceof PointLight)
  assert.ok(housing.rotation.y > 0.4, 'the glTF animation must affect the measured pose')
  assert.deepEqual(textureImage, { decoding: 'fixture', width: 4, height: 4 })
  assert.ok(animation)
  assert.equal(animation.object, housing)
  const initial = housing.quaternion.clone()
  animation.update(0.125)
  const next = housing.quaternion.clone()
  animation.update(0.125)
  assert.ok(initial.angleTo(next) > 0.1, 'a frame update must advance the glTF clip')
  assert.ok(next.angleTo(housing.quaternion) > 0.1, 'a second frame must continue the clip')
})

test('the glTF material uses the supplied image loader and rejects a missing decoded image', async () => {
  const fixture = SCENE_CORPUS_SCENES.find(({ id }) => id === 'product-viewer-gltf')!
  class HostImageLoader extends TextureLoader {
    override load(url: string, onLoad?: (texture: Texture) => void) {
      assert.ok(url.startsWith('data:image/png;base64,'))
      const texture = new Texture({ width: 4, height: 4 } as HTMLImageElement)
      onLoad?.(texture)
      return texture
    }
  }
  const loaded = await fixture.create(async () => '', { textureLoader: new HostImageLoader() })
  assert.deepEqual(loaded.textureImage, { decoding: 'host', width: 4, height: 4 })
  class FailedImageLoader extends TextureLoader {
    override load(
      _url: string,
      _onLoad?: (texture: Texture) => void,
      _onProgress?: (event: ProgressEvent) => void,
      onError?: (error: unknown) => void,
    ) {
      onError?.(new Error('image decode failed'))
      return new Texture()
    }
  }
  await assert.rejects(
    fixture.create(async () => '', { textureLoader: new FailedImageLoader() }),
    /did not decode and bind.*image decode failed/,
  )
})

test('both embedded glTF fixtures load with the globals exposed by Hermes', async () => {
  const textDecoderDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'TextDecoder')
  const userAgentDescriptor = Object.getOwnPropertyDescriptor(globalThis.navigator, 'userAgent')
  const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch')
  assert.equal(Reflect.deleteProperty(globalThis, 'TextDecoder'), true)
  Object.defineProperty(globalThis.navigator, 'userAgent', {
    configurable: true,
    value: undefined,
  })
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: () => Promise.reject(new Error('this host cannot fetch data: URLs')),
  })
  try {
    const fixture = SCENE_CORPUS_SCENES.find(({ id }) => id === 'gltf-pbr')
    assert.ok(fixture)
    const { scene } = await fixture.create(async () => MINIMAL_PBR_GLTF_SOURCE)
    assert.equal(scene.getObjectByName('Pinned_PBR_triangle')?.name, 'Pinned_PBR_triangle')
    const product = SCENE_CORPUS_SCENES.find(({ id }) => id === 'product-viewer-gltf')
    assert.ok(product)
    const productScene = await product.create(async () => '')
    assert.ok(productScene.scene.getObjectByName('Product_display'))
  } finally {
    if (textDecoderDescriptor)
      Object.defineProperty(globalThis, 'TextDecoder', textDecoderDescriptor)
    else Reflect.deleteProperty(globalThis, 'TextDecoder')
    if (userAgentDescriptor)
      Object.defineProperty(globalThis.navigator, 'userAgent', userAgentDescriptor)
    else Reflect.deleteProperty(globalThis.navigator, 'userAgent')
    if (fetchDescriptor) Object.defineProperty(globalThis, 'fetch', fetchDescriptor)
    else Reflect.deleteProperty(globalThis, 'fetch')
  }
})
