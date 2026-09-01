// Proves the Next.js integration did its job, rather than that the build
// exited zero. A Turbopack build succeeds perfectly well with the loader
// never having run.
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name)
    return entry.isDirectory() ? filesUnder(file) : [file]
  })
}

const artifacts = filesUnder('.next').filter((file) => /\.(?:js|mjs|css|html)$/.test(file))
const output = artifacts.map((file) => readFileSync(file, 'utf8')).join('\n')
const html = readFileSync(path.join('.next', 'server', 'app', 'index.html'), 'utf8')
const notes = readFileSync(path.join('.next', 'server', 'app', 'notes.html'), 'utf8')

/**
 * The words of the MDX page that are prose rather than classes.
 *
 * Read from the page instead of listed here, and that is not tidiness.
 * The first version of this check spelled the words out -- `block`,
 * `table`, `visible` -- and `scripts/` is inside the project walk, so
 * naming them put all seven into the candidate stylesheet and the check
 * failed on its own fixture. String literals are scanned deliberately:
 * that is where a dynamically composed class name lives.
 *
 * Everything inside a `className` is removed first, since those words are
 * classes and belong in the stylesheet.
 */
const proseWords = [
  ...new Set(
    readFileSync(path.join('src', 'app', 'notes', 'page.mdx'), 'utf8')
      .replace(/className="[^"]*"/g, ' ')
      .split(/[^a-zA-Z0-9_-]+/)
      .filter((word) => word.length > 2),
  ),
]

/** Every plain single-class selector the candidate stylesheet defines. */
const candidateRules = new Set(
  readFileSync(path.join('node_modules', '.hozo', 'candidates.css'), 'utf8')
    .split('\n')
    .map((line) => /^\.([a-zA-Z0-9_-]+)\s*\{/.exec(line)?.[1])
    .filter((name) => name !== undefined),
)

/**
 * One of Hozo's generated class names.
 *
 * Matched by shape rather than spelled out: the name carries a hash of the
 * module it came from, so that two modules on one page cannot both answer
 * to `hozo-r0-8`. A check that names a class is a check that has to be
 * edited whenever a file moves.
 */
const GENERATED_CLASS = /\bhozo-[a-z0-9]+-r\d+-\d+\b/

const lowered = (html, tag) =>
  new RegExp(`<${tag} class="[^"]*hozo-[a-z0-9]+-r\\d+-\\d+`).test(html)

const checks = [
  // Lowering: canonical primitives became semantic HTML, and the class is
  // the compiled scoped one rather than the authored utility string.
  [lowered(html, 'section'), 'Section did not lower to <section>'],
  [lowered(html, 'h1'), 'Heading level={1} did not lower to <h1>'],
  [lowered(html, 'p'), 'Paragraph did not lower to <p>'],
  [lowered(html, 'button'), 'Button did not lower to <button>'],
  [!/class="[^"]*\bp-8\b/.test(html), 'an authored utility class survived to the DOM'],
  // The compiler's own output reached the browser as CSS.
  [GENERATED_CLASS.test(output), 'no Hozo-generated CSS in the build output'],
  // The project theme was read: `bg-brand` only resolves through
  // src/theme.css, which nothing imports.
  [
    /background-color:\s*(?:#3082f6|lab\(|oklch\(62%)/.test(output),
    'project theme token bg-brand did not resolve',
  ],
  [/margin-top:\s*37px/.test(output), 'aliased StyleX sheet did not lower'],
  // Variants: `md:hover:` needs both the width query and the capability one.
  [/@media\s*\(min-width:\s*768px\)/.test(output), 'responsive variant produced no media query'],
  [/@media\s*\(hover:\s*hover\)/.test(output), 'hover variant produced no capability query'],
  // Tier three: a class only a runtime expression produces is covered by
  // the project-wide scan, which under Next runs at config time.
  [output.includes('.bg-emerald-500'), 'candidate stylesheet did not reach the build'],
  // And that stylesheet was rendered *with* the project theme. `bg-brand`
  // is the only class in `variants.ts` that cannot resolve without
  // `src/theme.css`, which is what makes this checkable at all: while they
  // were all default-palette colours, a theme-less candidate sheet looked
  // exactly like a correct one. It was theme-less on any warm cache, and
  // `bg-brand` compiled to a CSS variable nothing defines.
  [
    !/--hozo-color-brand/.test(output),
    'the candidate stylesheet was rendered without the project theme',
  ],
  // Nothing of the authoring layer is left in the bundle.
  [!output.includes('@hozo/core'), 'Next.js output still imports @hozo/core'],

  // MDX. The two bundlers reach the loader by different routes and only
  // one of them is arranged here: Turbopack's MDX rule declares
  // `as: '*.tsx'` so the output meets Hozo's own rule on its way past,
  // while under webpack Hozo has to be spliced into the middle of
  // `[swc, mdxLoader]`. A Turbopack-only check would pass with every
  // webpack build shipping the page uncompiled -- the same asymmetry that
  // made this script run both in the first place.
  [lowered(notes, 'section'), 'Section written in MDX did not lower'],
  [lowered(notes, 'span'), 'Text written in MDX did not lower'],
  [notes.includes('<h1>Notes written in MDX'), 'the Markdown around it stopped rendering'],
  // Prose is not a class list, however much of it happens to be a
  // Tailwind utility. `.mdx` is deliberately absent from the project walk
  // for this reason -- on disk the file is Markdown, which does not parse,
  // and the scan would fall back to reading English.
  //
  // Read from the candidate stylesheet rather than from every artifact:
  // that file is what the claim is about, and `.table` as a substring of
  // a minified bundle means nothing.
  //
  // With the positive case first, because assertions that something is
  // absent all pass against an empty set, and an empty set is exactly what
  // a broken parse or a moved file would produce.
  [
    candidateRules.has('bg-emerald-500'),
    'the candidate stylesheet parsed to nothing, so the checks below prove nothing',
  ],
  ...proseWords.map((word) => [
    !candidateRules.has(word),
    `prose from the MDX page reached the stylesheet: .${word}`,
  ]),
]

for (const [ok, message] of checks) {
  if (!ok) throw new Error(message)
}

console.log(`Next.js build check passed (${artifacts.length} artifacts)`)
