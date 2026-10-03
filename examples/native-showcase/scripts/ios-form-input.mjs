import assert from 'node:assert/strict'

/** Real HID input, paced by observed field values, never by repeating a key. */
export async function enterIosText(text, { send, waitForValue, observation }) {
  assert.ok(typeof text === 'string' && text.length > 0, 'expected nonempty input text')
  Object.assign(observation, { strategy: 'confirmed-prefixes', requested: text, confirmed: [] })
  let prefix = ''
  for (const character of text) {
    prefix += character
    observation.pendingPrefix = prefix
    await send(character)
    // idb text returns after submitting key events, not after UIKit/React has
    // consumed them. Do not send the next character or Save until AX agrees.
    await waitForValue(prefix)
    observation.confirmed.push(prefix)
    delete observation.pendingPrefix
  }
}
