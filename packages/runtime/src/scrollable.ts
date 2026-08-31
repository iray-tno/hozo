// Keyboard access for a scroll container, decided where the answer exists.
//
// A `div` with `overflow: auto` scrolls under a pointer and is unreachable
// from a keyboard unless it is focusable itself or holds something that
// is. React Native's `ScrollView` is scrolled by touch and the platform
// handles reaching it, so the gap opens on Web only -- see #99.
//
// Not decided at compile time, because none of it is a compile-time fact.
// axe's rule, which is the one browsers and auditors agree on, is:
//
//   matches   scrollWidth  > clientWidth  + 13
//          or scrollHeight > clientHeight + 13
//             on an axis that actually scrolls
//   any       focusable-content  OR  focusable-element
//
// Overflow depends on CSS, content and viewport; whether a subtree holds
// anything focusable depends on what a runtime expression rendered. A
// compiler emitting `tabIndex={0}` for every `ScrollView` would add a tab
// stop to every list that happens to fit, and one emitting a diagnostic
// would warn about containers that will never overflow. Both teach people
// to ignore them.
//
// So this mirrors the same three conditions at the moment they are true,
// and re-checks when any of them can have changed.

/**
 * The attribute marking a tab stop this file added.
 *
 * Load-bearing in two places: nothing removes a stop it did not add, and
 * nothing reads its own stop as proof that one was already there.
 */
const MARK = 'data-hozo-scroll-stop'

/** What a browser gives focus to without being asked. */
const FOCUSABLE =
  'a[href], button, input, select, textarea, summary, iframe, audio[controls],' +
  ' video[controls], [contenteditable], [tabindex]'

/**
 * Whether the element scrolls *and* has nothing focusable to reach.
 *
 * The 13-pixel allowance is axe's, not a guess: a container can exceed its
 * content box by a rounding error or a scrollbar's own width without being
 * scrollable in any useful sense.
 */
function needsTabStop(element: HTMLElement): boolean {
  const style = getComputedStyle(element)
  const scrollsX =
    element.scrollWidth > element.clientWidth + 13 &&
    (style.overflowX === 'auto' || style.overflowX === 'scroll')
  const scrollsY =
    element.scrollHeight > element.clientHeight + 13 &&
    (style.overflowY === 'auto' || style.overflowY === 'scroll')
  if (!scrollsX && !scrollsY) return false

  // `focusable-element`, but only when the stop is somebody else's. A
  // tab stop this function added is not evidence that one was already
  // needed, and reading it as such made the answer oscillate: the first
  // call added the attribute, the observer's initial callback saw it and
  // took it straight back off. Two calls, decisions `true` then `false`,
  // and nothing left on the element.
  if (element.hasAttribute('tabindex') && !element.hasAttribute(MARK)) return false
  return element.querySelector(FOCUSABLE) === null
}

/**
 * Props for a compiled `ScrollView`, from `{...hozoScrollable()}`.
 *
 * A ref callback rather than state: this sets one attribute on one element
 * and has no business re-rendering the tree to do it. The observers are
 * torn down when React hands back `null`.
 *
 * Not emitted at all when the author wrote their own `tabIndex` -- that
 * precedence is settled by the compiler, which can see the attribute, so
 * there is no branch here to get wrong. An author saying `tabIndex={-1}`
 * means it, and nothing in this file will argue.
 */
export function hozoScrollable() {
  let observer: ResizeObserver | undefined
  let mutations: MutationObserver | undefined

  const apply = (element: HTMLElement) => {
    // `data-hozo-scroll-stop` rather than a bare `tabindex`, so a later
    // read can tell a stop this added from one an author wrote. Without it
    // the removal path could not tell them apart and would take away
    // somebody else's.
    if (needsTabStop(element)) {
      element.setAttribute('tabindex', '0')
      element.setAttribute(MARK, '')
    } else if (element.hasAttribute(MARK)) {
      element.removeAttribute('tabindex')
      element.removeAttribute(MARK)
    }
  }

  return {
    ref: (element: HTMLElement | null) => {
      observer?.disconnect()
      mutations?.disconnect()
      observer = undefined
      mutations = undefined
      if (!element) return

      apply(element)
      // Resize covers the viewport changing and the content growing;
      // mutation covers a child arriving that is focusable, which changes
      // the answer without changing any size.
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(() => apply(element))
        observer.observe(element)
        for (const child of element.children) observer.observe(child)
      }
      if (typeof MutationObserver !== 'undefined') {
        mutations = new MutationObserver(() => apply(element))
        mutations.observe(element, { childList: true, subtree: true })
      }
    },
  }
}
