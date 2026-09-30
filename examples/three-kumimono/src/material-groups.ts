import { type Material, Mesh, type Object3D } from 'three'

/** Box faces often repeat the same opaque material in six separate draws.
 * Reorder only triangle indices, leaving positions, normals, UVs and transforms
 * untouched. This sample owns its geometry; animated part boundaries stay intact.
 */
export function coalesceMaterialGroups(root: Object3D) {
  root.traverse((object) => {
    if (!(object instanceof Mesh) || !Array.isArray(object.material)) return
    const geometry = object.geometry
    const index = geometry.index
    if (!index || object.material.some((material) => material.transparent)) return
    const buckets = new Map<Material, number[]>()
    for (const group of geometry.groups) {
      const material = object.material[group.materialIndex ?? 0]
      if (!material) throw new Error('Kumimono geometry group has no material')
      const indices = buckets.get(material) ?? []
      for (let i = group.start; i < group.start + group.count; i++) indices.push(index.getX(i))
      buckets.set(material, indices)
    }
    if (buckets.size >= geometry.groups.length) return
    const reordered: number[] = []
    const materials: Material[] = []
    geometry.clearGroups()
    for (const [material, indices] of buckets) {
      geometry.addGroup(reordered.length, indices.length, materials.length)
      reordered.push(...indices)
      materials.push(material)
    }
    geometry.setIndex(reordered)
    object.material = materials
  })
}
