export type { HozoNavigationAdapter, HozoNavigationRequest } from '@hozo/runtime/navigation'
export {
  createNavigationAdapter,
  isLocalHref,
  type NavigationAdapterOptions,
  type NavigationPrefetch,
  type NavigationResult,
} from './adapter.ts'
export {
  type DeepLinkEvent,
  type DeepLinkSource,
  parseDeepLink,
  type UseDeepLinkOptions,
  useDeepLink,
} from './deep-link.native.ts'
export { NavigationProvider, type NavigationProviderProps } from './provider.native.tsx'
export {
  type AndroidAppLinkAssociation,
  type AndroidAssetLinkStatement,
  type AppleAppSiteAssociation,
  type AppleUniversalLinkAssociation,
  type AppleUniversalLinkComponent,
  createAndroidAssetLinks,
  createAppleAppSiteAssociation,
  DEEP_LINK_VERIFICATION_PATHS,
  serializeDeepLinkVerification,
} from './verification.ts'
