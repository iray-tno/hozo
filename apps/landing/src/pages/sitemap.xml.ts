// The site's pages, for search engines.
//
// Read off the `.astro` pages and the docs collection rather than listed, so
// a page added later is in the sitemap without anyone remembering it. The
// MDX probe is a `.mdx` file and a build check rather than a page for
// readers, so it is not.
//
// There is no `robots.txt` to point at this: GitHub Pages serves the project
// site under `/hozo/`, and crawlers only read `/robots.txt` at the host root,
// which this repository does not control. Submit this URL to a search
// console directly.

import { getCollection } from 'astro:content'
import type { APIRoute } from 'astro'

const pages = Object.keys(import.meta.glob('./*.astro'))
  .map((file) => file.replace(/^\.\//, '').replace(/\.astro$/, ''))
  .map((name) => (name === 'index' ? '' : `${name}/`))

export const GET: APIRoute = async ({ site }) => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  // Starlight's ids are the file paths: `docs/index` is `/docs/`.
  const docs = (await getCollection('docs')).map((entry) =>
    `${entry.id.replace(/(^|\/)index$/, '')}/`.replace(/^\/$/, ''),
  )
  const urls = [...pages, ...docs]
    .sort()
    .map((page) => `  <url><loc>${new URL(`${base}/${page}`, site).href}</loc></url>`)
    .join('\n')
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  )
}
