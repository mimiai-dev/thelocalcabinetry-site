#!/usr/bin/env node
// Makes the responsive webp copies (<name>-480, -640, -960, -1400 .webp, never wider than the source) of every jpg/png a news post uses,
// from our own files, with cwebp (BSD) + sips (macOS). Run after adding a post image, then `node scripts/news/build.mjs`.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { IMG_WIDTHS } from './lib.mjs'
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..')
const dir = path.join(ROOT, 'content/news')
const srcs = new Set()
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md'))) {
  for (const m of fs.readFileSync(path.join(dir, f), 'utf8').matchAll(/(\/[A-Za-z0-9_\/.-]+?\.(?:jpe?g|png))/gi)) srcs.add(m[1])
}
for (const s of srcs) {
  const file = path.join(ROOT, s); if (!fs.existsSync(file)) { console.log('missing', s); continue }
  const w = +execFileSync('sips', ['-g', 'pixelWidth', file]).toString().match(/pixelWidth: (\d+)/)[1]
  for (const x of IMG_WIDTHS) {
    const out = file.replace(/\.[a-z]+$/i, `-${x}.webp`)
    if (x >= w || fs.existsSync(out)) continue
    execFileSync('cwebp', ['-quiet', '-q', '72', '-resize', String(x), '0', file, '-o', out]); console.log('made', path.relative(ROOT, out))
  }
}
