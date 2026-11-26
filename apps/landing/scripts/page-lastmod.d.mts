export function parseGitLog(log: string): Map<string, string>
export function lastModified(
  files: string[],
  options?: { cwd?: string; git?: (args: string[]) => string },
): Map<string, string>
