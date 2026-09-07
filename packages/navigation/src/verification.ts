/** The deployment paths mobile platforms request from every associated domain. */
export const DEEP_LINK_VERIFICATION_PATHS = {
  apple: '/.well-known/apple-app-site-association',
  android: '/.well-known/assetlinks.json',
} as const

export interface AppleUniversalLinkComponent {
  /** URL path pattern, for example `/products/*`. Omit to match every path. */
  path?: string
  /** Query pattern or per-parameter patterns. */
  query?: string | Readonly<Record<string, string>>
  /** URL fragment pattern, without the leading `#`. */
  fragment?: string
  /** Prevent matching URLs from opening in the app. Put exclusions first. */
  exclude?: boolean
  /** Human-readable context retained in the association file. */
  comment?: string
  caseSensitive?: boolean
  percentEncoded?: boolean
}

export interface AppleUniversalLinkAssociation {
  /** `<Application Identifier Prefix>.<Bundle Identifier>` values. */
  appIDs: readonly string[]
  /** Ordered URL match rules. Omit to let Apple match every URL on the domain. */
  components?: readonly AppleUniversalLinkComponent[]
}

export interface AppleAppSiteAssociation {
  applinks: {
    details: Array<{
      appIDs: string[]
      components?: Array<{
        '/'?: string
        '?'?: string | Record<string, string>
        '#'?: string
        exclude?: boolean
        comment?: string
        caseSensitive?: boolean
        percentEncoded?: boolean
      }>
    }>
  }
}

export interface AndroidAppLinkAssociation {
  /** Android application ID, for example `com.example.app`. */
  packageName: string
  /** SHA-256 fingerprints from the certificate that signs installed builds. */
  sha256CertFingerprints: readonly string[]
}

export interface AndroidAssetLinkStatement {
  relation: ['delegate_permission/common.handle_all_urls']
  target: {
    namespace: 'android_app'
    package_name: string
    sha256_cert_fingerprints: string[]
  }
}

function requireNonEmpty<T>(values: readonly T[], label: string): readonly T[] {
  if (values.length === 0) throw new TypeError(`${label} must contain at least one value`)
  return values
}

function uniqueStrings(values: readonly string[], label: string): string[] {
  return [
    ...new Set(
      requireNonEmpty(values, label).map((value) => {
        const trimmed = value.trim()
        if (trimmed.length === 0) throw new TypeError(`${label} cannot contain an empty value`)
        return trimmed
      }),
    ),
  ]
}

function validateAppleAppID(appID: string): string {
  if (!/^[A-Za-z0-9]+\.[A-Za-z0-9.-]+$/.test(appID) || appID.endsWith('.')) {
    throw new TypeError(
      `Invalid Apple application identifier ${JSON.stringify(appID)}; expected PREFIX.bundle.identifier`,
    )
  }
  return appID
}

function appleComponent(component: AppleUniversalLinkComponent) {
  const result: NonNullable<
    AppleAppSiteAssociation['applinks']['details'][number]['components']
  >[number] = {}
  if (component.path !== undefined) result['/'] = component.path
  if (typeof component.query === 'string') result['?'] = component.query
  else if (component.query !== undefined) result['?'] = { ...component.query }
  if (component.fragment !== undefined) result['#'] = component.fragment
  if (component.exclude !== undefined) result.exclude = component.exclude
  if (component.comment !== undefined) result.comment = component.comment
  if (component.caseSensitive !== undefined) result.caseSensitive = component.caseSensitive
  if (component.percentEncoded !== undefined) result.percentEncoded = component.percentEncoded
  return result
}

/** Creates the modern `components` form of an Apple App Site Association file. */
export function createAppleAppSiteAssociation(
  associations: readonly AppleUniversalLinkAssociation[],
): AppleAppSiteAssociation {
  return {
    applinks: {
      details: requireNonEmpty(associations, 'Apple associations').map((association) => {
        const appIDs = uniqueStrings(association.appIDs, 'Apple appIDs').map(validateAppleAppID)
        const components = association.components?.map(appleComponent)
        return components === undefined ? { appIDs } : { appIDs, components }
      }),
    },
  }
}

function validatePackageName(packageName: string): string {
  const trimmed = packageName.trim()
  if (!/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/.test(trimmed)) {
    throw new TypeError(
      `Invalid Android package name ${JSON.stringify(packageName)}; expected a dotted application ID`,
    )
  }
  return trimmed
}

function normalizeFingerprint(fingerprint: string): string {
  const compact = fingerprint.trim().replaceAll(':', '')
  if (!/^[a-fA-F0-9]{64}$/.test(compact)) {
    throw new TypeError(
      `Invalid SHA-256 certificate fingerprint ${JSON.stringify(fingerprint)}; expected 32 bytes of hex`,
    )
  }
  return compact.toUpperCase().match(/.{2}/g)!.join(':')
}

/** Creates the Digital Asset Links statements used to verify Android App Links. */
export function createAndroidAssetLinks(
  associations: readonly AndroidAppLinkAssociation[],
): AndroidAssetLinkStatement[] {
  return requireNonEmpty(associations, 'Android associations').map((association) => ({
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: validatePackageName(association.packageName),
      sha256_cert_fingerprints: [
        ...new Set(
          requireNonEmpty(
            association.sha256CertFingerprints,
            'Android certificate fingerprints',
          ).map(normalizeFingerprint),
        ),
      ],
    },
  }))
}

/** Stable, deployable JSON with a trailing newline. */
export function serializeDeepLinkVerification(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}
