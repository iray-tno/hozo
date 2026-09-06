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
    .replace(/^.*?packages\/[^/]+\//, '')
    .replace(/^\.\//, '')
    .replace(/^(src|\.test-build)\//, '')
    .replace(/\.(test|spec)\.[^.]+$/, '')
    .replace(/\.[^.]+$/, '')
    .split('/')
    .filter(Boolean)
    .join('::')
}

function normalizeTypeScriptCase(testcase) {
  const file = testcase.getAttribute('file')
  const classname = testcase.getAttribute('classname')
  const parentName = testcase.parentNode?.getAttribute('name')
  const source =
    file && file !== 'test'
      ? file
      : classname && classname !== 'test'
        ? classname
        : (parentName ?? '')
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

export function normalizeJUnit(xml, reportType, suitePackageName) {
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

  const root = document.documentElement
  const existingSuites = Array.from(document.getElementsByTagName('testsuite'))

  if (existingSuites.length === 0) {
    // Allure 3 reader requires <testsuite> elements to discover testcases.
    // Wrap direct testcase children in a <testsuite> element.
    const allCases = Array.from(document.getElementsByTagName('testcase'))
    const suiteElem = document.createElement('testsuite')
    suiteElem.setAttribute('name', suitePackageName || suiteName)
    suiteElem.setAttribute('package', suiteName)
    suiteElem.setAttribute('tests', String(allCases.length))

    let failures = 0
    let errors = 0
    for (const c of allCases) {
      if (c.getElementsByTagName('failure').length > 0) failures++
      if (c.getElementsByTagName('error').length > 0) errors++
      suiteElem.appendChild(c)
    }
    suiteElem.setAttribute('failures', String(failures))
    suiteElem.setAttribute('errors', String(errors))

    if (root.tagName.toLowerCase() === 'testsuites') {
      root.appendChild(suiteElem)
    } else {
      const newRoot = document.createElement('testsuites')
      newRoot.setAttribute('name', suiteName)
      newRoot.appendChild(suiteElem)
      return new XMLSerializer().serializeToString(newRoot)
    }
  } else {
    for (const testsuite of existingSuites) {
      if (!testsuite.getAttribute('package')) {
        testsuite.setAttribute('package', suiteName)
      }
      if (reportType === 'rust') {
        testsuite.setAttribute('package', 'Rust')
      }
    }
  }

  if (root.tagName.toLowerCase() === 'testsuites') {
    root.setAttribute('name', suiteName)
  }

  return new XMLSerializer().serializeToString(document)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [reportType, filePath, packageName] = process.argv.slice(2)
  if (!reportType || !filePath) {
    console.error('Usage: normalize-junit <rust|typescript> <path-to-junit.xml> [package-name]')
    process.exit(1)
  }

  const xml = readFileSync(filePath, 'utf8')
  writeFileSync(filePath, normalizeJUnit(xml, reportType, packageName), 'utf8')
}
