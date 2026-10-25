import assert from 'node:assert/strict'

export async function compilerListingText(page, title) {
  const figure = page.getByRole('figure', { name: title, exact: true })
  return (await figure.locator('pre code > span').allTextContents()).join('\n')
}

export async function checkCompilerListing(page, title, expectedOverflow) {
  const region = page.getByRole('region', { name: `${title} code`, exact: true })
  await region.scrollIntoViewIfNeeded()
  const geometry = await region.evaluate((node) => ({
    height: node.getBoundingClientRect().height,
    overflow: node.scrollHeight > node.clientHeight + 13,
  }))
  assert.ok(geometry.height <= 384, `${title}: bounded listing grew past 24rem`)
  if (expectedOverflow !== undefined) assert.equal(geometry.overflow, expectedOverflow)
  await page.waitForFunction(
    ({ node, overflow }) =>
      overflow ? node.getAttribute('tabindex') === '0' : !node.hasAttribute('tabindex'),
    { node: await region.elementHandle(), overflow: geometry.overflow },
  )
  assert.equal(await region.getByRole('figure', { name: title, exact: true }).count(), 1)
  assert.equal(await region.locator('button, [role="region"]').count(), 0)
  assert.equal(
    await region.locator('pre').evaluate((pre) => getComputedStyle(pre).whiteSpace),
    'pre-wrap',
  )
  if (geometry.overflow) {
    await region.focus()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Shift+Tab')
    assert.equal(await region.evaluate((node) => node === document.activeElement), true)
    await region.evaluate((node) => {
      node.scrollTop = 0
    })
    await page.keyboard.press('PageDown')
    await page.waitForFunction((node) => node.scrollTop > 0, await region.elementHandle())
    assert.equal(await region.evaluate((node) => getComputedStyle(node).outlineStyle), 'solid')
    assert.equal(await region.evaluate((node) => getComputedStyle(node).outlineWidth), '2px')
  }
  return geometry.overflow
}
