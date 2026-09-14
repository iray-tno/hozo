/**
 * Project-wide Native defaults when no bundler integration supplies them.
 *
 * `@hozo/metro` redirects this entry to the generated candidate module,
 * whose value is the resolved `preflight` option. Keeping a real entry here
 * makes unconfigured builds and component tests deterministic; Tailwind's
 * reset is the common case and was the fallback before this entry existed.
 */
export const hozoPreflight = true
