import assert from 'node:assert/strict'
import test from 'node:test'
import { DataTexture, InstancedMesh, Mesh, SRGBColorSpace } from 'three'
import { createKumimonoScene } from './scene.ts'
import { createTimberTextures } from './textures.ts'

test('timber textures are deterministic DOM-free opaque RGBA images', () => {
  assert.equal(typeof globalThis.document, 'undefined')
  const first = createTimberTextures()
  const second = createTimberTextures()
  for (const key of ['woodTexture', 'endGrainTexture'] as const) {
    const texture = first[key]
    assert.ok(texture instanceof DataTexture)
    assert.equal(texture.colorSpace, SRGBColorSpace)
    assert.equal(texture.image.data.length, texture.image.width * texture.image.height * 4)
    assert.deepEqual(texture.image.data, second[key].image.data)
    assert.ok(texture.image.data.every((value, index) => index % 4 !== 3 || value === 255))
    assert.equal(texture.generateMipmaps, true)
    texture.dispose()
    second[key].dispose()
  }
})

test('the same scene assembles, uses instancing and two textures, and disposes owned resources', () => {
  const study = createKumimonoScene()
  assert.equal(study.pieceCount, 56)
  const textures = new Set<DataTexture>()
  const geometries = new Set()
  const materials = new Set()
  const instancedMeshes = new Set<InstancedMesh>()
  let instances = 0
  study.scene.traverse((object) => {
    if (!(object instanceof Mesh)) return
    if (object instanceof InstancedMesh) {
      instances += object.count
      instancedMeshes.add(object)
    }
    geometries.add(object.geometry)
    for (const material of [object.material].flat()) {
      materials.add(material)
      if ('map' in material && material.map instanceof DataTexture) textures.add(material.map)
    }
  })
  assert.equal(textures.size, 2)
  assert.ok(instances > 100)
  study.update(0)
  const exploded = study.animationObject.position.clone()
  const initialRotation = study.animationObject.quaternion.clone()
  study.update(1)
  const assembled = study.animationObject.position.clone()
  assert.ok(exploded.distanceTo(assembled) > 5)
  assert.ok(initialRotation.angleTo(study.animationObject.quaternion) > 0.01)
  study.update(0.5)
  study.update(1)
  assert.deepEqual(study.animationObject.position, assembled)
  assert.ok(Number.isFinite(study.camera.position.length()))
  let disposed = 0
  for (const resource of [...textures, ...geometries, ...materials, ...instancedMeshes])
    resource.addEventListener('dispose', () => disposed++)
  study.dispose()
  assert.equal(disposed, textures.size + geometries.size + materials.size + instancedMeshes.size)
})
