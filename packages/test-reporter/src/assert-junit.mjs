import { globSync, readFileSync } from 'node:fs'
import { DOMParser } from '@xmldom/xmldom'

const files = globSync('junit-reports/*.xml')
if (files.length === 0) {
  throw new Error('No JUnit reports were produced')
}

const failed = []
for (const file of files) {
  const parseErrors = []
  const document = new DOMParser({
    onError: (level, message) => {
      if (level !== 'warning') parseErrors.push(message)
    },
  }).parseFromString(readFileSync(file, 'utf8'), 'application/xml')

  if (parseErrors.length > 0) {
    failed.push(`${file} (invalid XML)`)
    continue
  }

  const cases = Array.from(document.getElementsByTagName('testcase'))
  const hasFailure = cases.some(
    (testCase) =>
      testCase.getElementsByTagName('failure').length > 0 ||
      testCase.getElementsByTagName('error').length > 0,
  )
  if (hasFailure) failed.push(file)
}

if (failed.length > 0) {
  process.stderr.write(`Reported checks failed:\n  - ${failed.join('\n  - ')}\n`)
  process.exitCode = 1
} else {
  process.stdout.write(`${files.length} JUnit report(s) passed\n`)
}
