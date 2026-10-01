import assert from 'node:assert/strict'
import test from 'node:test'
import { centre } from './device-evidence.mjs'
import { parseIosNodes, pixelBounds } from './ios-evidence.mjs'

test('iOS nested AX tree preserves groups, labels, identifiers and screen-point bounds', () => {
  const nodes = parseIosNodes(
    JSON.stringify([
      {
        type: 'Application',
        frame: { x: 0, y: 0, width: 402, height: 874 },
        children: [
          {
            type: 'Group',
            children: [
              {
                AXLabel: 'Save profile',
                AXUniqueId: 'save',
                enabled: false,
                frame: { x: 16.5, y: 24, width: 40, height: 44 },
              },
            ],
          },
        ],
      },
    ]),
  )
  assert.equal(nodes.length, 2)
  assert.equal(nodes[1].AXLabel, 'Save profile')
  assert.equal(nodes[1].AXUniqueId, 'save')
  assert.equal(nodes[1].enabled, false)
  assert.deepEqual(centre(nodes[1]), [36, 46])
  const [legacy] = parseIosNodes('[{"AXFrame":"{{2, 4}, {20, 40}}"}]')
  assert.deepEqual(legacy.rect, [2, 4, 22, 44])
  assert.throws(() => parseIosNodes('null'))
  assert.throws(() => parseIosNodes('ERROR: accessibility unavailable'))
})

test('Retina Canvas crop uses measured full-screen bounds, never control coordinates as pixels', () => {
  assert.deepEqual(
    pixelBounds([16.5, 90, 380, 440], [0, 0, 402, 874], {
      width: 1206,
      height: 2622,
    }),
    [50, 270, 1140, 1320],
  )
  assert.deepEqual(
    pixelBounds([10, 20, 30, 40], [0, 0, 400, 800], {
      width: 800,
      height: 1600,
    }),
    [20, 40, 60, 80],
  )
  assert.throws(() =>
    pixelBounds([10, 20, 30, 40], [0, 0, 400, 700], {
      width: 800,
      height: 1600,
    }),
  )
  assert.throws(() =>
    pixelBounds([10, 20, 410, 40], [0, 0, 400, 800], {
      width: 800,
      height: 1600,
    }),
  )
})
