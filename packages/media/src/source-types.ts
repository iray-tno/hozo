/** Resolve to a player-usable URI, not a claim that the engine can decode it. */
export type MediaSourceResolver<T> = (source: T, signal: AbortSignal) => string | Promise<string>

export interface MediaSourceOptions<T> {
  /** null deselects the source. Objects and resolver functions need stable identity. */
  source: T | null
  resolveSource: MediaSourceResolver<T>
  enabled?: boolean
}

export interface MediaSourceError<T> {
  source: T
  operation: 'resolve'
  message: string
}

export interface MediaSourceResult<T> {
  source: T | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  /** null until the current request succeeds; never the previous source's URI. */
  uri: string | null
  error: MediaSourceError<T> | null
  /** Explicit retry/refresh. No automatic retry, download or cross-source cache. */
  reload(): void
}
