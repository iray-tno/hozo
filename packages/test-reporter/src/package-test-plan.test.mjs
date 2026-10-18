import assert from 'node:assert/strict'
import { globSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { runPackageStages, testStages } from './package-test-plan.mjs'

function fixture(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'hozo-report-stages-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const reportDir = path.join(dir, 'reports')
  const write = (name, source) => writeFileSync(path.join(dir, name), source)
  const trace = (label) =>
    `import {appendFileSync} from 'node:fs'; appendFileSync('trace', '${label}\\n');`
  const nodeTest = (label, pass = true) =>
    `import test from 'node:test'; import assert from 'node:assert/strict'; ${trace(label)} test('${label}',()=>assert.equal(${pass},true));`
  write('prepare.mjs', trace('prepare'))
  write('first.test.mjs', nodeTest('first'))
  write('second.test.mjs', nodeTest('second'))
  write('check.mjs', trace('check'))
  return { dir, reportDir, write, trace, nodeTest }
}

test('the actual Three script retains both Node suites and both trailing reports', () => {
  const { scripts } = JSON.parse(readFileSync(new URL('../../three/package.json', import.meta.url)))
  const stages = testStages(scripts.test)
  assert.equal(stages.length, 6)
  assert.equal(stages.filter((stage) => stage.nodeArgs).length, 2)
  assert.deepEqual(
    stages.slice(-2).map((stage) => stage.command),
    ['node scripts/report-conformance.ts --check', 'node scripts/report-scenes.ts --check'],
  )
})

test('every current package test script is fully represented without executing the packages', () => {
  const root = new URL('../../', import.meta.url)
  const files = globSync('*/package.json', { cwd: root })
  let packages = 0
  for (const file of files) {
    const { scripts } = JSON.parse(readFileSync(new URL(file.replaceAll('\\', '/'), root)))
    if (!scripts?.test) continue
    const stages = testStages(scripts.test)
    assert.ok(stages.length > 0, file)
    assert.ok(
      stages.some((stage) => stage.nodeArgs),
      file,
    )
    packages++
  }
  assert.ok(packages >= 23, 'package discovery cannot silently become empty')
})

test('quoted && stays one preparation command and Node argument values stay paired', () => {
  const stages = testStages(
    'node -e "console.log(1 && 2)" && node --test --test-concurrency=1 --test-name-pattern "a case" "space dir/*.test.mjs"',
  )
  assert.equal(stages.length, 2)
  assert.deepEqual(stages[1].nodeArgs, [
    '--test-concurrency=1',
    '--test-name-pattern',
    'a case',
    'space dir/*.test.mjs',
  ])
  for (const script of [
    'node --test a || echo ok',
    'node --test a; echo ok',
    'node --test a &&',
    'node --test "a',
    'node --test --test-reporter=tap a',
  ])
    assert.throws(() => testStages(script))
})

test('real pipeline runs once in order, retaining distinct JUnit for both suites and commands', (t) => {
  const f = fixture(t)
  const script =
    'node prepare.mjs && node --test --test-concurrency=1 first.test.mjs && node --test --test-concurrency=1 second.test.mjs && node check.mjs'
  assert.equal(runPackageStages({ ...f, name: 'sample', script }), true)
  assert.equal(readFileSync(path.join(f.dir, 'trace'), 'utf8'), 'prepare\nfirst\nsecond\ncheck\n')
  const files = readdirSync(f.reportDir).sort()
  assert.equal(files.length, 4)
  assert.match(readFileSync(path.join(f.reportDir, files[1]), 'utf8'), /name="first"/)
  assert.match(readFileSync(path.join(f.reportDir, files[2]), 'utf8'), /name="second"/)
  assert.match(readFileSync(path.join(f.reportDir, files[3]), 'utf8'), /node check.mjs/)
  assert.ok(
    files.every((file) => !readFileSync(path.join(f.reportDir, file), 'utf8').includes('<failure')),
  )
})

test('a failed middle suite aborts later stages and clears only its own stale reports', (t) => {
  const f = fixture(t)
  const script =
    'node prepare.mjs && node --test --test-concurrency=1 first.test.mjs && node --test --test-concurrency=1 second.test.mjs && node check.mjs'
  assert.equal(runPackageStages({ ...f, name: 'sample', script }), true)
  writeFileSync(path.join(f.reportDir, 'node-sample-extra-stage-4.xml'), 'not owned by sample')
  f.write('first.test.mjs', f.nodeTest('first', false))
  f.write('trace', '')
  assert.equal(runPackageStages({ ...f, name: 'sample', script }), false)
  assert.equal(readFileSync(path.join(f.dir, 'trace'), 'utf8'), 'prepare\nfirst\n')
  assert.match(readFileSync(path.join(f.reportDir, 'node-sample-stage-2.xml'), 'utf8'), /<failure/)
  assert.deepEqual(readdirSync(f.reportDir).sort(), [
    'node-sample-extra-stage-4.xml',
    'node-sample-stage-1.xml',
    'node-sample-stage-2.xml',
  ])
})

test('preparation and trailing command failures are observable, not unreported successes', (t) => {
  const f = fixture(t)
  f.write('bad.mjs', `${f.trace('bad')} console.error('<failure & detail>'); process.exitCode=1;`)
  assert.equal(
    runPackageStages({ ...f, name: 'prep', script: 'node bad.mjs && node --test first.test.mjs' }),
    false,
  )
  assert.equal(readFileSync(path.join(f.dir, 'trace'), 'utf8'), 'bad\n')
  assert.match(
    readFileSync(path.join(f.reportDir, 'node-prep-stage-1.xml'), 'utf8'),
    /&lt;failure &amp; detail&gt;/,
  )
  assert.equal(
    runPackageStages({
      ...f,
      name: 'post',
      script: 'node --test --test-concurrency=1 second.test.mjs && node bad.mjs',
    }),
    false,
  )
  assert.match(readFileSync(path.join(f.reportDir, 'node-post-stage-2.xml'), 'utf8'), /<failure/)
  // A failing package never prevents the collector moving on to the next one.
  assert.equal(
    runPackageStages({
      ...f,
      name: 'next',
      script: 'node --test --test-concurrency=1 second.test.mjs',
    }),
    true,
  )
})

test('unmatched test inputs, invalid plans and empty JUnit fail closed', (t) => {
  const f = fixture(t)
  assert.equal(
    runPackageStages({ ...f, name: 'missing', script: 'node --test missing/*.test.mjs' }),
    false,
  )
  assert.match(readFileSync(path.join(f.reportDir, 'node-missing-stage-1.xml'), 'utf8'), /<failure/)
  assert.equal(
    runPackageStages({ ...f, name: 'invalid', script: 'node --test first.test.mjs || echo ok' }),
    false,
  )
  assert.match(readFileSync(path.join(f.reportDir, 'node-invalid-plan.xml'), 'utf8'), /Unsupported/)
  assert.equal(
    runPackageStages({
      ...f,
      name: 'normalize',
      script: 'node --test first.test.mjs',
      normalize: () => {
        throw new Error('invalid XML')
      },
    }),
    false,
  )
  assert.match(
    readFileSync(path.join(f.reportDir, 'node-normalize-stage-1.xml'), 'utf8'),
    /invalid XML/,
  )
  assert.match(
    readFileSync(path.join(f.reportDir, 'node-normalize-stage-1.xml.raw'), 'utf8'),
    /name="first"/,
  )
})
