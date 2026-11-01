// Catalog-owned publication routing, not a runtime component-name registry.
import {
  OWNER_PACKAGE_SCHEMA,
  parseOwnerPackageShadow,
} from '../../packages/compiler/src/owner-package.ts'
import { components, ownerPublications, ownerShadow } from './catalog.mjs'

/** Produce scoped owner references using public VALUE names from a real
 * entry probe. Facades receive no contracts merely by re-exporting a name.
 * The shared bounded reader still owns contract/channel validation.
 */
export function packageOwnerChannels(
  packageName,
  valueExports,
  { shadow = ownerShadow, publications = ownerPublications } = {},
) {
  const declared = new Set()
  const contracts = new Map()
  for (const contract of shadow.contracts) {
    if (contracts.has(contract.owner)) throw new Error('Duplicate catalog owner')
    const [component] = contract.owner.split('.')
    if (!components[component]?.some((slot) => slot.classProp === contract.classProp))
      throw new Error(`Owner is not an inventoried catalog slot: ${contract.owner}`)
    contracts.set(contract.owner, contract)
  }
  const names = new Set(valueExports)
  if (names.size !== valueExports.length) throw new Error('Duplicate public value export')
  const refs = new Map()
  for (const publication of publications) {
    if (
      !contracts.has(publication.owner) ||
      declared.has(publication.owner) ||
      typeof publication.package !== 'string' ||
      !/^@hozo\/[a-z][a-z-]*$/.test(publication.package) ||
      !Array.isArray(publication.exports) ||
      !publication.exports.length ||
      new Set(publication.exports).size !== publication.exports.length
    )
      throw new Error('Invalid or ambiguous catalog owner publication')
    declared.add(publication.owner)
    if (publication.package !== packageName) continue
    for (const name of publication.exports) {
      if (!names.has(name)) throw new Error(`Owner publication has no public value export: ${name}`)
      const owners = refs.get(name) ?? []
      owners.push(publication.owner)
      refs.set(name, owners)
    }
  }
  if ([...contracts.keys()].some((owner) => !declared.has(owner)))
    throw new Error('Catalog owner has no publication declaration')
  const selected = shadow.contracts.filter((contract) =>
    publications.some((row) => row.owner === contract.owner && row.package === packageName),
  )
  const parsed = parseOwnerPackageShadow(
    JSON.stringify({
      schema: OWNER_PACKAGE_SCHEMA,
      owners: selected.length ? { schema: shadow.schema, contracts: selected } : null,
      exports: [...valueExports]
        .sort()
        .map((name) => ({ name, owners: (refs.get(name) ?? []).sort() })),
      candidates: [],
      helpers: [],
      compiledByConsumer: false,
      textForwarding: { version: 1, textForwarding: {} },
    }),
  )
  return { owners: parsed.owners, exports: parsed.exports }
}
