#!/usr/bin/env node
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { SITE, parseFrontMatter } from './lib.mjs'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const RSS = '<link rel="alternate" type="application/rss+xml" title="The Local Cabinetry news" href="/news/rss.xml">'
const ATOM = '<link rel="alternate" type="application/atom+xml" title="The Local Cabinetry news" href="/news/atom.xml">'
const NOT_SERVED = new Set(['node_modules', 'docs', 'scripts', 'deploy', 'content', 'logo-src', 'catalog/src'])
const pages = (rel = '') => fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true }).flatMap((e) => {
  const p = rel ? `${rel}/${e.name}` : e.name
  if (e.name.startsWith('.') || NOT_SERVED.has(p)) return []
  return e.isDirectory() ? pages(p) : e.name.endsWith('.html') ? [p] : []
})
const head = (s) => s.slice(0, s.indexOf('</head>'))
const count = (s, x) => s.split(x).length - 1

test('#171 robots.txt lists the Atom feed next to both XML sitemaps', () => {
  const lines = read('robots.txt').split('\n').filter((l) => l.startsWith('Sitemap: '))
  assert.deepEqual(lines, [`Sitemap: ${SITE}/sitemap-index.xml`, `Sitemap: ${SITE}/sitemap-news.xml`, `Sitemap: ${SITE}/news/atom.xml`])
})

test('#171 the home page head carries the RSS and the Atom alternate once each', () => {
  const h = head(read('index.html'))
  assert.equal(count(h, RSS), 1)
  assert.equal(count(h, ATOM), 1)
})

test('#171 every served page head carries both feed alternates once each', () => {
  const list = pages()
  assert.ok(list.length > 50, `only ${list.length} pages found`)
  const bad = list.filter((p) => { const h = head(read(p)); return count(h, RSS) !== 1 || count(h, ATOM) !== 1 })
  assert.deepEqual(bad, [])
})

test('#171 every published post is in both feeds with its published date', () => {
  const dir = path.join(ROOT, 'content/news')
  const posts = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => {
    const { fm } = parseFrontMatter(fs.readFileSync(path.join(dir, f), 'utf8'))
    const m = /^(\d{4}-\d{2}-\d{2})-(.+)\.md$/.exec(f)
    return { fm, slug: fm.slug || m[2], date: fm.date || m[1] }
  }).filter((p) => p.fm.draft === false).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 20)
  assert.ok(posts.length > 0)
  const rss = read('news/rss.xml'), atom = read('news/atom.xml')
  for (const p of posts) {
    const url = `${SITE}/news/${p.slug}/`
    const item = rss.split('<item>').find((x) => x.includes(`<link>${url}</link>`))
    assert.ok(item, `rss misses ${url}`)
    assert.ok(item.includes(`<pubDate>${new Date(p.date + 'T12:00:00Z').toUTCString()}</pubDate>`), `rss date of ${url}`)
    const entry = atom.split('<entry>').find((x) => x.includes(`<id>${url}</id>`))
    assert.ok(entry, `atom misses ${url}`)
    assert.ok(entry.includes(`<published>${p.date}T12:00:00Z</published>`), `atom date of ${url}`)
  }
})
