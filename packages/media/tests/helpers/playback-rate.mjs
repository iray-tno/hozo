import assert from 'node:assert/strict'

/** Compare decoded media time with wall time, not a requested-rate status mirror. */
export async function exercisePlaybackRate(page, selector) {
  const results = []
  for (const [playbackRate, preservesPitch] of [
    [0.5, false],
    [2, true],
  ]) {
    await page.evaluate(
      ({ playbackRate, preservesPitch }) => {
        window.configure({ playbackRate, preservesPitch, muted: true })
      },
      { playbackRate, preservesPitch },
    )
    await page.waitForFunction(
      ({ selector, playbackRate, preservesPitch }) => {
        const media = document.querySelector(selector)
        return media.playbackRate === playbackRate && media.preservesPitch === preservesPitch
      },
      { selector, playbackRate, preservesPitch },
    )
    assert.equal(
      await page.evaluate((selector) => document.querySelector(selector).paused, selector),
      true,
    )
    await page.evaluate(async () => {
      await window.ref.current.seekTo(0)
      await window.ref.current.play()
    })
    await page.waitForFunction(
      (selector) => document.querySelector(selector).currentTime > 0.1,
      selector,
    )
    // Read every 100ms, and judge the rate only over intervals in which this
    // page itself ran on time (#2121). On one CPU the renderer's main thread
    // was blocked for 676ms and 916ms around the first play(); the decoded
    // clock barely moved then, and moved at exactly the requested rate in
    // every on-time interval. Endpoints alone could not tell that from a
    // wrong rate. An on-time interval still counts when the clock is flat,
    // so a real stop while the page runs still fails, and a page that never
    // gets enough on-time intervals fails too; nothing is retried.
    const result = await page.evaluate(async (selector) => {
      const ON_TIME_MS = 150 // a 100ms timer that fired within 50ms of due
      const NEEDED_MS = 500 // on-time wall time the ratio is judged over
      const CAP_MS = 1500 // at 2x from 0.1s, under the 4s clip's end
      const media = document.querySelector(selector)
      const events = []
      const wall = performance.now()
      const at = () => performance.now() - wall
      const names = ['waiting', 'stalled', 'pause', 'playing', 'seeking', 'seeked', 'ratechange']
      const record = (event) => events.push({ at: Math.round(at()), type: event.type })
      for (const name of names) media.addEventListener(name, record)
      const sample = () => ({
        at: at(),
        time: media.currentTime,
        readyState: media.readyState,
        paused: media.paused,
      })
      const time = media.currentTime
      const samples = [sample()]
      let onTimeMs = 0
      let onTimeAdvanced = 0
      while ((at() < 900 || onTimeMs < NEEDED_MS) && at() < CAP_MS) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        const previous = samples.at(-1)
        const next = sample()
        samples.push(next)
        const interval = next.at - previous.at
        if (interval <= ON_TIME_MS) {
          onTimeMs += interval
          onTimeAdvanced += next.time - previous.time
        }
      }
      const elapsed = (performance.now() - wall) / 1000
      const advanced = media.currentTime - time
      for (const name of names) media.removeEventListener(name, record)
      window.ref.current.pause()
      // The longest wall-clock run over which the decoded clock did not move.
      let flatMs = 0
      let flatSince = samples[0].at
      for (let index = 1; index < samples.length; index++) {
        if (samples[index].time > samples[index - 1].time) flatSince = samples[index].at
        flatMs = Math.max(flatMs, samples[index].at - flatSince)
      }
      return {
        // Judged: decoded seconds per wall second over on-time intervals.
        ratio: onTimeAdvanced / (onTimeMs / 1000),
        onTimeMs: Math.round(onTimeMs),
        neededMs: NEEDED_MS,
        // Reported: the whole window, as measured before #2121.
        elapsed,
        advanced,
        wholeRatio: advanced / elapsed,
        ended: media.ended,
        longestFlatMs: Math.round(flatMs),
        samples: samples.map((entry) => ({
          ...entry,
          at: Math.round(entry.at),
          time: Number(entry.time.toFixed(4)),
        })),
        events,
      }
    }, selector)
    const evidence = JSON.stringify({ requested: playbackRate, preservesPitch, ...result })
    assert.equal(
      result.ended,
      false,
      `measure clock advancement, not a clip clamped at its end: ${evidence}`,
    )
    assert.ok(
      result.onTimeMs >= result.neededMs,
      `the page was starved: too little on-time wall time to judge the rate: ${evidence}`,
    )
    assert.ok(Math.abs(result.ratio - playbackRate) < playbackRate * 0.25, evidence)
    const { samples: _samples, events: _events, ...summary } = result
    results.push({ playbackRate, preservesPitch, ...summary })
  }
  await page.evaluate(() => window.configure({ muted: true }))
  await page.waitForFunction((selector) => {
    const media = document.querySelector(selector)
    return media.playbackRate === 1 && media.preservesPitch === true && media.paused
  }, selector)
  await page.evaluate(() => window.ref.current.seekTo(0))
  await page.waitForFunction(() => window.ref.current.getStatus().currentTime < 0.1)
  console.log(
    `[media rate] ${selector} decoded clock / wall clock: ${JSON.stringify(results)}; not audible pitch or Native evidence`,
  )
}
