import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export const EXPORT_TIMEOUT_MS = 180_000

/** One fresh export, no retry, followed by the existing content assertions. */
export function verifyExpoExport({
  root,
  cli,
  platform,
  verify,
  run = spawnSync,
  timeout = EXPORT_TIMEOUT_MS,
}) {
  assert.ok(['android', 'ios'].includes(platform))
  const dist = path.join(root, 'dist')
  const reports = path.join(root, 'artifacts', 'bundle-exports')
  mkdirSync(dist, { recursive: true })
  mkdirSync(reports, { recursive: true })
  // A previous export cannot make a cancelled or incomplete child look valid.
  // Do not delete a user's output directory to enforce that boundary.
  const output = mkdtempSync(path.join(dist, `check-${platform}-`))
  const args = [
    cli,
    'export',
    '--platform',
    platform,
    '--no-bytecode',
    '--max-workers',
    '2',
    '--output-dir',
    output,
  ]
  const started = performance.now()
  const evidence = {
    platform,
    source: process.env.GITHUB_SHA ?? null,
    startedAt: new Date().toISOString(),
    timeoutMs: timeout,
    workers: 2,
    output: path.relative(root, output),
    passed: false,
    phase: 'process',
  }
  try {
    const env = { ...process.env, CI: '1', STORYBOOK_DISABLE_TELEMETRY: '1' }
    delete env.NODE_TEST_CONTEXT
    const result = run(process.execPath, args, { cwd: root, stdio: 'inherit', timeout, env })
    evidence.process = {
      status: result.status,
      signal: result.signal,
      error: result.error ? { code: result.error.code, message: result.error.message } : null,
    }
    // Expo's CLI catches SIGTERM and exits 0. spawnSync can therefore return
    // status=0 AND error=ETIMEDOUT. Status alone does not establish completion.
    if (result.error)
      throw new Error(
        `${platform} export failed: ${result.error.code ?? ''} ${result.error.message}`,
        { cause: result.error },
      )
    assert.equal(result.signal, null, `${platform} export interrupted: ${result.signal}`)
    assert.equal(result.status, 0, `${platform} export failed with exit ${result.status}`)
    evidence.phase = 'metadata'
    const metadataFile = path.join(output, 'metadata.json')
    let raw
    try {
      raw = readFileSync(metadataFile)
    } catch (error) {
      throw new Error(`${platform} export exited 0 without fresh metadata at ${metadataFile}`, {
        cause: error,
      })
    }
    const metadata = JSON.parse(raw)
    assert.equal(
      typeof metadata.fileMetadata?.[platform]?.bundle,
      'string',
      `${platform} export has no bundle entry`,
    )
    assert.ok(
      Array.isArray(metadata.fileMetadata[platform].assets),
      `${platform} export has no asset list`,
    )
    const entry = path.resolve(output, metadata.fileMetadata[platform].bundle)
    const relative = path.relative(output, entry)
    assert.ok(
      relative && !relative.startsWith('..') && !path.isAbsolute(relative),
      'bundle must be inside its fresh export',
    )
    evidence.metadataSha256 = createHash('sha256').update(raw).digest('hex')
    evidence.phase = 'content'
    verify({ output, metadata })
    const bundle = readFileSync(entry)
    assert.ok(bundle.length, `${platform} bundle is empty`)
    evidence.bundleSha256 = createHash('sha256').update(bundle).digest('hex')
    evidence.passed = true
    evidence.phase = 'complete'
    return { output, metadata }
  } catch (error) {
    evidence.error = error.message
    throw error
  } finally {
    evidence.elapsedMs = Math.round(performance.now() - started)
    writeFileSync(path.join(reports, `${platform}.json`), `${JSON.stringify(evidence, null, 2)}\n`)
  }
}
