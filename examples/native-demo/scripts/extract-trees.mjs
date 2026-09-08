// Cuts the accessibility trees out of an xcodebuild log.
//
// `AccessibilityTreeTests.swift` prints each tree between markers rather
// than attaching it to the `.xcresult`: an attachment needs `xcresulttool`
// and a JSON schema that has changed shape twice in three Xcode versions,
// while the log is already collected and already an artifact.
//
// Judged by what arrives, not by what the log says happened. A run whose
// tests "passed" but printed no tree is a run that proved nothing, and
// that is the failure this script exists to make loud -- the Android job
// spent four CI runs on the version of this mistake where the check
// matched a message.

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const [log, outputDir = process.cwd()] = process.argv.slice(2)
if (!log) {
  console.error('usage: extract-trees.mjs <xcodebuild.log> [output directory]')
  process.exit(2)
}

/** Every `HOZO_TREE_BEGIN <name> ... HOZO_TREE_END <name>` block. */
function trees(text) {
  const found = new Map()
  const pattern = /HOZO_TREE_BEGIN (\w+)\r?\n([\s\S]*?)\r?\nHOZO_TREE_END \1/g
  for (const [, name, body] of text.matchAll(pattern)) {
    // The last one wins: a retried test prints twice, and the retry is the
    // run whose assertions were reported.
    found.set(name, body.trim())
  }
  return found
}

const found = trees(readFileSync(log, 'utf8'))
const expected = ['acceptance', 'gallery']
const missing = expected.filter((name) => !found.has(name))

for (const [name, body] of found) {
  let parsed
  try {
    parsed = JSON.parse(body)
  } catch (error) {
    console.error(`::error::the ${name} tree is not JSON: ${error.message}`)
    process.exit(1)
  }
  const file = path.join(outputDir, `ios-${name}-tree.json`)
  writeFileSync(file, `${JSON.stringify(parsed, null, 2)}\n`)
  const named = parsed.filter((element) => element.identifier)
  console.log(`${file}: ${parsed.length} elements, ${named.length} of them named by the source`)
  if (named.length === 0) {
    console.error(`::error::the ${name} tree has no identifiers, so nothing can be joined to it`)
    process.exit(1)
  }
}

if (missing.length > 0) {
  console.error(`::error::no ${missing.join(' or ')} tree in the log: the test printed none`)
  process.exit(1)
}
