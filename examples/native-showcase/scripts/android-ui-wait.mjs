import { setTimeout as pause } from 'node:timers/promises'

export class AndroidSystemUiUnresponsiveError extends Error {
  constructor(node) {
    super('Android System UI is not responding; the OS alert blocks the showcase')
    this.code = 'ANDROID_SYSTEM_UI_UNRESPONSIVE'
    this.blockingDialog = {
      title: node.text,
      package: node.package,
      resourceId: node['resource-id'],
      rect: node.rect,
    }
  }
}

export async function waitForAndroidControl(
  predicate,
  description,
  { readNodes, timeout = 60_000, now = Date.now, sleep = pause },
) {
  const deadline = now() + timeout
  let lastError
  do {
    try {
      const tree = readNodes()
      // Observed in run 38532959644: an OS ANR dialog, not a missing SVG.
      // Never tap "Wait"/"Close app", relaunch, or accept a control behind it.
      const blocked = tree.find(
        (node) =>
          node.package === 'android' &&
          node['resource-id'] === 'android:id/alertTitle' &&
          node.text === "System UI isn't responding",
      )
      if (blocked) throw new AndroidSystemUiUnresponsiveError(blocked)
      const found = tree.find(predicate)
      if (found) return found
    } catch (error) {
      if (error instanceof AndroidSystemUiUnresponsiveError) throw error
      lastError = error
    }
    await sleep(1_000)
  } while (now() < deadline)
  throw new Error(`Timed out: ${description}`, { cause: lastError })
}
