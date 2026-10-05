import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { PNG } from 'pngjs'
import { pixelBounds } from './ios-evidence.mjs'
import { svgImage } from './svg-filter-evidence.mjs'

export function readIosScenario(value = 'full') {
  assert.ok(
    ['full', 'canvas', 'gl-control', 'svg-filters'].includes(value),
    'unsupported iOS scenario',
  )
  return value
}

// AX coordinates are points, not screenshot pixels. Keep both coordinate
// systems as evidence; only the complete measured 96pt host may be sampled.
export function iosSvgRegion(buffer, node, screen) {
  assert.ok(screen, 'AX tree must expose the application screen bounds')
  assert.ok(node?.rect, 'SVG image must expose AX bounds')
  const [left, top, right, bottom] = node.rect
  assert.ok(Math.abs(right - left - 96) <= 0.01, 'SVG host must be 96 screen points wide')
  assert.ok(Math.abs(bottom - top - 96) <= 0.01, 'SVG host must be 96 screen points high')
  const bounds = pixelBounds(node.rect, screen.rect, PNG.sync.read(buffer))
  return { image: svgImage(buffer, bounds), pixelBounds: bounds, screenBounds: screen.rect }
}

export function iosSvgEvidence(parent, source, peerVersion) {
  // Do not inherit the full scenario's checks or passed flag. A separate
  // artifact certifies these five pixel checks, not Canvas or accessibility.
  return {
    platform: 'iOS',
    device: 'simulator',
    scenario: 'svg-filters',
    parentScenario: parent.scenario,
    axBackend: parent.axBackend,
    diagnostic: parent.diagnostic,
    binaryRun: parent.binaryRun,
    driverCommit: parent.driverCommit,
    jsBundleCommit: parent.jsBundleCommit,
    simulator: parent.simulator,
    sceneSourceSha256: createHash('sha256').update(source).digest('hex'),
    svgPeerVersion: peerVersion,
    checks: [],
    passed: false,
  }
}
