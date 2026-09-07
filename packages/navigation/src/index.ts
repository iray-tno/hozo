export type { HozoNavigationAdapter, HozoNavigationRequest } from '@hozo/runtime/navigation'
export {
  createNavigationAdapter,
  isLocalHref,
  type NavigationAdapterOptions,
  type NavigationPrefetch,
  type NavigationResult,
} from './adapter.ts'
export { NavigationProvider, type NavigationProviderProps } from './provider.tsx'
