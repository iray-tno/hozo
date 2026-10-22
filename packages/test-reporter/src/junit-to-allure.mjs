import { randomUUID } from 'node:crypto'
import {
  existsSync,
  globSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { DOMParser } from '@xmldom/xmldom'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const repositoryUrl = 'https://github.com/iray-tno/hozo'

function firstChild(element, tagName) {
  return element.getElementsByTagName(tagName).item(0)
}

function compiledTypeScriptSource(relativePath, root) {
  const match = relativePath.match(/^packages\/([^/]+)\/\.test-build\/(.+)\.js$/)
  if (!match) return relativePath

  const [, packageName, stem] = match
  for (const extension of ['ts', 'tsx']) {
    const candidate = `packages/${packageName}/src/${stem}.${extension}`
    if (existsSync(join(root, ...candidate.split('/')))) return candidate
  }
  return undefined
}

function fileSource(testcase, root) {
  const raw = (
    testcase.getAttribute('file') || testcase.parentNode?.getAttribute('file')
  )?.replaceAll('\\', '/')
  if (!raw) return undefined

  const packageIndex = raw.indexOf('packages/')
  if (packageIndex !== -1) {
    return compiledTypeScriptSource(raw.slice(packageIndex), root)
  }

  const repoMatch = raw.match(/(?:^|\/)((?:scripts|apps|examples|crates|\.github)\/.+)$/)
  if (repoMatch) {
    const candidate = repoMatch[1]
    if (existsSync(join(root, ...candidate.split('/')))) return candidate
    return candidate
  }

  if (existsSync(join(root, ...raw.split('/')))) return raw
  return undefined
}

function rustSource(testcase, root) {
  const parts = (testcase.getAttribute('classname') ?? '').split('::').filter(Boolean)
  const crate = parts.shift()
  if (!crate || !existsSync(join(root, 'crates', crate, 'src'))) return undefined

  for (let length = parts.length; length > 0; length -= 1) {
    const modulePath = parts.slice(0, length).join('/')
    for (const relative of [
      `crates/${crate}/src/${modulePath}.rs`,
      `crates/${crate}/src/${modulePath}/mod.rs`,
    ]) {
      if (existsSync(join(root, ...relative.split('/')))) return relative
    }
  }

  return `crates/${crate}/src/lib.rs`
}

export function sourcePathForCase(testcase, root = repositoryRoot) {
  const suite = testcase.parentNode
  const language = suite?.getAttribute('package')
  if (language === 'Rust') return rustSource(testcase, root) ?? fileSource(testcase, root)
  return fileSource(testcase, root)
}

function subSuiteFor(parentSuite, suiteName, classname) {
  if (!classname || classname === 'root' || classname === 'test' || classname === suiteName) {
    return undefined
  }
  if (parentSuite === 'Rust') {
    const prefix = `${suiteName}::`
    return classname.startsWith(prefix) ? classname.slice(prefix.length) : classname
  }
  if (parentSuite === 'TypeScript') {
    if (classname === 'package.pipeline') return 'pipeline'
    return classname
  }
  if (parentSuite === 'Integration & Conformance') {
    const prefix = `${suiteName}::`
    if (classname.startsWith(prefix)) return classname.slice(prefix.length)
  }
  return undefined
}

function statusFor(testcase) {
  if (firstChild(testcase, 'failure')) return 'failed'
  if (firstChild(testcase, 'error')) return 'broken'
  if (firstChild(testcase, 'skipped')) return 'skipped'
  return 'passed'
}

function statusDetailsFor(testcase) {
  const detail =
    firstChild(testcase, 'failure') ??
    firstChild(testcase, 'error') ??
    firstChild(testcase, 'skipped')
  if (!detail) return undefined
  return {
    message: detail.getAttribute('message') ?? undefined,
    trace: detail.textContent || undefined,
  }
}

function attachmentFor(testcase, tagName, name, uuid, outputDirectory) {
  const element = firstChild(testcase, tagName)
  if (!element?.textContent) return undefined
  const source = `${uuid}-${tagName}-attachment.txt`
  writeFileSync(join(outputDirectory, source), element.textContent, 'utf8')
  return { name, type: 'text/plain', source }
}

function stepsFor(testcase, startTime) {
  const stepElements = Array.from(testcase.getElementsByTagName('step'))
  let cursor = startTime
  return stepElements.map((step) => {
    const duration = Math.max(0, Number(step.getAttribute('time') || 0) * 1000)
    const item = {
      name: step.getAttribute('name') || 'Step',
      status: step.getAttribute('status') || 'passed',
      stage: 'finished',
      start: cursor,
      stop: cursor + duration,
    }
    cursor += duration
    return item
  })
}

function parametersFor(testcase) {
  const pairs = [
    ['branch', testcase.getAttribute('branch')],
    ['commit', testcase.getAttribute('sha')],
    ['event', testcase.getAttribute('event')],
    ['completed', testcase.getAttribute('completed-at')],
  ]
  return pairs.filter(([, value]) => Boolean(value)).map(([name, value]) => ({ name, value }))
}

function linksFor(testcase, sourcePath) {
  const links = []
  if (sourcePath) {
    links.push({
      name: sourcePath,
      type: 'source',
      url: `${repositoryUrl}/blob/main/${sourcePath}`,
    })
  }
  const jobUrl = testcase.getAttribute('job-url')
  const runUrl = testcase.getAttribute('run-url')
  if (jobUrl) {
    links.push({
      name: 'GitHub Actions Job',
      type: 'tms',
      url: jobUrl,
    })
  }
  if (runUrl && runUrl !== jobUrl) {
    links.push({
      name: 'GitHub Actions Run',
      type: 'issue',
      url: runUrl,
    })
  }
  return links
}

function convertCase(testcase, outputDirectory, root) {
  const suite = testcase.parentNode
  const name = testcase.getAttribute('name') || 'Unnamed test'
  const classname = testcase.getAttribute('classname') || 'root'
  // Keep the JUnit reader's identity spelling so adding links does not
  // reset the history that was collected before this converter existed.
  const fullName = `${classname}.${name}`
  const uuid = randomUUID()
  const duration = Math.max(0, Number(testcase.getAttribute('time') || 0) * 1000)
  const completedAt = Date.parse(testcase.getAttribute('completed-at') ?? '')
  const stop = Number.isFinite(completedAt) ? completedAt : Date.now() + duration
  const start = Math.max(0, stop - duration)
  const sourcePath = sourcePathForCase(testcase, root)
  const parentSuite = suite?.getAttribute('package') || 'Tests'
  const suiteName = suite?.getAttribute('name') || 'Tests'
  const subSuite = subSuiteFor(parentSuite, suiteName, classname)
  const attachments = [
    attachmentFor(testcase, 'system-out', 'System output', uuid, outputDirectory),
    attachmentFor(testcase, 'system-err', 'System error', uuid, outputDirectory),
  ].filter(Boolean)
  const steps = stepsFor(testcase, start)
  const parameters = parametersFor(testcase)

  const labels = [
    { name: 'parentSuite', value: parentSuite },
    { name: 'suite', value: suiteName },
    ...(subSuite ? [{ name: 'subSuite', value: subSuite }] : []),
    { name: 'testClass', value: classname },
  ]

  return {
    uuid,
    name,
    fullName,
    status: statusFor(testcase),
    statusDetails: statusDetailsFor(testcase),
    stage: 'finished',
    start,
    stop,
    labels,
    links: linksFor(testcase, sourcePath),
    ...(steps.length > 0 ? { steps } : {}),
    ...(parameters.length > 0 ? { parameters } : {}),
    attachments,
  }
}

export function convertJUnitDirectory(
  inputDirectory = 'junit-reports',
  outputDirectory = 'allure-results',
  root = repositoryRoot,
) {
  mkdirSync(outputDirectory, { recursive: true })
  for (const name of readdirSync(outputDirectory)) {
    if (name.endsWith('-result.json') || name.includes('-attachment.')) {
      unlinkSync(join(outputDirectory, name))
    }
  }

  let converted = 0
  for (const file of globSync(join(inputDirectory, '*.xml'))) {
    const document = new DOMParser().parseFromString(readFileSync(file, 'utf8'), 'application/xml')
    for (const testcase of document.getElementsByTagName('testcase')) {
      const result = convertCase(testcase, outputDirectory, root)
      writeFileSync(
        join(outputDirectory, `${result.uuid}-result.json`),
        `${JSON.stringify(result, null, 2)}\n`,
        'utf8',
      )
      converted += 1
    }
  }
  return converted
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const count = convertJUnitDirectory(process.argv[2], process.argv[3])
  process.stdout.write(`Converted ${count} JUnit test case(s) to linked Allure results\n`)
}
