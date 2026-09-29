import { readFileSync } from 'node:fs'

const [xmlPath, resourceId, mode] = process.argv.slice(2)
if (!xmlPath || !resourceId) throw new Error('Usage: control-centre.mjs <tree.xml> <resource-id>')

const xml = readFileSync(xmlPath, 'utf8')
for (const match of xml.matchAll(/<node\b[^>]*?\/?>/g)) {
  if (!match[0].includes(`resource-id="${resourceId}"`)) continue
  if (mode === '--focused') {
    console.log(match[0].includes('focused="true"') ? 'true' : 'false')
    process.exit(0)
  }
  const bounds = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(match[0])
  if (!bounds) continue
  const [left, top, right, bottom] = bounds.slice(1).map(Number)
  console.log(`${(left + right) >> 1} ${(top + bottom) >> 1}`)
  process.exit(0)
}

throw new Error(`Could not find ${resourceId} in ${xmlPath}`)
