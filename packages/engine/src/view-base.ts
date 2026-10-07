import { createElement } from 'react'
import { HOZO_VIEW_BASE_CSS } from './view-base-css.ts'

// A React 19 stylesheet resource, not an effect or a DOM mutation. React
// hoists and deduplicates it in SSR and on the client, even if every box asks
// for it. Defaults belong in CSS, not inline styles that defeat utilities.
const resource = createElement(
  'style',
  { href: 'hozo-view-base', precedence: 'hozo-base' },
  HOZO_VIEW_BASE_CSS,
)

export function hozoViewBase() {
  return resource
}

export function hozoViewClassName(className?: string) {
  if (!className) return 'hozo-view'
  return className.split(/\s+/).includes('hozo-view') ? className : `hozo-view ${className}`
}
