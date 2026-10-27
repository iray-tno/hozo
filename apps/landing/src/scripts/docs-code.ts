import { createElement } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { DocsCode, type DocsCodeData } from '../components/docs/DocsCode.ts'

const mounted = new WeakSet<HTMLElement>()
export function hydrateDocsCode() {
  for (const host of document.querySelectorAll<HTMLElement>('[data-hozo-docs-code]')) {
    if (mounted.has(host)) continue
    mounted.add(host)
    const data: DocsCodeData = JSON.parse(host.dataset.hozoDocsCode!)
    hydrateRoot(host, createElement(DocsCode, { data }), {
      identifierPrefix: host.dataset.codePrefix,
      onRecoverableError: (error) =>
        console.error(`Docs listing "${data.title}" could not hydrate`, error),
    })
  }
}
