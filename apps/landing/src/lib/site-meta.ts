// What every indexed page's <head> says to crawlers, shared by the landing's
// SiteHead and the Starlight docs' DocsHead so the two cannot drift.

// Search Console's ownership check, the code shared across iray-tno.github.io
// (#704). Public by design: the tag proves control of the page, not a secret.
export const GOOGLE_SITE_VERIFICATION = 'Bi3E2hIYlL4dUq-rWPnj6Qklwt7RR4_kLA4KZCpN3xI'

// Lets search engines and AI overviews show the large card image and a
// full-length snippet rather than a truncated one (#704).
export const ROBOTS_INDEX =
  'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
