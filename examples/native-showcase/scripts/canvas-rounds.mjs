/** Additional mounts are stress coverage, never retries of a failed assertion. */
export function readCanvasRounds(value) {
  if (value === undefined || value === '') return 1
  if (!/^(?:[1-9]|10)$/.test(value))
    throw new Error('HOZO_ANDROID_CANVAS_ROUNDS must be an integer from 1 to 10')
  return Number(value)
}
