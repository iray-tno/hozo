// Measurement/test selection only, never a package resolver or adapter API.
// Miniature fixtures must not silently acquire every new catalog owner. Real
// consumers select through the captured package export/class-prop identity.
import { readFileSync } from 'node:fs'

export function ownerFixtureShadow(owner) {
  const shadow = JSON.parse(readFileSync(new URL('./owner-shadow.json', import.meta.url), 'utf8'))
  const contracts = shadow.contracts.filter((contract) => contract.owner === owner)
  if (contracts.length !== 1) throw new Error(`Expected one catalog fixture owner: ${owner}`)
  return JSON.stringify({ schema: shadow.schema, contracts })
}
