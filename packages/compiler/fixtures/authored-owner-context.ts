import { openCandidateCache, prepareAuthoredTailwindContext } from '../src/index.ts'

/** Exercises projection with explicitly authored order rather than relying
 * on an unrelated unassessed class to disable a ranked owner tier. */
export function authoredOwnerContext(source: string) {
  const cache = openCandidateCache()
  cache.scanFile('authored-owner.tsx', source, 1)
  return prepareAuthoredTailwindContext(
    JSON.stringify({
      schema: 1,
      policy: 'tailwind-rule-signatures-v1',
      tailwindVersion: 'authored-control',
      fingerprint: 'a'.repeat(64),
      stylesheets: [],
      candidates: cache.candidates().map((candidate, id) => ({
        id,
        candidate,
        status: 'not-generated',
        firstRuleRank: null,
        rules: [],
      })),
    }),
  )
}
