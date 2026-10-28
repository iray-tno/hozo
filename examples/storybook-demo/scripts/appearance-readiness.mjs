export async function withAppearanceStory(container, id, audit, options) {
  // A ready DOM can still have Storybook completion work pending. A new
  // browsing context prevents its late navigation from replacing the next story.
  const frame = container.ownerDocument.createElement('iframe')
  frame.style.cssText = 'width:1200px;height:900px;border:0'
  frame.src = `/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`
  container.append(frame)
  try {
    const doc = await waitForAppearanceStory(frame, id, options)
    return await audit(doc, frame.contentWindow)
  } finally {
    frame.remove()
  }
}

// Reading CSS before the requested story renders can report an empty sheet
// from a loading frame. This waits for resources, never for a passing audit.
export async function waitForAppearanceStory(
  frame,
  id,
  {
    timeout = 5000,
    now = () => performance.now(),
    wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = {},
) {
  const deadline = now() + timeout
  while (now() < deadline) {
    const doc = frame.contentDocument
    if (doc && new URL(doc.URL).searchParams.get('id') === id) {
      if (doc.body?.classList.contains('sb-show-errordisplay'))
        throw new Error(`Storybook failed to render ${id}`)
      const links = [...doc.querySelectorAll('link[rel~="stylesheet"]')]
      if (
        doc.readyState === 'complete' &&
        doc.body?.classList.contains('sb-show-main') &&
        doc.getElementById('storybook-root')?.childElementCount > 0 &&
        doc.fonts?.status !== 'loading' &&
        links.every((link) => link.disabled || link.sheet !== null)
      )
        return doc
    }
    await wait(25)
  }
  const doc = frame.contentDocument
  const state = doc && {
    url: doc.URL,
    readyState: doc.readyState,
    main: doc.body?.classList.contains('sb-show-main'),
    children: doc.getElementById('storybook-root')?.childElementCount,
    fonts: doc.fonts?.status,
    pendingStylesheets: [...doc.querySelectorAll('link[rel~="stylesheet"]')].filter(
      (link) => !link.disabled && link.sheet === null,
    ).length,
    renderPhase: frame.contentWindow?.__STORYBOOK_PREVIEW__?.currentRender?.phase,
    renderedStory: frame.contentWindow?.__STORYBOOK_PREVIEW__?.currentRender?.story?.id,
    visibility: doc.visibilityState,
  }
  throw new Error(
    `Story ${id} did not finish rendering and loading stylesheets before the appearance audit: ${JSON.stringify(state)}`,
  )
}
