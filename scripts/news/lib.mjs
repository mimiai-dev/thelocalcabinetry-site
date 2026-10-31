// Tiny, dependency-free helpers for the news generator: front matter, a small markdown subset, escaping.
export const SITE = 'https://thelocalcabinetry.com'
export const CATEGORIES = [
  { slug: 'guides', name: 'Guides', blurb: 'Plain guides to planning, measuring and choosing cabinets.' },
  { slug: 'projects', name: 'Projects', blurb: 'Projects we have worked on and what we learned.' },
  { slug: 'product-news', name: 'Product news', blurb: 'New collections, finishes and parts.' },
  { slug: 'company', name: 'Company', blurb: 'News from The Local Cabinetry.' },
]
import fs from 'node:fs'
import path from 'node:path'
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..')
export const IMG_WIDTHS = [480, 640, 960, 1400]
// <picture> with webp at 480/960/1400 w when scripts/news/images.mjs has made them (the jpg stays the fallback and the src).
// Falls back to a plain <img> for an image with no derived files (a remote or already-small image).
export function picture(src, alt, w, h, sizes, attrs = '') {
  const m = /^(\/[^?#]+)\.(jpe?g|png)$/i.exec(src)
  const img = `<img src="${esc(src)}" alt="${esc(alt)}"${w ? ` width="${w}" height="${h}"` : ''} ${attrs}>`
  if (!m) return img
  const set = IMG_WIDTHS.filter((x) => fs.existsSync(path.join(ROOT, `${m[1]}-${x}.webp`))).map((x) => `${m[1]}-${x}.webp ${x}w`)
  return set.length ? `<picture><source type="image/webp" srcset="${set.join(', ')}" sizes="${sizes}">${img}</picture>` : img
}
export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
export const escXml = esc
export function slugify(t) { return String(t).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70).replace(/-+$/, '') }

// front matter: "key: value" lines between --- lines; [a, b] arrays; true/false; quotes optional
export function parseFrontMatter(src) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(src)
  if (!m) throw new Error('missing front matter')
  const fm = {}
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    const k = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(line)
    if (!k) throw new Error('bad front matter line: ' + line)
    let v = k[2].trim()
    if (v === 'true') v = true
    else if (v === 'false') v = false
    else if (/^\[.*\]$/.test(v)) v = v.slice(1, -1).split(',').map((x) => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
    else v = v.replace(/^["']|["']$/g, '')
    fm[k[1]] = v
  }
  return { fm, body: m[2] }
}

// inline: **bold**, *italic*, `code`, [text](url); everything else escaped
export function inline(s) {
  let out = esc(s)
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>')
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => {
    const url = u.replace(/&amp;/g, '&')
    if (!/^(\/|#|https?:\/\/|mailto:)/.test(url)) return t
    const ext = /^https?:\/\//.test(url) && !url.startsWith(SITE)
    return `<a href="${esc(url)}"${ext ? ' rel="noopener"' : ''}>${t}</a>`
  })
  return out
}

// block level: ## / ### headings, paragraphs, - lists, 1. lists, > quotes, --- rules, ![alt](src "caption") figures
export function markdown(body, opts = {}) {
  const lines = body.replace(/\r/g, '').replace(/<!--[\s\S]*?-->/g, '').split('\n')
  const out = []; let i = 0; const heads = []
  const para = []
  const flush = () => { if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para.length = 0 } }
  while (i < lines.length) {
    const l = lines[i]
    if (!l.trim()) { flush(); i++; continue }
    let m
    if ((m = /^(#{2,3})\s+(.+)$/.exec(l))) {
      flush(); const lvl = m[1].length, text = m[2].trim(); const id = slugify(text)
      heads.push({ lvl, text, id }); out.push(`<h${lvl} id="${id}">${inline(text)}</h${lvl}>`); i++; continue
    }
    if (/^#\s/.test(l)) throw new Error('the post body must not contain an h1 (# ): the title is the h1')
    if (/^---+$/.test(l.trim())) { flush(); out.push('<hr>'); i++; continue }
    if ((m = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)\s*(?:\{(\d+)x(\d+)\})?$/.exec(l.trim()))) {
      flush(); const [, alt, src, cap, w, h] = m
      if (!alt) throw new Error('image without alt text: ' + src)
      out.push(`<figure>${picture(src, alt, w, h, '(max-width:800px) 100vw, 704px', 'loading="lazy" decoding="async"')}${cap ? `<figcaption>${inline(cap)}</figcaption>` : ''}</figure>`); i++; continue
    }
    if (/^>\s?/.test(l)) { flush(); const q = []; while (i < lines.length && /^>\s?/.test(lines[i])) { q.push(lines[i].replace(/^>\s?/, '')); i++ } out.push('<blockquote><p>' + inline(q.join(' ')) + '</p></blockquote>'); continue }
    if (/^\s*[-*]\s+/.test(l)) { flush(); const it = []; while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { it.push('<li>' + inline(lines[i].replace(/^\s*[-*]\s+/, '')) + '</li>'); i++ } out.push('<ul>' + it.join('') + '</ul>'); continue }
    if (/^\s*\d+[.)]\s+/.test(l)) { flush(); const it = []; while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { it.push('<li>' + inline(lines[i].replace(/^\s*\d+[.)]\s+/, '')) + '</li>'); i++ } out.push('<ol>' + it.join('') + '</ol>'); continue }
    para.push(l.trim()); i++
  }
  flush()
  return { html: out.join('\n'), headings: heads }
}
export const stripTags = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim()
export const wordCount = (md) => md.replace(/[#>*`\[\]()!-]/g, ' ').split(/\s+/).filter(Boolean).length
export const fmtDate = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
