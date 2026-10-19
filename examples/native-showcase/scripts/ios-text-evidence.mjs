// Node-side screen/provenance adapter. The glyph comparator is shared, not
// duplicated for CoreText, and no production component imports this module.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { PNG } from 'pngjs'
import { pixelBounds } from './ios-evidence.mjs'
import { textFrame, textImage } from './text-pixels.mjs'

export function iosTextCapture(buffer, node, marker, screen, mode) {
  assert.ok(screen?.rect, 'AX application screen bounds are required')
  assert.ok(node?.rect && marker?.rect, 'Text and mode marker need measured AX bounds')
  const [left, top, right, bottom] = node.rect
  assert.ok(Math.abs(right - left - 240) < 0.01, 'Text must occupy the complete 240pt owner width')
  assert.ok(bottom > top && bottom - top <= 200, 'Text exceeds the fixture viewport')
  assert.ok(
    Math.abs(marker.rect[2] - marker.rect[0] - 32) < 0.01 &&
      Math.abs(marker.rect[3] - marker.rect[1] - 12) < 0.01,
    'mode marker is clipped',
  )
  const image = PNG.sync.read(buffer)
  const bounds = pixelBounds(node.rect, screen.rect, image)
  const markerBounds = pixelBounds(marker.rect, screen.rect, image)
  return {
    bounds,
    pointBounds: node.rect,
    markerPointBounds: marker.rect,
    screenBounds: screen.rect,
    image: textImage(buffer, bounds),
    frame: textFrame(buffer, markerBounds, mode),
  }
}

export function iosTextProvenance(parent, currentRun, build, archive, bundle) {
  assert.match(currentRun ?? '', /^\d+$/, 'missing current workflow run')
  assert.equal(parent.binaryRun, currentRun, 'text evidence requires a fresh binary from this run')
  assert.match(parent.driverCommit ?? '', /^[a-f0-9]{40}$/, 'missing source commit')
  assert.equal(parent.scenario, 'text-inheritance')
  assert.equal(parent.diagnostic, false, 'diagnostic-mode results are not equivalence evidence')
  assert.ok(!parent.jsBundleCommit, 'rebundled apps are not fresh text evidence')
  assert.equal(build.run, currentRun, 'archive belongs to another run')
  assert.equal(build.commit, parent.driverCommit, 'archive belongs to another source')
  const archiveSha256 = createHash('sha256').update(archive).digest('hex')
  assert.equal(archiveSha256, build.archiveSha256, 'archive changed after fingerprinting')
  assert.ok(bundle.length > 0, 'empty installed app bundle')
  return {
    simulatorArchive: { ...build, verifiedSha256: archiveSha256 },
    jsBundleSha256: createHash('sha256').update(bundle).digest('hex'),
  }
}
