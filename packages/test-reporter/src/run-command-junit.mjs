import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [, , suiteName, command, ...args] = process.argv

if (!suiteName || !command) {
  process.stderr.write('Usage: run-command-junit <suite-name> <command> [...args]\n')
  process.exit(2)
}

const escapeXml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')

const started = performance.now()
const child = spawn(command, args, {
  env: process.env,
  shell: process.platform === 'win32',
  stdio: ['inherit', 'pipe', 'pipe'],
})

const output = []
for (const stream of [child.stdout, child.stderr]) {
  stream.on('data', (chunk) => {
    const text = chunk.toString()
    output.push(text)
    const destination = stream === child.stdout ? process.stdout : process.stderr
    destination.write(text)
  })
}

const result = await new Promise((resolve) => {
  child.once('error', (error) => resolve({ status: 1, error }))
  child.once('close', (status, signal) => resolve({ status: status ?? 1, signal }))
})

const seconds = ((performance.now() - started) / 1000).toFixed(3)
const failure =
  result.status === 0
    ? ''
    : `
      <failure message="${escapeXml(
        result.error?.message ??
          (result.signal ? `terminated by ${result.signal}` : `command exited ${result.status}`),
      )}" type="command" />`
// Enough context for a useful Allure failure without turning a noisy bundle
// log into a multi-megabyte artifact. The live Actions log remains complete.
const log = output.join('').slice(-250_000)
const slug = suiteName.replaceAll(/[^a-zA-Z0-9_.-]/g, '-')
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="Slow checks" tests="1" failures="${result.status === 0 ? 0 : 1}" errors="0" time="${seconds}">
  <testsuite name="${escapeXml(suiteName)}" tests="1" failures="${result.status === 0 ? 0 : 1}" errors="0" time="${seconds}">
    <testcase name="${escapeXml(command)}" classname="slow.${escapeXml(slug)}" time="${seconds}">${failure}
      <system-out>${escapeXml(log)}</system-out>
    </testcase>
  </testsuite>
</testsuites>
`

mkdirSync('junit-reports', { recursive: true })
writeFileSync(join('junit-reports', `slow-${slug}.xml`), xml, 'utf8')
process.exitCode = result.status
