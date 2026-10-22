import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import allureConfig from '../../../allurerc.mjs'
import { checkJUnitDirectory } from './assert-junit.mjs'
import { convertJUnitDirectory } from './junit-to-allure.mjs'
import { normalizeJUnit } from './normalize-junit.mjs'
import { buildCommandJUnit, extractTurboTasks } from './run-command-junit.mjs'
import {
  collectWorkflowJUnit,
  discoverWorkflows,
  normalizeJobName,
  selectCandidateRuns,
} from './workflows-to-junit.mjs'

test('discoverWorkflows includes all verification workflows and excludes release/pages plumbing', () => {
  const slugs = discoverWorkflows().map((workflow) => workflow.slug)
  for (const expected of [
    'android-ndk',
    'ci',
    'native',
    'native-export',
    'native-showcase',
    'packed-consumer',
    'release',
    'runtime-class-list',
    'screen-readers',
    'security',
    'storybook-a11y',
    'three-gpu',
    'three-native-gpu',
  ]) {
    assert.ok(slugs.includes(expected), `expected workflow ${expected} to be discovered`)
  }
  for (const excluded of ['bootstrap-publish', 'deploy-pages', 'pr-title', 'version']) {
    assert.ok(!slugs.includes(excluded), `expected ${excluded} to be excluded`)
  }
})

test('selectCandidateRuns ignores non-executing runs and WIP branch failures while preserving main failures', () => {
  const candidates = selectCandidateRuns([
    {
      id: 1,
      status: 'completed',
      conclusion: 'action_required',
      head_branch: 'changeset-release/main',
      created_at: '2026-10-22T05:00:00Z',
    },
    {
      id: 2,
      status: 'completed',
      conclusion: 'failure',
      head_branch: 'feat/wip-branch',
      created_at: '2026-10-22T04:00:00Z',
    },
    {
      id: 3,
      status: 'completed',
      conclusion: 'success',
      head_branch: 'main',
      created_at: '2026-10-22T03:00:00Z',
    },
    {
      id: 4,
      status: 'completed',
      conclusion: 'failure',
      head_branch: 'main',
      created_at: '2026-10-22T02:00:00Z',
    },
  ])
  assert.deepEqual(
    candidates.map((run) => run.id),
    [3, 4],
  )
})

test('collectWorkflowJUnit backfills skipped jobs from the most recent run where they executed and converts steps and links', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'hozo-workflows-'))
  const workflowDir = join(directory, '.github', 'workflows')
  const reportDir = join(directory, 'junit')
  const allureDir = join(directory, 'allure')
  try {
    mkdirSync(workflowDir, { recursive: true })
    writeFileSync(join(workflowDir, 'native-showcase.yml'), 'name: native-showcase\n', 'utf8')

    const responses = new Map([
      [
        'https://api.github.com/repos/iray-tno/hozo/actions/workflows/native-showcase.yml/runs?branch=main&status=completed&per_page=10',
        {
          workflow_runs: [
            {
              id: 200,
              status: 'completed',
              conclusion: 'success',
              head_branch: 'main',
              head_sha: 'abcdef1234567890',
              event: 'workflow_dispatch',
              created_at: '2026-10-22T03:00:00Z',
              html_url: 'https://github.com/iray-tno/hozo/actions/runs/200',
            },
            {
              id: 100,
              status: 'completed',
              conclusion: 'success',
              head_branch: 'main',
              head_sha: '1234567890abcdef',
              event: 'schedule',
              created_at: '2026-10-21T03:00:00Z',
              html_url: 'https://github.com/iray-tno/hozo/actions/runs/100',
            },
          ],
        },
      ],
      [
        'https://api.github.com/repos/iray-tno/hozo/actions/workflows/native-showcase.yml/runs?status=completed&per_page=30',
        { workflow_runs: [] },
      ],
      [
        'https://api.github.com/repos/iray-tno/hozo/actions/runs/200/jobs?per_page=100',
        {
          jobs: [
            {
              name: 'android',
              conclusion: 'success',
              started_at: '2026-10-22T03:00:00Z',
              completed_at: '2026-10-22T03:15:00Z',
              html_url: 'https://github.com/iray-tno/hozo/actions/runs/200/job/201',
              steps: [
                { name: 'Set up job', conclusion: 'success' },
                {
                  name: 'Exercise selected Android showcase scenario',
                  conclusion: 'success',
                  started_at: '2026-10-22T03:05:00Z',
                  completed_at: '2026-10-22T03:14:00Z',
                },
              ],
            },
            {
              name: "inputs.reuse-build-run != '' && 'ios (reused binary diagnostic)' || 'ios'",
              conclusion: 'skipped',
              started_at: '2026-10-22T03:00:00Z',
              completed_at: '2026-10-22T03:00:00Z',
              html_url: 'https://github.com/iray-tno/hozo/actions/runs/200/job/202',
              steps: [],
            },
          ],
        },
      ],
      [
        'https://api.github.com/repos/iray-tno/hozo/actions/runs/100/jobs?per_page=100',
        {
          jobs: [
            {
              name: 'ios',
              conclusion: 'success',
              started_at: '2026-10-21T03:00:00Z',
              completed_at: '2026-10-21T03:20:00Z',
              html_url: 'https://github.com/iray-tno/hozo/actions/runs/100/job/102',
              steps: [
                {
                  name: 'Exercise iOS simulator showcase',
                  conclusion: 'success',
                  started_at: '2026-10-21T03:10:00Z',
                  completed_at: '2026-10-21T03:19:00Z',
                },
              ],
            },
          ],
        },
      ],
    ])

    assert.equal(
      normalizeJobName("inputs.reuse-build-run != '' && 'ios (reused binary diagnostic)' || 'ios'"),
      'ios',
    )

    const count = await collectWorkflowJUnit({
      root: directory,
      reportDir,
      fetcher: async (url) => {
        const body = responses.get(String(url))
        if (!body) return new Response('{}', { status: 404 })
        return new Response(JSON.stringify(body), { status: 200 })
      },
    })
    assert.equal(count, 1)

    const converted = convertJUnitDirectory(reportDir, allureDir, directory)
    assert.equal(converted, 2)

    const results = readdirSync(allureDir)
      .filter((name) => name.endsWith('-result.json'))
      .map((name) => JSON.parse(readFileSync(join(allureDir, name), 'utf8')))
      .sort((a, b) => a.name.localeCompare(b.name))

    assert.deepEqual(
      results.map((result) => result.name),
      ['android', 'ios'],
    )
    assert.equal(results[0].steps[0].name, 'Exercise selected Android showcase scenario')
    assert.equal(results[1].steps[0].name, 'Exercise iOS simulator showcase')
    assert.ok(
      results[0].links.some(
        (link) => link.url === 'https://github.com/iray-tno/hozo/actions/runs/200/job/201',
      ),
    )
    assert.ok(
      results[1].links.some(
        (link) => link.url === 'https://github.com/iray-tno/hozo/actions/runs/100/job/102',
      ),
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('external workflow failures are surfaced in Allure without failing the local JUnit gate', () => {
  const directory = mkdtempSync(join(tmpdir(), 'hozo-assert-junit-'))
  try {
    writeFileSync(
      join(directory, 'local.xml'),
      '<testsuites><testsuite name="unit"><testcase name="ok" classname="unit" /></testsuite></testsuites>',
      'utf8',
    )
    writeFileSync(
      join(directory, 'workflow-screen-readers.xml'),
      '<testsuites external="true"><testsuite name="screen-readers" external="true"><testcase name="voiceover" classname="workflow.screen-readers"><failure message="failed" /></testcase></testsuite></testsuites>',
      'utf8',
    )
    const status = checkJUnitDirectory(directory)
    assert.deepEqual(status.failed, [])
    assert.equal(status.externalFailed.length, 1)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('run-command-junit unpacks Turbo task summaries and uses full commands when no summary exists', () => {
  const tasks = extractTurboTasks(
    {
      tasks: [
        {
          package: '@hozo/core',
          task: 'build',
          directory: 'packages/core',
          execution: { startTime: 1000, endTime: 2000, exitCode: 0 },
        },
        {
          package: '@hozo/landing',
          task: 'test',
          directory: 'apps/landing',
          logFile: 'apps/landing/.turbo/turbo-test.log',
          execution: { startTime: 2000, endTime: 5500, exitCode: 0 },
        },
      ],
    },
    () => 'landing ok',
  )
  assert.equal(tasks.length, 1)
  assert.equal(tasks[0].name, '@hozo/landing (test)')
  assert.equal(tasks[0].file, 'apps/landing/package.json')

  const xml = buildCommandJUnit({
    suiteName: 'integration',
    command: 'pnpm',
    args: ['test:integration', '--concurrency=2'],
    status: 0,
    seconds: '3.500',
    turboTasks: tasks,
  })
  assert.match(xml, /package="Integration &amp; Conformance"/)
  assert.match(xml, /name="@hozo\/landing \(test\)"/)
  assert.match(xml, /file="apps\/landing\/package\.json"/)

  const fallback = buildCommandJUnit({
    suiteName: 'performance',
    command: 'pnpm',
    args: ['test:performance'],
    status: 0,
    seconds: '1.200',
  })
  assert.match(fallback, /name="pnpm test:performance"/)
})

test('normalizeJUnit preserves suitePackageName when mixed testcase and testsuite nodes are present', () => {
  const normalized = normalizeJUnit(
    '<testsuites><testcase name="top" file="scripts/style-slots.test.mjs"/><testsuite name="inner"><testcase name="nested" file="scripts/pack-npm.test.mjs"/></testsuite></testsuites>',
    'typescript',
    'publishing',
  )
  assert.match(normalized, /classname="style-slots"/)
  assert.match(normalized, /classname="pack-npm"/)
  assert.doesNotMatch(normalized, /<testsuite name="inner"/)
})

test('allurerc historyPath resolves to the repository root allure-history directory', () => {
  assert.equal(resolve(allureConfig.historyPath), resolve('allure-history', 'allure-history.jsonl'))
})
