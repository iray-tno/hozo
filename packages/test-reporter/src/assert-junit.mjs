import { globSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DOMParser } from '@xmldom/xmldom'

export function checkJUnitDirectory(directory = 'junit-reports') {
  const files = globSync(join(directory, '*.xml')).sort()
  if (files.length === 0) {
    throw new Error('No JUnit reports were produced')
  }

  const failed = []
  const externalFailed = []
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

    const isExternal = document.documentElement?.getAttribute('external') === 'true'
    const cases = Array.from(document.getElementsByTagName('testcase'))
    const hasFailure = cases.some(
      (testCase) =>
        testCase.getElementsByTagName('failure').length > 0 ||
        testCase.getElementsByTagName('error').length > 0,
    )
    if (hasFailure) {
      if (isExternal) externalFailed.push(file)
      else failed.push(file)
    }
  }

  return { total: files.length, failed, externalFailed }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { total, failed, externalFailed } = checkJUnitDirectory(process.argv[2])
  if (externalFailed.length > 0) {
    process.stdout.write(
      `External workflow snapshot(s) with recorded failures:\n  - ${externalFailed.join('\n  - ')}\n`,
    )
  }
  if (failed.length > 0) {
    process.stderr.write(`Reported checks failed:\n  - ${failed.join('\n  - ')}\n`)
    process.exitCode = 1
  } else {
    process.stdout.write(`${total} JUnit report(s) passed\n`)
  }
}
