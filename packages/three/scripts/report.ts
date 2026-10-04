// Both reports, each given the arguments `pnpm run report` was.
//
// As `node scripts/report-conformance.ts && node scripts/report-scenes.ts`,
// an argument appended by `pnpm run report --check` -- which is how the
// Pages workflow runs it, through `turbo run report -- --check` -- reached
// only the second. The first then ran without `--check`, refused to rewrite
// its report in CI, and failed the workflow's reported checks from
// 2026-10-02 onwards.
import { spawnSync } from 'node:child_process'

for (const script of ['scripts/report-conformance.ts', 'scripts/report-scenes.ts']) {
  const result = spawnSync(process.execPath, [script, ...process.argv.slice(2)], {
    stdio: 'inherit',
  })
  if (result.status !== 0) process.exit(result.status ?? 1)
}
