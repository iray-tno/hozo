import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import type { ProjectFact } from './analysis.ts'
import type { FontAvailability, FontPlatform } from './font-diagnostics.ts'

export const FONT_ANALYSIS_POLICY = 'static-font-availability-v1'
const platforms = ['web', 'ios', 'android'] as const
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
const printable = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  ![...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)

/** Consume the existing createFontAvailability JSON shape, not executable font registration. */
export function validateFontAvailability(input: unknown): FontAvailability {
  const fail = (): never => {
    throw new TypeError('Invalid font availability; expected createFontAvailability() JSON facts')
  }
  const platformList = (value: unknown): FontPlatform[] => {
    if (
      !Array.isArray(value) ||
      value.some((item) => !platforms.includes(item)) ||
      new Set(value).size !== value.length
    )
      return fail()
    return [...value]
  }
  if (!object(input) || !Array.isArray(input.families)) return fail()
  const ids = new Set<string>()
  const names = new Set<string>()
  return {
    families: input.families.map((family) => {
      if (
        !object(family) ||
        !printable(family.id) ||
        ids.has(family.id) ||
        !object(family.names) ||
        platforms.some(
          (platform) => !printable((family.names as Record<string, unknown>)[platform]),
        ) ||
        !Array.isArray(family.faces)
      )
        return fail()
      ids.add(family.id)
      const familyNames = Object.fromEntries(
        platforms.map((platform) => [
          platform,
          (family.names as Record<string, string>)[platform]!,
        ]),
      ) as Record<FontPlatform, string>
      // The shared diagnostic resolves by platform name. Ambiguous registrations
      // must not silently pick the first family and report a false missing face.
      for (const platform of platforms) {
        const key = JSON.stringify([platform, familyNames[platform]])
        if (names.has(key)) return fail()
        names.add(key)
      }
      const external = platformList(family.external)
      const faces = family.faces.map((face) => {
        if (
          !object(face) ||
          typeof face.weightFrom !== 'number' ||
          typeof face.weightTo !== 'number' ||
          !Number.isInteger(face.weightFrom) ||
          !Number.isInteger(face.weightTo) ||
          face.weightFrom < 1 ||
          face.weightTo > 1000 ||
          face.weightFrom > face.weightTo ||
          !['normal', 'italic', 'oblique'].includes(face.style as string)
        )
          return fail()
        const available = platformList(face.platforms)
        if (!available.length || available.some((platform) => external.includes(platform)))
          return fail()
        return {
          platforms: available,
          weightFrom: face.weightFrom,
          weightTo: face.weightTo,
          style: face.style as 'normal' | 'italic' | 'oblique',
        }
      })
      return { id: family.id, names: familyNames, external, faces }
    }),
  }
}

const inside = (root: string, file: string) => {
  const relative = path.relative(root, file)
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

export class AnalysisFontInputError extends TypeError {}

function loadAnalysisFonts(
  root: string,
  options: { fontAvailabilityFile?: string; fontAvailability?: FontAvailability },
): { fact: ProjectFact<FontAvailability>; inputs: { file: string; sha256: string }[] } {
  if (options.fontAvailabilityFile !== undefined && options.fontAvailability !== undefined)
    throw new TypeError('Choose fontAvailabilityFile or fontAvailability, not both')
  if (options.fontAvailability !== undefined)
    return {
      fact: {
        status: 'resolved',
        origin: 'explicit',
        value: validateFontAvailability(options.fontAvailability),
      },
      inputs: [],
    }
  if (options.fontAvailabilityFile === undefined)
    return {
      fact: {
        status: 'unresolved',
        reason:
          'Static font registration is not supplied; CSS font faces alone do not prove Native availability.',
      },
      inputs: [],
    }
  const selection = options.fontAvailabilityFile
  if (typeof selection !== 'string' || !selection.trim() || !selection.endsWith('.json'))
    throw new TypeError('fontAvailabilityFile must name a static .json file inside the checkout')
  root = path.resolve(root)
  const file = path.resolve(root, selection)
  if (!inside(root, file)) throw new TypeError('Font availability must stay inside the checkout')
  const physicalRoot = realpathSync(root)
  let current = root
  // Check every ancestor before reading through a link, as with static tsconfig.
  for (const part of path.relative(root, file).split(path.sep).filter(Boolean)) {
    current = path.join(current, part)
    if (lstatSync(current).isSymbolicLink() && !inside(physicalRoot, realpathSync(current)))
      throw new TypeError('Font availability links must stay inside the checkout')
  }
  const bytes = readFileSync(file)
  return {
    fact: {
      status: 'resolved',
      origin: 'explicit',
      value: validateFontAvailability(JSON.parse(bytes.toString('utf8'))),
    },
    inputs: [{ file, sha256: createHash('sha256').update(bytes).digest('hex') }],
  }
}

export function readAnalysisFonts(
  root: string,
  options: { fontAvailabilityFile?: string; fontAvailability?: FontAvailability },
) {
  try {
    return loadAnalysisFonts(root, options)
  } catch (error) {
    throw new AnalysisFontInputError(
      `Cannot assess explicit font availability: ${error instanceof Error ? error.message.replace(/\s+/g, ' ') : String(error)}`,
    )
  }
}
