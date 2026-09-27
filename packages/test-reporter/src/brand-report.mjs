import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const HOZO_BRAND_STYLE = `<style id="hozo-brand-style">
:root {
  --hozo-btn-color: #c8a882;
  --hozo-btn-border: rgba(200, 168, 130, 0.4);
  --hozo-btn-bg: rgba(200, 168, 130, 0.1);
  --hozo-btn-hover-color: #ffffff;
  --hozo-btn-hover-border: #c8a882;
  --hozo-btn-hover-bg: rgba(200, 168, 130, 0.25);
  --hozo-btn-focus-outline: #c8a882;
}
[data-theme="light"] {
  --hozo-btn-color: #8c6843;
  --hozo-btn-border: rgba(140, 104, 67, 0.4);
  --hozo-btn-bg: rgba(200, 168, 130, 0.15);
  --hozo-btn-hover-color: #4a321a;
  --hozo-btn-hover-border: #8c6843;
  --hozo-btn-hover-bg: rgba(200, 168, 130, 0.3);
  --hozo-btn-focus-outline: #8c6843;
}
.hozo-back-home {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 6px;
  text-decoration: none;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 12px;
  font-weight: 600;
  line-height: 16px;
  color: var(--hozo-btn-color);
  border: 1px solid var(--hozo-btn-border);
  background-color: var(--hozo-btn-bg);
  transition: all 0.15s ease-in-out;
  cursor: pointer;
  white-space: nowrap;
  user-select: none;
  -webkit-user-select: none;
  box-sizing: border-box;
  height: 24px;
}
.hozo-back-home:hover {
  color: var(--hozo-btn-hover-color);
  border-color: var(--hozo-btn-hover-border);
  background-color: var(--hozo-btn-hover-bg);
}
.hozo-back-home:focus-visible {
  color: var(--hozo-btn-hover-color);
  border-color: var(--hozo-btn-hover-border);
  background-color: var(--hozo-btn-hover-bg);
  outline: 2px solid var(--hozo-btn-focus-outline);
  outline-offset: 2px;
}
.hozo-back-home .hozo-back-home-arrow {
  font-size: 13px;
  line-height: 1;
}
.hozo-back-home:not(.hozo-mounted) {
  position: fixed;
  top: 8px;
  right: 24px;
  z-index: 10000;
}
.hozo-back-home.hozo-mounted {
  position: static;
  margin-right: 4px;
  flex-shrink: 0;
}
@media (max-width: 520px) {
  .hozo-back-home-text {
    display: none;
  }
}
</style>`

export const HOZO_BRAND_BUTTON = `<a id="hozo-back-home" href="../" target="_self" class="hozo-back-home" title="Back to Hozo LP Home" aria-label="Back to Hozo LP Home"><span aria-hidden="true" class="hozo-back-home-arrow">←</span><span class="hozo-back-home-text">Hozo Home</span></a>`

export const HOZO_BRAND_SCRIPT = `<script id="hozo-brand-script">
(() => {
  const btn = document.getElementById('hozo-back-home');
  if (!btn) return;

  function mount() {
    const container =
      document.querySelector('[data-testid="toggle-layout-button"]')?.parentElement ||
      document.querySelector('.yme8680C') ||
      document.querySelector('.y3b2nNS8 > div:last-child');

    if (container && btn.parentElement !== container) {
      container.insertBefore(btn, container.firstChild);
      btn.classList.add('hozo-mounted');
    }
  }

  mount();
  const observer = new MutationObserver(mount);
  observer.observe(document.body, { childList: true, subtree: true });
})();
</script>`

export function brandReportHtml(html) {
  let result = html

  // 1. Clean up title
  result = result.replace(
    /<title>\s*Hozo\s*—\s*Test Reports\s*<\/title>/i,
    '<title>Hozo — Test Reports</title>',
  )

  // 2. OpenGraph and meta tags
  if (!result.includes('og:site_name')) {
    const metaTags = `    <meta property="og:site_name" content="Hozo" />\n    <meta property="og:title" content="Hozo — Test Reports" />\n    <meta name="description" content="CI test reports for Hozo, universal UI compiler for React Native." />\n`
    result = result.replace('</head>', `${metaTags}</head>`)
  }

  // 3. Brand style
  if (!result.includes('id="hozo-brand-style"')) {
    result = result.replace('</head>', `${HOZO_BRAND_STYLE}\n</head>`)
  }

  // 4. Brand button
  if (!result.includes('id="hozo-back-home"')) {
    result = result.replace('</body>', `${HOZO_BRAND_BUTTON}\n</body>`)
  }

  // 5. Brand mount script
  if (!result.includes('id="hozo-brand-script"')) {
    result = result.replace('</body>', `${HOZO_BRAND_SCRIPT}\n</body>`)
  }

  return result
}

export function brandReportFile(filePath) {
  const absolutePath = resolve(process.cwd(), filePath)
  if (!existsSync(absolutePath)) {
    console.warn(`[brand-report] Warning: file not found at ${absolutePath}`)
    return false
  }

  const raw = readFileSync(absolutePath, 'utf8')
  const branded = brandReportHtml(raw)
  writeFileSync(absolutePath, branded, 'utf8')
  console.log(`[brand-report] Successfully branded ${filePath}`)
  return true
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])

if (isMainModule) {
  const targetPath = process.argv[2] || 'apps/landing/dist/reports/index.html'
  brandReportFile(targetPath)
}
