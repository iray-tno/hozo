import assert from 'node:assert/strict'
import test from 'node:test'
import { Box3, DataTexture, InstancedMesh, Mesh, SRGBColorSpace } from 'three'
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

test('coalescing repeated materials reduces draws without changing geometry or assembly bounds', () => {
  const original = createKumimonoScene({ batchMaterialGroups: false })
  const batched = createKumimonoScene()
  const drawCount = (study: ReturnType<typeof createKumimonoScene>) => {
    let calls = 0
    study.scene.traverse((object) => {
      if (object instanceof Mesh)
        calls += Array.isArray(object.material) ? object.geometry.groups.length : 1
    })
    return calls
  }
  assert.ok(
    drawCount(batched) < drawCount(original) * 0.6,
    `${drawCount(original)} -> ${drawCount(batched)}`,
  )
  for (const progress of [0, 0.5, 1]) {
    original.update(progress)
    batched.update(progress)
    assert.deepEqual(
      new Box3().setFromObject(batched.scene),
      new Box3().setFromObject(original.scene),
    )
  }
  const meshes = (study: ReturnType<typeof createKumimonoScene>) => {
    const result: Mesh[] = []
    study.scene.traverse((object) => {
      if (object instanceof Mesh) result.push(object)
    })
    return result
  }
  const before = meshes(original),
    after = meshes(batched)
  assert.equal(after.length, before.length)
  for (let i = 0; i < before.length; i++) {
    for (const name of ['position', 'normal', 'uv'])
      assert.deepEqual(
        after[i].geometry.getAttribute(name)?.array,
        before[i].geometry.getAttribute(name)?.array,
      )
    // Match each material's exact triangle sequence, not just the bounds.
    const triangles = (mesh: Mesh) => {
      const result = new Map<string, number[]>()
      const materials = [mesh.material].flat()
      for (const group of mesh.geometry.groups) {
        const material = materials[group.materialIndex ?? 0] ?? materials[0]
        const key = `${material.type}:${'color' in material ? material.color.getHex() : ''}`
        const indices = result.get(key) ?? []
        for (let n = group.start; n < group.start + group.count; n++)
          indices.push(mesh.geometry.index?.getX(n) ?? n)
        result.set(key, indices)
      }
      return result
    }
    assert.deepEqual(triangles(after[i]), triangles(before[i]))
  }
  original.dispose()
  batched.dispose()
})
