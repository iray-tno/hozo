import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'

const REPORT_TYPES = {
  rust: 'Rust',
  typescript: 'TypeScript',
}

function moduleFromTypeScriptPath(filePath) {
  return filePath
    .replaceAll('\\', '/')
    .replace(/^\.\//, '')
    .replace(/^src\//, '')
    .replace(/\.(test|spec)\.[^.]+$/, '')
    .replace(/\.[^.]+$/, '')
    .split('/')
    .filter(Boolean)
    .join('::')
}

function normalizeTypeScriptCase(testcase) {
  const source =
    testcase.getAttribute('classname') ?? testcase.parentNode?.getAttribute('name') ?? ''
  testcase.setAttribute('classname', moduleFromTypeScriptPath(source) || 'root')
}

function normalizeRustCase(testcase) {
  const name = testcase.getAttribute('name') ?? ''
  const parts = name.split('::').filter((part) => part && part !== 'tests')

  if (parts.length <= 1) {
    testcase.setAttribute('classname', 'root')
    return
  }

  testcase.setAttribute('name', parts.at(-1))
  testcase.setAttribute('classname', parts.slice(0, -1).join('::'))
}

export function normalizeJUnit(xml, reportType) {
  const suiteName = REPORT_TYPES[reportType]
  if (!suiteName) {
    throw new Error(`Unknown report type: ${reportType}`)
  }

  const parseErrors = []
  const document = new DOMParser({
    onError: (level, message) => {
      if (level === 'error' || level === 'fatalError') parseErrors.push(message)
    },
  }).parseFromString(xml, 'application/xml')

  if (!document?.documentElement || parseErrors.length > 0) {
    throw new Error(`Invalid JUnit XML: ${parseErrors.join('; ') || 'missing document element'}`)
  }

  for (const testcase of document.getElementsByTagName('testcase')) {
    if (reportType === 'typescript') normalizeTypeScriptCase(testcase)
    else normalizeRustCase(testcase)
  }

  for (const testsuite of document.getElementsByTagName('testsuite')) {
    testsuite.setAttribute('name', suiteName)
  }

  const root = document.documentElement
  if (root.tagName.toLowerCase() === 'testsuites') {
    root.setAttribute('name', suiteName)
  }

  return new XMLSerializer().serializeToString(document)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [reportType, filePath] = process.argv.slice(2)
  if (!reportType || !filePath) {
    console.error('Usage: normalize-junit <rust|typescript> <path-to-junit.xml>')
    process.exit(1)
  }

  const xml = readFileSync(filePath, 'utf8')
  writeFileSync(filePath, normalizeJUnit(xml, reportType), 'utf8')
}
