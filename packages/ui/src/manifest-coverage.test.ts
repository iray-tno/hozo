/**
 * Which components the manifest covers, written down (#974).
 *
 * `hozo.manifest.json` is regenerated from the source, so `manifests:check`
 * only proves it is current, not that it still says anything. A refactor that
 * moved Button's class lists into a shape the extractor does not read would
 * regenerate a manifest without Button, pass that check, and quietly send its
 * callers back to the fallback. This list is what makes that a failure.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

const manifest = JSON.parse(
  readFileSync(path.join(import.meta.dirname, '..', 'hozo.manifest.json'), 'utf8'),
) as { textForwarding: Record<string, unknown> }

test('the manifest covers every component that hands text to a caller’s children', () => {
  // Each component under every name it is published as. Badge is not here on
  // purpose: on Native it is a Text, and a Text nested in it inherits anyway.
  // The patterns that take a label as a prop rather than as children --
  // Tabs, Accordion, SegmentedControl, Radio and the rest -- draw that label
  // themselves, so there is no caller Text to hand anything to.
  assert.deepEqual(Object.keys(manifest.textForwarding).sort(), [
    'Alert',
    'Button',
    'Checkbox',
    'HozoAlert',
    'HozoButton',
    'HozoCheckbox',
    'HozoSwitch',
    'Switch',
  ])
})
