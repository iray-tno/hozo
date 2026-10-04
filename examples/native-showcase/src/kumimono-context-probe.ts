/** Explicit diagnostic only. Expo implements these queries as blocking native
 * calls, so run once before the first frame, never in the render observer. */
export function inspectKumimonoContext(
  gl: Pick<
    WebGLRenderingContext,
    'getParameter' | 'RENDERER' | 'VENDOR' | 'VERSION' | 'SHADING_LANGUAGE_VERSION'
  >,
  report: (event: Record<string, unknown>) => void,
  now = () => performance.now(),
) {
  const started = now()
  const parameters: Record<string, string | null> = {}
  const errors: Record<string, string> = {}
  for (const name of ['RENDERER', 'VENDOR', 'VERSION', 'SHADING_LANGUAGE_VERSION'] as const) {
    try {
      const value: unknown = gl.getParameter(gl[name])
      parameters[name] = typeof value === 'string' ? value : null
      if (typeof value !== 'string') errors[name] = 'GL did not return a string'
    } catch (error) {
      parameters[name] = null
      errors[name] = String(error)
    }
  }
  report({
    phase: 'context-identity',
    diagnostic: true,
    parameters,
    errors,
    queryMs: now() - started,
    timingPerturbed: true,
  })
}
