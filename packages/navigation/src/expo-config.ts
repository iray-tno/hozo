export interface HozoExpoLinkDomain {
  /** Fully qualified host, without a scheme, port, path, or trailing slash. */
  host: string
  /** Optional Android path prefixes. iOS path policy remains in the AASA file. */
  pathPrefixes?: readonly string[]
}

export interface HozoExpoLinksOptions {
  /** Custom URL scheme in addition to verified HTTPS links. */
  scheme?: string
  /** Hosts shared by the app and website. */
  domains?: readonly (string | HozoExpoLinkDomain)[]
}

export interface ExpoIntentFilterLike {
  action: 'VIEW'
  autoVerify: true
  data: Array<{ scheme: 'https'; host: string; pathPrefix?: string }>
  category: ['BROWSABLE', 'DEFAULT']
}

export interface ExpoConfigLike {
  scheme?: string | string[]
  ios?: { associatedDomains?: string[]; [key: string]: unknown }
  android?: { intentFilters?: unknown[]; [key: string]: unknown }
  [key: string]: unknown
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)]
}

function normalizedHost(value: string): string {
  const host = value.trim().toLowerCase()
  if (
    !/^(?:\*\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(
      host,
    )
  ) {
    throw new TypeError(
      `Invalid associated host ${JSON.stringify(value)}; omit the scheme, port, path, and trailing slash`,
    )
  }
  return host
}

function normalizedDomain(value: string | HozoExpoLinkDomain): HozoExpoLinkDomain {
  const domain = typeof value === 'string' ? { host: value } : value
  const pathPrefixes = domain.pathPrefixes?.map((prefix) => {
    if (!prefix.startsWith('/')) {
      throw new TypeError(`Android path prefix ${JSON.stringify(prefix)} must start with /`)
    }
    return prefix
  })
  return { host: normalizedHost(domain.host), pathPrefixes: pathPrefixes && unique(pathPrefixes) }
}

function addScheme(current: string | string[] | undefined, scheme: string): string | string[] {
  const values = unique([...(typeof current === 'string' ? [current] : (current ?? [])), scheme])
  return values.length === 1 ? values[0]! : values
}

function androidFilters(domains: readonly HozoExpoLinkDomain[]): ExpoIntentFilterLike[] {
  return domains.flatMap(({ host, pathPrefixes }) => {
    const prefixes = pathPrefixes?.length ? pathPrefixes : [undefined]
    return prefixes.map((pathPrefix) => ({
      action: 'VIEW',
      autoVerify: true,
      data: [{ scheme: 'https', host, ...(pathPrefix === undefined ? {} : { pathPrefix }) }],
      category: ['BROWSABLE', 'DEFAULT'],
    }))
  })
}

function appendUnique<T>(current: readonly T[] | undefined, added: readonly T[]): T[] {
  const seen = new Set((current ?? []).map((value) => JSON.stringify(value)))
  return [
    ...(current ?? []),
    ...added.filter((value) => {
      const key = JSON.stringify(value)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }),
  ]
}

/**
 * Expo config plugin for custom schemes, iOS Universal Links, and Android App Links.
 * It only uses public app-config fields, so no native mod or Expo runtime dependency is required.
 */
export default function withHozoLinks<T extends ExpoConfigLike>(
  config: T,
  options: HozoExpoLinksOptions = {},
): T & ExpoConfigLike {
  const scheme = options.scheme?.trim()
  if (scheme !== undefined && !/^[a-z][a-z0-9+.-]*$/i.test(scheme)) {
    throw new TypeError(`Invalid URL scheme ${JSON.stringify(options.scheme)}`)
  }
  const domains = unique(
    (options.domains ?? []).map((domain) => JSON.stringify(normalizedDomain(domain))),
  ).map((domain) => JSON.parse(domain) as HozoExpoLinkDomain)
  if (scheme === undefined && domains.length === 0) {
    throw new TypeError('withHozoLinks requires a scheme or at least one associated domain')
  }

  return {
    ...config,
    ...(scheme === undefined ? {} : { scheme: addScheme(config.scheme, scheme) }),
    ...(domains.length === 0
      ? {}
      : {
          ios: {
            ...config.ios,
            associatedDomains: unique([
              ...(config.ios?.associatedDomains ?? []),
              ...domains.map(({ host }) => `applinks:${host}`),
            ]),
          },
          android: {
            ...config.android,
            intentFilters: appendUnique(config.android?.intentFilters, androidFilters(domains)),
          },
        }),
  } as T & ExpoConfigLike
}
