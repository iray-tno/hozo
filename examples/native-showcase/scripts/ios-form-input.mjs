import assert from 'node:assert/strict'

/**
 * Real HID input, paced by observed field values, never by repeating a key.
 *
 * Each key's send is timed, and when a value never appears `inspect` says
 * what was on screen instead (#1279): a character-alternative popup over
 * the field is the harness's key timing, not the app losing input, and the
 * two must not read as the same timeout. Nothing here retries, waits longer
 * or accepts a value it did not observe.
 */
export async function enterIosText(
  text,
  { send, waitForValue, observation, inspect, now = Date.now },
) {
  assert.ok(typeof text === 'string' && text.length > 0, 'expected nonempty input text')
  Object.assign(observation, {
    strategy: 'confirmed-prefixes',
    requested: text,
    confirmed: [],
    sends: [],
  })
  let prefix = ''
  for (const character of text) {
    prefix += character
    observation.pendingPrefix = prefix
    const startedAt = now()
    await send(character)
    observation.sends.push({ character, startedAt, sendMs: now() - startedAt })
    // idb text returns after submitting key events, not after UIKit/React has
    // consumed them. Do not send the next character or Save until AX agrees.
    try {
      await waitForValue(prefix)
    } catch (error) {
      if (inspect) {
        try {
          observation.obstruction = inspect()
        } catch (inspectError) {
          observation.obstruction = { kind: 'uninspectable', reason: String(inspectError) }
        }
      }
      throw error
    }
    observation.confirmed.push(prefix)
    delete observation.pendingPrefix
  }
}

/**
 * What covered the field, read off the AX tree a failed wait last saw.
 *
 * iOS shows a character-alternative popup (Ħ for H) when a key is held; it
 * owns the screen and hides the TextField from AX. Its dismiss region is the
 * marker, and its keys' labels are the candidates.
 */
export function inputObstruction(nodes, isField) {
  const popup = nodes.find((node) => node.AXUniqueId === 'PopoverDismissRegion')
  if (popup) {
    return {
      kind: 'os-character-popup',
      candidates: nodes
        .filter((node) => node !== popup && typeof node.AXLabel === 'string')
        .map((node) => node.AXLabel)
        .filter((label) => [...label].length === 1),
      fieldVisible: nodes.some(isField),
    }
  }
  const field = nodes.find(isField)
  return field
    ? { kind: 'field-visible', value: field.AXValue ?? null }
    : { kind: 'field-not-visible' }
}
