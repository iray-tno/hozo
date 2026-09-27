// Stepping a virtual screen reader across one story, and knowing when it is
// done.
//
// Its own module rather than a few lines inside `check-utterances.mjs`'s
// browser script, for one reason: that script only runs inside a headed
// browser against a built Storybook, so the rule below could only ever be
// tried by a five-minute CI job. Here it is a pure function over a reader
// interface, and `utterance-walk.test.mjs` exercises it against a fake one
// with nothing but Node's own test runner.
//
// ## Knowing when a story has ended
//
// There is no closing "end of document": the reader is started on a container,
// and walking off the last item wraps round to the first. So the end has to be
// recognised rather than announced, and the first version recognised the wrong
// thing -- it stopped when the cursor came back to the node it started on,
// saying the phrase it started with.
//
// That is true of an ordinary story and false of one with an open
// `aria-modal="true"` dialog in it. The traversal is confined to the dialog and
// never reaches the starting node again, so the walk ran until it hit
// `MAX_STEPS` and the story was reported as never finishing. Size was not the
// problem: a 325-phrase showcase finished inside 400 steps while a 170-phrase
// dialog story did not finish at all.
//
// ## Why the key is a node *and* a phrase
//
// The cycle can close anywhere, so what is detected is a repeat rather than a
// return to the start. Neither half of the key is enough on its own:
//
//   - **Phrases alone** are ambiguous. Two different elements can say exactly
//     the same thing -- two "▲" glyphs, two cells reading "13" in different
//     months -- and stopping at the second would truncate the story.
//   - **Nodes alone** are worse, because the reader visits a container twice on
//     purpose. A grid is announced on the way in and again on the way out:
//     `grid, September 2026` then, later, `end of grid, September 2026`, both
//     of them the same DOM node. Stopping at the second visit would cut every
//     story with a container in it, which is all of them.
//
// A node paired with what was said about it is unambiguous both ways. The same
// node saying the same thing twice is the reader going round again; anything
// else is the reader still going.
//
// ## What this does not claim
//
// A repeat proves the walk has returned somewhere it has been, not that it
// visited everything reachable. A traversal that cycles through part of a
// container and never enters the rest would end here and look complete. That
// is a property of the reader's own cursor, which this does not model, and
// `MAX_STEPS` remains as the guard for the other direction: an exhausted
// budget is reported as unfinished and never as a shorter reading order.

/** The separator for a step that said several things at once. */
const JOIN = '\u0000'

/**
 * Steps `reader` until the reading order repeats, and returns it.
 *
 * `finished` is the distinction the caller has to keep: `false` means the
 * budget ran out with the walk still producing new phrases, which is a finding
 * rather than a shorter story. The log is whatever was collected either way and
 * is never silently trimmed to look complete.
 *
 * @param {{
 *   activeNode: unknown,
 *   next: () => Promise<unknown>,
 *   spokenPhraseLog: () => Promise<string[]>,
 * }} reader
 * @param {number} maxSteps
 * @returns {Promise<{ log: string[], finished: boolean }>}
 */
export async function walk(reader, maxSteps) {
  /** @type {Map<unknown, Set<string>>} */
  const seen = new Map()
  const remember = (node, key) => {
    const keys = seen.get(node)
    if (keys === undefined) seen.set(node, new Set([key]))
    else keys.add(key)
  }
  const known = (node, key) => seen.get(node)?.has(key) === true

  // The state the walk starts in counts as a visit. Without it a wrap back to
  // the very first item is only noticed one step late, which would put the
  // opening phrase into the reading order twice.
  const opening = await reader.spokenPhraseLog()
  remember(reader.activeNode, opening.join(JOIN))

  for (let steps = 0; steps < maxSteps; steps += 1) {
    const before = (await reader.spokenPhraseLog()).length
    await reader.next()
    const log = await reader.spokenPhraseLog()

    // A step that said nothing new has nowhere left to go. Kept from the
    // first version: a reader that stops speaking has finished, whatever its
    // cursor thinks.
    if (log.length === before) return { finished: true, log }

    const key = log.slice(before).join(JOIN)
    if (known(reader.activeNode, key)) {
      // The repeat is not part of the reading order.
      return { finished: true, log: log.slice(0, before) }
    }
    remember(reader.activeNode, key)
  }

  return { finished: false, log: await reader.spokenPhraseLog() }
}
