// The comparison, run against a tree that came off a device a moment ago.
//
// `native-tree.test.ts` runs it against checked-in fixtures, which is what
// keeps the adapters honest at every commit. This is the other half its
// header claimed already existed and did not: the device jobs collected a
// dump, uploaded it as an artifact, and nobody looked. A regression on the
// platform -- React Native changing which widget it picks, an OS release
// dropping a trait -- would have sat in an artifact until somebody
// refreshed a fixture by hand.
//
// Same functions as the fixtures use, deliberately. Two comparisons that
// agree today and drift tomorrow is the failure this repository keeps
// finding, so there is one comparison and two callers.
//
//     node --experimental-strip-types native-tree-check.ts \
//       --platform android --tree window_dump.xml --source App.tsx
//
// Exits non-zero on a divergence the platform does not explain, on an
// element the screen should have drawn and did not, and -- the one that
// matters most -- on a join that found nothing, because every other check
// here passes trivially when one side is empty.

import { readFileSync } from 'node:fs'

import {
  announcedByCompiler,
  parseAndroidDump,
  parseIosTree,
  unexplainedAbsences,
  unexplainedDivergences,
} from './native-tree.ts'

function argument(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`)
  return at === -1 ? undefined : process.argv[at + 1]
}

const platform = argument('platform')
const treeFile = argument('tree')
const sourceFile = argument('source')

if (!platform || !treeFile || !sourceFile) {
  console.error(
    'usage: native-tree-check.ts --platform <android|ios> --tree <dump> --source <App.tsx>',
  )
  process.exit(2)
}
if (platform !== 'android' && platform !== 'ios') {
  console.error(`::error::unknown platform ${platform}`)
  process.exit(2)
}

const tree = readFileSync(treeFile, 'utf8')
const device = platform === 'android' ? parseAndroidDump(tree) : parseIosTree(tree)
const compiled = announcedByCompiler(readFileSync(sourceFile, 'utf8'))
const joined = [...compiled.keys()].filter((testID) => device.has(testID))

console.log(
  `${platform}: the compiler named ${compiled.size} elements, the device exposed ${device.size}, ` +
    `${joined.length} are in both`,
)

let failed = false

// First, because it is the one that makes the rest meaningful. A tree that
// joined to nothing satisfies every assertion below.
if (joined.length < 4) {
  console.error(
    `::error::only ${joined.length} elements are in both, so this comparison compared nothing`,
  )
  failed = true
}

for (const divergence of unexplainedDivergences(compiled, device, platform)) {
  console.error(
    `::error::${divergence.testID}: the compiler emitted ${divergence.field} ` +
      `${JSON.stringify(divergence.compiled)}, the device exposes ` +
      `${JSON.stringify(divergence.device)}`,
  )
  failed = true
}

for (const testID of unexplainedAbsences(compiled, device)) {
  console.error(`::error::${testID} is in the compiled output and not in the tree: nothing drew it`)
  failed = true
}

process.exit(failed ? 1 : 0)
