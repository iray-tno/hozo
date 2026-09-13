export type PlatformSelectSpec<Value> = {
  web?: Value
  default?: Value
  [platform: string]: Value | undefined
}

/** React Native Web's platform facts without importing its compatibility layer. */
export const Platform = Object.freeze({
  OS: 'web' as const,

  select<Value>(specifics: PlatformSelectSpec<Value>): Value | undefined {
    return 'web' in specifics ? specifics.web : specifics.default
  },

  get isTesting(): boolean {
    return process.env.NODE_ENV === 'test'
  },

  get Version(): string {
    return '0.0.0'
  },
})
