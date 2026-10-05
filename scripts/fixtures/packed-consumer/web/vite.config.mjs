import { hozo } from '@hozo/vite'
import { defineConfig } from 'vite'

// No workspace aliases or watch folders. Source-distributed UI must be
// discovered from this application's installed package, as a user sees it.
export default defineConfig({ plugins: [hozo({ css: 'src/theme.css' })] })
