export type DeepLinkSource = 'initial' | 'event'

export interface DeepLinkEvent {
  /** The untouched URL delivered by the platform. */
  url: string
  /** Application path. Custom-scheme authorities become the first segment. */
  path: string
  queryParams: Readonly<Record<string, string | readonly string[]>>
  fragment?: string
  source: DeepLinkSource
}

/** Normalizes Web URLs, universal links, and `app://path` custom schemes. */
export function parseDeepLink(url: string, source: DeepLinkSource = 'event'): DeepLinkEvent {
  let parsed: URL
  try {
    parsed = new URL(url, 'https://hozo.invalid')
  } catch {
    return { url, path: url, queryParams: Object.create(null), source }
  }

  const customScheme = !['http:', 'https:'].includes(parsed.protocol)
  const authority = customScheme && parsed.hostname ? `/${parsed.hostname}` : ''
  const pathname = parsed.pathname === '/' && authority ? '' : parsed.pathname
  const path = `${authority}${pathname}` || '/'
  const queryParams: Record<string, string | string[]> = Object.create(null)
  for (const [key, value] of parsed.searchParams) {
    const previous = queryParams[key]
    if (previous === undefined) queryParams[key] = value
    else if (typeof previous === 'string') queryParams[key] = [previous, value]
    else previous.push(value)
  }

  return {
    url,
    path,
    queryParams,
    fragment: parsed.hash ? parsed.hash.slice(1) : undefined,
    source,
  }
}

/** Suppresses duplicate platform notifications while preserving later revisits. */
export function createDeepLinkDispatcher(callback: (event: DeepLinkEvent) => void) {
  let previousUrl: string | undefined
  return (url: string, source: DeepLinkSource) => {
    if (url === previousUrl) return
    previousUrl = url
    callback(parseDeepLink(url, source))
  }
}
