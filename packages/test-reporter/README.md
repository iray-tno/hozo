# @hozo/test-reporter

Internal JUnit normalization and Allure 3 test report generator for Hozo.

## Overview

Hozo runs diverse test and linting runners across Rust, Node.js, and Biome. This private workspace package normalizes their various output formats into standard JUnit XML files and packages them for the Allure 3 test reporting dashboard hosted at `/reports/`.

## Utilities

- **`src/biome-to-junit.mjs`**: Converts Biome JSON diagnostics and format reports into standard JUnit test suites.
- **`src/clippy-to-junit.mjs`**: Converts `cargo clippy --message-format=json` compiler output into JUnit assertions.
- **`src/run-tests-junit.mjs`**: Executes the Node.js test runner with JUnit reporters, categorizing test results by package.
- **`src/run-command-junit.mjs`**: Wraps integration, performance, and conformance commands as JUnit suites while preserving their logs.
- **`src/assert-junit.mjs`**: Fails CI after the report has been published when any collected suite failed.
- **`src/junit-to-allure.mjs`**: Converts collected JUnit into Allure results with GitHub source links for resolvable TypeScript and Rust tests.
- **`src/normalize-junit.mjs`**: Cleans and canonicalizes suite names and durations to produce consistent Allure trends across CI runs.
