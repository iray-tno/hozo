import { spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { delimiter, join, resolve } from 'node:path'

// This is the repository's && pipeline grammar, not a general shell parser.
// Keep quoted operators in node -e intact; refuse other shell control flow
// rather than change its meaning while injecting a reporter.
export function testStages(script) {
  const stages = []
  let start = 0
  let quote = null
  for (let i = 0; i < script.length; i++) {
    const char = script[i]
    if (char === '\\' && quote !== "'") {
      i++
      continue
    }
    if (quote) {
      if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'") quote = char
    else if (script.slice(i, i + 2) === '&&') {
      stages.push(script.slice(start, i).trim())
      start = ++i + 1
    } else if ('|;&<>\n\r'.includes(char)) {
      throw new Error(`Unsupported test-script control flow: ${script}`)
    }
  }
  if (quote) throw new Error(`Unclosed quote in test script: ${script}`)
  stages.push(script.slice(start).trim())
  if (stages.some((stage) => !stage)) throw new Error(`Empty test-script stage: ${script}`)
  return stages.map((command) => {
    const match = /^node\s+--test(?:\s+(.*))?$/.exec(command)
    if (!match) return { command }
    if (/[\\$`]/.test(match[1] ?? '')) throw new Error(`Unsupported Node test argument: ${command}`)
    // The maintained test scripts use flags and file/glob arguments, not
    // shell interpolation. Node itself expands these globs on both OSes.
    const args = []
    let word = ''
    let active = false
    let quoted = null
    for (const char of `${match[1] ?? ''} `) {
      if (quoted) {
        if (char === quoted) quoted = null
        else word += char
      } else if (char === '"' || char === "'") {
        quoted = char
        active = true
      } else if (/\s/.test(char)) {
        if (active) args.push(word)
        word = ''
        active = false
      } else {
        word += char
        active = true
      }
    }
    if (args.some((arg) => arg.startsWith('--test-reporter')))
      throw new Error(`Test reporter is owned by the report runner: ${command}`)
    if (!args.length) throw new Error(`Node test stage must name its inputs: ${command}`)
    return { command, nodeArgs: args }
  })
}

const escapeXml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')

export function stageJUnit(name, command, error, output = '') {
  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="Package commands"><testsuite name="${escapeXml(name)}" package="TypeScript" tests="1" failures="${error ? 1 : 0}" errors="0"><testcase name="${escapeXml(command)}" classname="package.pipeline">${error ? `<failure message="${escapeXml(error)}" type="package-stage"/>` : ''}<system-out>${escapeXml(output.slice(-250_000))}</system-out></testcase></testsuite></testsuites>\n`
}

/** Run every canonical stage once, stopping only this package on failure. */
export function runPackageStages({ name, dir, script, reportDir, normalize = (xml) => xml }) {
  mkdirSync(reportDir, { recursive: true })
  // A repeat must not certify stale reports from a formerly executed stage.
  const prefix = `node-${name}-stage-`
  for (const file of readdirSync(reportDir)) {
    if (
      file === `node-${name}.xml` ||
      file === `node-${name}-plan.xml` ||
      file === `node-${name}-runner.xml` ||
      (file.startsWith(prefix) && /^\d+\.xml$/.test(file.slice(prefix.length)))
    )
      rmSync(join(reportDir, file))
  }
  let stages
  try {
    stages = testStages(script)
  } catch (error) {
    writeFileSync(join(reportDir, `node-${name}-plan.xml`), stageJUnit(name, script, error.message))
    return false
  }
  for (const [index, stage] of stages.entries()) {
    const dest = resolve(reportDir, `node-${name}-stage-${index + 1}.xml`)
    const env = {
      ...process.env,
      PATH: [
        resolve(dir, 'node_modules/.bin'),
        resolve('node_modules/.bin'),
        process.env.PATH,
      ].join(delimiter),
    }
    // These are independent test runs, not children inside the collector's
    // own node:test suite. Inheriting this makes Node skip their files.
    delete env.NODE_TEST_CONTEXT
    const result = stage.nodeArgs
      ? spawnSync(
          process.execPath,
          [
            '--test',
            '--test-reporter=junit',
            `--test-reporter-destination=${dest}`,
            ...stage.nodeArgs,
          ],
          { cwd: dir, env, stdio: 'inherit' },
        )
      : spawnSync(stage.command, {
          cwd: dir,
          env,
          shell: true,
          encoding: 'utf8',
          maxBuffer: 16 * 1024 * 1024,
        })
    let error =
      result.error?.message ??
      (result.status !== 0 ? `exit ${result.status}, signal ${result.signal}` : '')
    if (stage.nodeArgs) {
      let raw
      try {
        raw = readFileSync(dest, 'utf8')
        if (!raw.includes('<testcase')) throw new Error('No JUnit test cases produced')
        writeFileSync(dest, normalize(raw, 'typescript', name))
      } catch (failure) {
        if (raw !== undefined) writeFileSync(`${dest}.raw`, raw)
        error ||= failure.message
        writeFileSync(dest, stageJUnit(name, stage.command, error))
      }
    } else {
      const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
      process.stdout.write(output)
      writeFileSync(dest, stageJUnit(name, stage.command, error, output))
    }
    if (error) return false
  }
  return true
}
