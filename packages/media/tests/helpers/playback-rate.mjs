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
    const result = await page.evaluate(async (selector) => {
      const media = document.querySelector(selector)
      const time = media.currentTime
      const wall = performance.now()
      await new Promise((resolve) => setTimeout(resolve, 900))
      const elapsed = (performance.now() - wall) / 1000
      const advanced = media.currentTime - time
      window.ref.current.pause()
      return { elapsed, advanced, ratio: advanced / elapsed, ended: media.ended }
    }, selector)
    assert.equal(result.ended, false, 'measure clock advancement, not a clip clamped at its end')
    assert.ok(Math.abs(result.ratio - playbackRate) < playbackRate * 0.25, JSON.stringify(result))
    results.push({ playbackRate, preservesPitch, ...result })
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
