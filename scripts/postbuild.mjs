// GitHub Pages has no server-side routing: serve the app for unknown paths too (PLAN D-10).
import { copyFileSync } from 'node:fs'

copyFileSync('dist/index.html', 'dist/404.html')
