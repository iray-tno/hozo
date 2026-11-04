// Contrast is measured after finite entrance transitions finish, not halfway
// through a fade. Chrome's dump-dom virtual timers can outrun its compositor:
// the old 500ms wait reported different blended colours in the same build.
// Nothing is disabled or restyled here. A paused/stuck entrance fails, and a
// persistent contrast defect is still handed to axe at its actual final colour.
import { captureAuditState } from '../../../scripts/browser-audit-diagnostics.mjs'

export async function waitForSettledStory(timeout = 10000) {
  // A separate object per invocation prevents a late, failed waiter from
  // changing the phase recorded for a later audit in the same document.
  const preparation = { phase: 'root', failurePhase: null, failedAt: null }
  window.__hozoAuditPreparation = preparation
  const frames = () =>
    new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  let timer
  try {
    await Promise.race([
      (async () => {
        while (!document.getElementById('storybook-root')?.childElementCount) {
          // The error template is always in iframe.html, hidden until this
          // body state selects it. Its mere existence is not a failed story.
          if (document.body.classList.contains('sb-show-errordisplay'))
            throw new Error('Storybook failed to render')
          await frames()
        }
        preparation.phase = 'fonts'
        await document.fonts.ready
        while (true) {
          preparation.phase = 'frames'
          await frames()
          const finite = document.getAnimations().filter((animation) => {
            const end = animation.effect?.getComputedTiming().endTime
            return (
              Number.isFinite(end) &&
              (animation.pending ||
                animation.playState === 'running' ||
                animation.playState === 'paused')
            )
          })
          if (finite.length === 0) {
            preparation.phase = 'settled'
            return
          }
          // Cancelled transitions may be replaced by a new one; inspect again.
          preparation.phase = 'animations'
          await Promise.all(finite.map((animation) => animation.finished.catch(() => {})))
        }
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          preparation.failurePhase = preparation.phase
          preparation.failedAt = performance.now()
          reject(new Error('story did not settle before the accessibility audit'))
        }, timeout)
      }),
    ])
  } catch (error) {
    if (preparation.failedAt === null) {
      preparation.failurePhase = preparation.phase
      preparation.failedAt = performance.now()
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export async function auditPage(page, axeSource, timeout = 10000, onStage = () => {}) {
  onStage('preparation')
  try {
    await page.evaluate(waitForSettledStory, timeout)
  } catch (error) {
    error.diagnostics = { browser: await captureAuditState(page) }
    throw error
  }
  // Storybook's a11y addon owns a separate axe instance. Retain ours before an
  // addon render can replace window.axe and race this explicitly awaited audit.
  onStage('axe')
  await page.addScriptTag({ content: `${axeSource}\nwindow.__hozoAuditAxe = window.axe;` })
  return page.evaluate(async () => {
    const result = await window.__hozoAuditAxe.run(document.getElementById('storybook-root'), {
      resultTypes: ['violations'],
    })
    return {
      dark: matchMedia('(prefers-color-scheme: dark)').matches,
      found: result.violations.flatMap((violation) =>
        violation.nodes.map((node) => ({
          impact: violation.impact,
          rule: violation.id,
          target: node.target.join(' '),
          help: violation.help,
          details: node.failureSummary,
        })),
      ),
    }
  })
}
