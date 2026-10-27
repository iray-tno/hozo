import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { DocsCode, type DocsCodeData } from '../components/docs/DocsCode.ts'

export function renderDocsCode(data: DocsCodeData, prefix: string) {
  return renderToString(createElement(DocsCode, { data }), { identifierPrefix: prefix })
}

const serials = new WeakMap<object, number>()
/** Locals are per request; the namespace is separate from parsed fence roots. */
export function docsExamplePrefix(locals: object) {
  const serial = (serials.get(locals) ?? 0) + 1
  serials.set(locals, serial)
  return `docs-example-${serial}-`
}
