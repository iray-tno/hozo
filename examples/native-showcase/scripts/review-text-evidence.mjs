// Offline review of retained bytes, independent of the smoke driver's pixel
// helpers/pass flags. This reads artifacts; it never executes archived code.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { PNG } from 'pngjs'

const modes = ['ordinary', 'reference', 'optimized', 'production']
const colors = [
  [223, 32, 32],
  [32, 160, 64],
  [48, 64, 223],
  [160, 32, 192],
]
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const rect = ({ x, y, width, height }) => [x, y, x + width, y + height]
const walk = (tree) => tree.flatMap((node) => [node, ...walk(node.children ?? [])])
const signature = ({ width, height, bytes }) => ({ width, height, rgbaSha256: hash(bytes) })
function unique(nodes, label, field) {
  const matching = nodes.filter((node) => node[field] === label)
  assert.equal(matching.length, 1, `missing/ambiguous AX label: ${label}`)
  return matching[0]
}

export function reviewTextCapture(platform, phase, capture, buffer, ax) {
  assert.ok(modes.includes(phase.mode))
  const png = PNG.sync.read(buffer)
  let bounds, markerBounds
  if (platform === 'ios') {
    const nodes = walk(JSON.parse(ax))
    const node = unique(nodes, capture.label, 'AXLabel')
    const marker = unique(nodes, `Text frame ${phase.mode}`, 'AXLabel')
    const screens = nodes.filter((node) => node.type === 'Application')
    assert.equal(screens.length, 1)
    const screen = rect(screens[0].frame)
    assert.deepEqual(screen.slice(0, 2), [0, 0])
    assert.deepEqual(screen, capture.screenBounds)
    assert.deepEqual(rect(node.frame), capture.pointBounds)
    assert.deepEqual(rect(marker.frame), capture.markerPointBounds)
    assert.equal(node.frame.width, 240)
    assert.equal(marker.frame.width, 32)
    assert.equal(marker.frame.height, 12)
    const sx = png.width / screen[2],
      sy = png.height / screen[3]
    assert.ok(Math.abs(sx - sy) < 0.01)
    const pixels = (r) =>
      r.map((v, i) => (i < 2 ? Math.ceil(v * (i ? sy : sx)) : Math.floor(v * (i === 3 ? sy : sx))))
    bounds = pixels(rect(node.frame))
    markerBounds = pixels(rect(marker.frame))
  } else {
    assert.equal(platform, 'android')
    const nodes = [...ax.matchAll(/<node\b([^>]*)>/g)].map(([, attrs]) =>
      Object.fromEntries(
        [...attrs.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value]),
      ),
    )
    const androidRect = (node) => {
      assert.match(node.bounds, /^\[\d+,\d+\]\[\d+,\d+\]$/)
      return node.bounds.match(/\d+/g).map(Number)
    }
    bounds = androidRect(unique(nodes, capture.label, 'content-desc'))
    markerBounds = androidRect(unique(nodes, `Text frame ${phase.mode}`, 'content-desc'))
  }
  assert.deepEqual(bounds, capture.bounds)
  assert.deepEqual(markerBounds, capture.frame.bounds)
  for (const r of [bounds, markerBounds]) {
    assert.ok(r.every(Number.isInteger))
    assert.ok(r[0] >= 0 && r[1] >= 0 && r[2] <= png.width && r[3] <= png.height)
    assert.ok(r[2] > r[0] && r[3] > r[1], 'empty or clipped region')
  }
  const [left, top, right, bottom] = bounds
  const width = right - left,
    height = bottom - top
  const bytes = Buffer.concat(
    Array.from({ length: height }, (_, row) =>
      png.data.subarray(
        ((top + row) * png.width + left) * 4,
        ((top + row) * png.width + right) * 4,
      ),
    ),
  )
  const sample = { width, height, bytes, bounds }
  assert.deepEqual(signature(sample), {
    width: capture.width,
    height: capture.height,
    rgbaSha256: capture.rgbaSha256,
  })
  const counts = { root: 0, nested: 0, white: 0 }
  const inks = {
    root:
      phase.kind !== 'static' && phase.changed && !phase.override ? [124, 45, 18] : [17, 17, 17],
    nested: [19, 85, 187],
    white: [255, 255, 255],
  }
  for (let i = 0; i < bytes.length; i += 4)
    for (const [name, rgb] of Object.entries(inks))
      if (rgb.every((v, j) => Math.abs(bytes[i + j] - v) <= 8)) counts[name]++
  const valid = counts.root >= 20 && counts.nested >= 40 && counts.white > (width * height) / 4
  assert.deepEqual(capture.ink, { ...counts, valid })
  assert.equal(valid, true)
  const x = Math.floor((markerBounds[0] + markerBounds[2]) / 2),
    y = Math.floor((markerBounds[1] + markerBounds[3]) / 2)
  const rgb = [...png.data.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 3)]
  const expected = colors[modes.indexOf(phase.mode)]
  assert.deepEqual(capture.frame.rgb, rgb)
  assert.deepEqual(capture.frame.expected, expected)
  assert.equal(
    capture.frame.valid,
    rgb.every((v, i) => Math.abs(v - expected[i]) <= 2),
  )
  assert.equal(capture.frame.valid, true)
  assert.match(capture.label, new RegExp(`^${phase.mode} mount ([1-9]\\d*) tick ${phase.tick}$`))
  sample.mount = Number(capture.label.match(/mount (\d+)/)[1])
  assert.equal(sample.mount, capture.mount)
  return sample
}

export function reviewTextEvidence({ platform, evidenceDir, binaryDir, run, commit, manifest }) {
  assert.ok(['android', 'ios'].includes(platform))
  assert.match(run, /^\d+$/)
  assert.match(commit, /^[a-f0-9]{40}$/)
  const json = (dir, name) => JSON.parse(readFileSync(join(dir, name), 'utf8'))
  const e = json(evidenceDir, 'evidence.json'),
    r = e.textInheritance
  assert.equal(e.platform, platform === 'ios' ? 'iOS' : 'Android')
  assert.equal(e.binaryRun, run)
  assert.equal(e.driverCommit, commit)
  assert.equal(e.scenario, 'text-inheritance')
  assert.equal(e.diagnostic, false)
  assert.equal(e.jsBundleCommit, undefined)
  assert.equal(e.passed, true)
  assert.ok(e.checks.length && e.checks.every((c) => c.passed))
  assert.deepEqual(e.textFixture, manifest)
  assert.equal(e.textFixture.schemaVersion, 2)
  assert.equal(r.passed, true)
  assert.deepEqual(r.modes, modes)
  const metadata = json(binaryDir, platform === 'ios' ? 'build.json' : 'signing.json')
  assert.equal(metadata.run, run)
  assert.equal(metadata.commit, commit)
  const binaryHash = hash(
    readFileSync(
      join(binaryDir, platform === 'ios' ? 'HozoShowcase-simulator.zip' : 'app-release.apk'),
    ),
  )
  let bundleHash
  if (platform === 'ios') {
    assert.equal(binaryHash, metadata.archiveSha256)
    assert.equal(binaryHash, e.simulatorArchive.verifiedSha256)
    assert.equal(binaryHash, e.simulatorArchive.archiveSha256)
    const archive = resolve(binaryDir, 'HozoShowcase-simulator.zip')
    const entries = execFileSync('tar', ['-tf', archive], { encoding: 'utf8' }).split(/\r?\n/)
    const bundles = entries.filter((entry) => entry.endsWith('.app/main.jsbundle'))
    assert.equal(bundles.length, 1)
    assert.ok(!bundles[0].startsWith('/') && !bundles[0].split('/').includes('..'))
    bundleHash = hash(
      execFileSync('tar', ['-xOf', archive, '--', bundles[0]], { maxBuffer: 64 * 1024 * 1024 }),
    )
    assert.equal(bundleHash, e.jsBundleSha256)
  } else {
    assert.equal(binaryHash, e.apkSha256)
    assert.equal(binaryHash, metadata.apkSha256)
  }
  const samples = new Map(),
    comparisons = [],
    actions = []
  const compare = (a, b, subject, equal = true) => {
    const same = a.width === b.width && a.height === b.height && a.bytes.equals(b.bytes)
    assert.equal(same, equal, subject)
    comparisons.push({ subject, equal: same })
  }
  let index = 0,
    captures = 0
  for (const kind of ['static', 'runtime', 'opaque']) {
    actions.push(
      {
        static: 'Use static region',
        runtime: 'Use runtime fallback',
        opaque: 'Use opaque boundary',
      }[kind],
    )
    for (const [phase, changed, tick, action, override = false] of [
      ['initial', false, 0],
      ['ancestor', true, 0, 'Change ancestor'],
      ['label', true, 1, 'Update label'],
      ...(kind === 'opaque'
        ? [
            ['override', true, 1, 'Apply local override', true],
            ['unoverride', true, 1, 'Remove local override'],
          ]
        : []),
      ['restore', false, 0, 'Restore text fixture'],
    ]) {
      if (action) actions.push(action)
      for (const mode of modes) {
        actions.push(`Show ${mode}`)
        const p = r.phases[index++]
        assert.ok(p, 'missing phase')
        assert.deepEqual(
          [p.kind, p.phase, p.mode, p.changed, p.tick, p.override ?? false],
          [kind, phase, mode, changed, tick, override],
        )
        assert.equal(p.passed, true)
        assert.ok(p.captures.length)
        let sample
        for (const [attempt, c] of p.captures.entries()) {
          assert.equal(c.name, `${kind}-${phase}-${mode}-${attempt + 1}`)
          // Review every retained capture, not just a final successful image.
          sample = reviewTextCapture(
            platform,
            p,
            c,
            readFileSync(join(evidenceDir, `${c.name}.png`)),
            readFileSync(
              join(evidenceDir, `${c.name}.${platform === 'ios' ? 'json' : 'xml'}`),
              'utf8',
            ),
          )
          captures++
        }
        assert.deepEqual(signature(sample), p.image)
        const key = `${kind}/${phase}/${mode}`
        samples.set(key, sample)
        const initial = samples.get(`${kind}/initial/${mode}`)
        assert.equal(sample.mount, initial.mount)
        if (mode !== 'ordinary')
          assert.deepEqual(sample.bounds, samples.get(`${kind}/${phase}/ordinary`).bounds)
        if (kind === 'static' || phase === 'restore' || phase === 'override')
          compare(initial, sample, `${key} shield or restore`)
        if (kind !== 'static' && phase === 'ancestor') {
          compare(initial, sample, `${kind}/${mode} visible change`, false)
          assert.ok(sample.height > initial.height)
        }
        if (mode !== 'ordinary')
          compare(
            samples.get(`${kind}/${phase}/ordinary`),
            sample,
            `${kind}/${phase}/ordinary vs ${mode}`,
          )
        if (phase === 'label')
          compare(
            samples.get(`${kind}/ancestor/${mode}`),
            sample,
            `${kind}/${mode} label update keeps pixels`,
          )
        if (phase === 'unoverride')
          compare(
            samples.get(`${kind}/ancestor/${mode}`),
            sample,
            `${kind}/${mode} removed override resumes inheritance`,
          )
      }
    }
  }
  assert.equal(r.phases.length, index)
  assert.equal(samples.size, 56)
  assert.deepEqual(
    r.actions,
    actions.map((label) => ({ label, acknowledged: true })),
  )
  assert.equal(actions.length, 70)
  assert.equal(comparisons.length, 94)
  assert.deepEqual(
    r.comparisons.map(({ subject, equal }) => ({ subject, equal })),
    comparisons,
  )
  return {
    platform,
    run,
    commit,
    states: samples.size,
    captures,
    comparisons: comparisons.length,
    equalities: comparisons.filter((c) => c.equal).length,
    intendedChanges: comparisons.filter((c) => !c.equal).length,
    actions: actions.length,
    binarySha256: binaryHash,
    ...(bundleHash ? { jsBundleSha256: bundleHash } : {}),
    versions: e.installedRuntimeVersions,
    dimensions: Object.fromEntries(
      [...samples]
        .filter(([key]) => key.endsWith('/ordinary'))
        .map(([key, s]) => [key, [s.width, s.height]]),
    ),
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: Object.fromEntries(
      ['platform', 'evidence', 'binary', 'run', 'commit'].map((key) => [key, { type: 'string' }]),
    ),
  })
  for (const key of ['platform', 'evidence', 'binary', 'run', 'commit'])
    assert.ok(values[key], `missing --${key}`)
  const { prepareTextDeviceFixture } = await import(
    '../../../packages/tailwind-conformance/src/text-inheritance-device-source.ts'
  )
  console.log(
    JSON.stringify(
      reviewTextEvidence({
        platform: values.platform,
        evidenceDir: values.evidence,
        binaryDir: values.binary,
        run: values.run,
        commit: values.commit,
        manifest: prepareTextDeviceFixture().manifest,
      }),
      null,
      2,
    ),
  )
}
