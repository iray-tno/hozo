// Metro can emit an indexed map instead of one flat `sources` array.
export function mapSources(map) {
  if (Array.isArray(map.sections)) return map.sections.flatMap((section) => mapSources(section.map))
  if (Array.isArray(map.sources)) return map.sources
  throw new Error('Expected an inline source map or indexed source-map sections')
}
