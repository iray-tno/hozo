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
