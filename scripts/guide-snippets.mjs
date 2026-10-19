// Reads a getting-started guide as the project it describes.
//
// A guide's code blocks are what a newcomer copies, so they are what has to
// work. A block whose fence has `title="path"` is a file at that path; the
// docs site shows the title as the file's name. An `npm install` block says
// what to install. Everything else -- shell output, fragments, prose -- is
// left alone. The packed consumer (`check-packed-consumer.mjs`) writes the
// files over a stand-in for the framework's own starter, installs the
// packages from local tarballs, and builds.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const GUIDES = fileURLToPath(
  new URL('../apps/landing/src/content/docs/docs/getting-started/', import.meta.url),
)

/** The guides the packed consumer builds, and the starter each assumes. */
export const BUILT_GUIDES = ['vite', 'astro']

export function readGuide(name) {
  return parseGuide(readFileSync(`${GUIDES}${name}.md`, 'utf8'))
}

export function parseGuide(markdown) {
  const files = []
  const dependencies = []
  const devDependencies = []
  for (const [, info, body] of markdown.matchAll(/^```([^\n]*)\n([\s\S]*?)^```$/gm)) {
    const title = info.match(/\btitle="([^"]+)"/)?.[1]
    if (title) {
      if (files.some((file) => file.path === title)) throw new Error(`${title} appears twice`)
      files.push({ path: title, content: body })
      continue
    }
    if (!/^(?:sh|bash)\b/.test(info)) continue
    for (const line of body.split('\n')) {
      const words = line.trim().split(/\s+/)
      if (words[0] !== 'npm' || words[1] !== 'install') continue
      const dev = words.includes('--save-dev') || words.includes('-D')
      const names = words.slice(2).filter((word) => !word.startsWith('-'))
      ;(dev ? devDependencies : dependencies).push(...names)
    }
  }
  return { files, dependencies, devDependencies }
}
