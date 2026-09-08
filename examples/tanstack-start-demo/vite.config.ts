import { hozo } from '@hozo/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

// Where the server build lands, when something asks for somewhere else.
//
// `build` and `test` both run `vite build`, and turbo starts them together:
// `test` depends on `^build`, its dependencies' builds, not its own. Both
// writing `.output` produced `EPERM: unlink '.output/nitro.json'` for
// whichever one lost (#322).
//
// An environment variable because the directory is Nitro's rather than
// Vite's -- `vite build --outDir` moves the client assets and leaves the
// server output where it was, which is the half the check reads.
const output = process.env.HOZO_NITRO_OUTPUT_DIR

export default defineConfig({
  plugins: [hozo(), tanstackStart(), viteReact(), nitro(output ? { output: { dir: output } } : {})],
})
