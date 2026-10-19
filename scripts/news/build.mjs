#!/usr/bin/env node
// News generator for thelocalcabinetry.com. No dependencies. Run from the repo root:
//   node scripts/news/build.mjs            writes /news/..., feeds, sitemap-news.xml, the home block, llms.txt block
//   node scripts/news/build.mjs --check    builds in memory and fails if the files in the repo are out of date
// Posts: content/news/<date>-<slug>.md (front matter, see docs/news-workflow.md). draft: true posts are NEVER written anywhere.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { SITE, CATEGORIES, esc, parseFrontMatter, markdown, stripTags, wordCount, fmtDate, slugify } from './lib.mjs'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..')
const CHECK = process.argv.includes('--check')
const PER_PAGE = 9
const OUT = new Map()           // repo-relative path -> content (strings), everything this script owns
const put = (p, c) => OUT.set(p, c)
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const exists = (p) => fs.existsSync(path.join(ROOT, p))

// ---------- posts
function loadPosts() {
  const dir = path.join(ROOT, 'content/news'); if (!fs.existsSync(dir)) return []
  const posts = []
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md')).sort()) {
    const { fm, body } = parseFrontMatter(fs.readFileSync(path.join(dir, f), 'utf8'))
    const m = /^(\d{4}-\d{2}-\d{2})-(.+)\.md$/.exec(f)
    if (!m) throw new Error(`${f}: file name must be <yyyy-mm-dd>-<slug>.md`)
    const slug = fm.slug || m[2]
    if (slug !== slugify(slug)) throw new Error(`${f}: slug must be lower-case letters, digits and dashes`)
    const draft = fm.draft !== false           // anything but an explicit draft: false stays a draft
    posts.push({ file: f, fm, body, slug, draft, date: fm.date || m[1], updated: fm.updated || fm.date || m[1] })
  }
  return posts
}
const all = loadPosts()
const posts = all.filter((p) => !p.draft).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
const cat = (slug) => CATEGORIES.find((c) => c.slug === slug)
for (const p of posts) { if (!cat(p.fm.category)) throw new Error(`${p.file}: unknown category ${p.fm.category}`) }

// ---------- template pieces taken from a live page so the news always matches the site
const T = read('about/index.html')
const headT = T.slice(0, T.indexOf('</head>'))
const keepHead = [
  /<meta http-equiv="Content-Security-Policy"[^>]*>/, /<link rel="icon"[^>]*>/g, /<link rel="apple-touch-icon"[^>]*>/, /<!--fonts:start-->.*?<!--fonts:end-->/s,
  /<link rel="stylesheet" href="\/_astro\/about\.[0-9a-f]{8}\.css">/, /<script src="\/t\.js" defer><\/script>/, /<script src="\/_astro\/hdr\.[0-9a-f]{8}\.js" defer><\/script>/, /<script src="\/chat\.js"[^>]*><\/script>/,
].map((re) => { const m = headT.match(re); if (!m) throw new Error('template head piece missing: ' + re); return m[0] }).join('')
const bodyStart = T.indexOf('<body>') + 6
const hdr = T.slice(bodyStart, T.indexOf('<main>'))
const footStart = T.indexOf('<footer'), footEnd = T.indexOf('</footer>') + 9
const footer = T.slice(footStart, footEnd)
const tail = T.slice(footEnd, T.lastIndexOf('</body>'))

// ---------- one stylesheet for the news pages (content-hashed; never edited in place)
const NEWS_CSS = `
.nw{max-width:var(--maxw);margin:0 auto;padding:0 28px}
.nw-head{padding:clamp(40px,6vw,72px) 0 28px;border-bottom:1px solid var(--line)}
.nw-head h1{font-family:var(--serif);font-weight:400;font-size:clamp(34px,5vw,56px);line-height:1.05;margin:0}
.nw-head p{color:var(--soft);max-width:60ch;margin:14px 0 0;font-size:18px}
.nw-cats{display:flex;flex-wrap:wrap;gap:8px;margin:22px 0 0}
.nw-cats a{padding:7px 14px;border:1px solid var(--line);color:var(--ink);text-decoration:none;font-size:14px;font-weight:600}
.nw-cats a[aria-current=page],.nw-cats a:hover{background:var(--navy);color:#fff;border-color:var(--navy)}
.nw-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:28px;padding:36px 0 20px}
.nw-card{display:flex;flex-direction:column;border:1px solid var(--line);background:#fff;color:inherit;text-decoration:none}
.nw-card img{display:block;width:100%;height:auto;aspect-ratio:3/2;object-fit:cover;background:var(--panel)}
.nw-card div{padding:18px 20px 22px}
.nw-card .nw-meta{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);font-weight:700}
.nw-card h2,.nw-card h3{font-family:var(--serif);font-weight:400;font-size:22px;line-height:1.2;margin:8px 0 8px;color:var(--navy)}
.nw-card p{color:var(--soft);font-size:15px;margin:0}
.nw-card:hover h2,.nw-card:hover h3{text-decoration:underline}
.nw-empty{padding:60px 0;color:var(--soft);font-size:18px}
.nw-pager{display:flex;gap:10px;justify-content:center;padding:10px 0 60px}
.nw-pager a,.nw-pager span{min-width:44px;min-height:44px;display:inline-flex;align-items:center;justify-content:center;padding:0 14px;border:1px solid var(--line);color:var(--ink);text-decoration:none;font-weight:600}
.nw-pager [aria-current=page]{background:var(--navy);color:#fff;border-color:var(--navy)}
.nw-crumbs{font-size:13px;color:var(--soft);padding:22px 0 0}.nw-crumbs a{color:var(--soft)}
.nw-post{max-width:760px;margin:0 auto;padding:0 28px 40px}
.nw-post header{padding:18px 0 22px}
.nw-post h1{font-family:var(--serif);font-weight:400;font-size:clamp(32px,5vw,50px);line-height:1.08;margin:10px 0 14px}
.nw-post .nw-meta{font-size:13px;color:var(--soft)}.nw-post .nw-meta a{color:var(--gold);font-weight:700;text-decoration:none;letter-spacing:.1em;text-transform:uppercase;font-size:12px}
.nw-hero{margin:0 0 28px}.nw-hero img{display:block;width:100%;height:auto;aspect-ratio:3/2;object-fit:cover}
.nw-prose{font-size:18px;line-height:1.7;color:var(--ink)}
.nw-prose h2{font-family:var(--serif);font-weight:400;font-size:clamp(25px,3vw,32px);line-height:1.2;margin:40px 0 12px;color:var(--navy);scroll-margin-top:120px}
.nw-prose h3{font-size:20px;margin:28px 0 8px;color:var(--navy);scroll-margin-top:120px}
.nw-prose p{margin:0 0 18px;max-width:68ch}.nw-prose ul,.nw-prose ol{margin:0 0 20px;padding-left:24px;max-width:68ch}.nw-prose li{margin:6px 0}
.nw-prose a{color:var(--navy);text-decoration:underline;text-underline-offset:3px;text-decoration-color:var(--gold)}
.nw-prose figure{margin:28px 0}.nw-prose figure img{display:block;width:100%;height:auto}.nw-prose figcaption{font-size:14px;color:var(--soft);margin-top:8px}
.nw-prose blockquote{margin:24px 0;padding:6px 0 6px 20px;border-left:3px solid var(--gold);color:var(--soft)}
.nw-prose hr{border:0;border-top:1px solid var(--line);margin:34px 0}
.nw-toc{border:1px solid var(--line);background:var(--panel);padding:16px 20px;margin:0 0 28px;font-size:15px}.nw-toc b{display:block;margin-bottom:6px}.nw-toc ol{margin:0;padding-left:20px}
.nw-cta{border:1px solid var(--line);background:var(--panel);padding:24px;margin:36px 0 10px}.nw-cta h2{margin:0 0 8px!important;font-size:24px!important}.nw-cta p{margin:0 0 14px}
.nw-cta a.btn{display:inline-block;background:var(--navy);color:#fff!important;text-decoration:none!important;padding:13px 22px;font-weight:600}
.nw-rel{padding:10px 0 40px}.nw-rel h2{font-family:var(--serif);font-weight:400;font-size:28px;margin:0 0 6px}
.nw-latest{padding:56px 0 20px}.nw-latest h2{font-family:var(--serif);font-weight:400;font-size:clamp(28px,3.4vw,40px);margin:0 0 6px}.nw-latest .nw-more{display:inline-block;margin-top:6px;color:var(--navy);font-weight:600}
@media (max-width:1000px){.nw-grid{grid-template-columns:repeat(2,1fr)}}
@media (max-width:640px){.nw{padding:0 16px}.nw-post{padding:0 16px 30px}.nw-grid{grid-template-columns:1fr;gap:22px}.nw-prose{font-size:17px}}
`.trim() + '\n'
const cssHash = crypto.createHash('sha256').update(NEWS_CSS).digest('hex').slice(0, 8)
const cssPath = `_astro/news.${cssHash}.css`
put(cssPath, NEWS_CSS)

// ---------- shared bits
const ORG = { '@type': 'Organization', '@id': SITE + '/#organization', name: 'The Local Cabinetry', url: SITE + '/', logo: { '@type': 'ImageObject', url: SITE + '/apple-touch-icon.png', width: 180, height: 180 } }
const abs = (u) => (u.startsWith('http') ? u : SITE + (u.startsWith('/') ? u : '/' + u))
function page({ title, description, canonical, ogType = 'website', ogImage = SITE + '/og-home.jpg', jsonld, main, noindex = false, extraHead = '' }) {
  const fullTitle = title.endsWith('The Local Cabinetry') ? title : `${title} | The Local Cabinetry`
  return `<!DOCTYPE html><html lang="en"> <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>${esc(fullTitle)}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${esc(canonical)}">` +
    (noindex ? '<meta name="robots" content="noindex,follow">' : '<meta name="robots" content="index,follow,max-image-preview:large">') +
    `<meta property="og:site_name" content="The Local Cabinetry"><meta property="og:type" content="${ogType}"><meta property="og:title" content="${esc(fullTitle)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(canonical)}"><meta property="og:image" content="${esc(ogImage)}">` +
    `<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(fullTitle)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${esc(ogImage)}">` +
    `<link rel="alternate" type="application/rss+xml" title="The Local Cabinetry news" href="/news/rss.xml"><link rel="alternate" type="application/atom+xml" title="The Local Cabinetry news" href="/news/atom.xml">` +
    extraHead + `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': jsonld })}</script>` +
    keepHead + `<link rel="stylesheet" href="/${cssPath}"></head><body>` + hdr + `<main>${main}</main> ` + footer + tail + `</body></html>`
}
const crumbsLd = (items) => ({ '@type': 'BreadcrumbList', itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it[0], item: abs(it[1]) })) })
const crumbsHtml = (items) => `<nav class="nw-crumbs" aria-label="Breadcrumb">${items.map((it, i) => (i < items.length - 1 ? `<a href="${it[1]}">${esc(it[0])}</a>` : `<span aria-current="page">${esc(it[0])}</span>`)).join(' &rsaquo; ')}</nav>`
const heroSrc = (p) => p.fm.hero
function card(p, h = 'h2') {
  const c = cat(p.fm.category)
  return `<a class="nw-card" href="/news/${p.slug}/">${p.fm.hero ? `<img src="${esc(p.fm.hero)}" alt="${esc(p.fm.hero_alt || '')}" width="${p.fm.hero_w || 1200}" height="${p.fm.hero_h || 800}" loading="lazy" decoding="async">` : ''}<div><span class="nw-meta">${esc(c.name)} &middot; ${fmtDate(p.date)}</span><${h}>${esc(p.fm.title)}</${h}><p>${esc(p.fm.description)}</p></div></a>`
}

// ---------- post pages
const LINK_BLOCKS = {
  kitchen: ['/c/kitchen-cabinets/', 'Kitchen cabinets'], vanity: ['/c/bathroom-vanities/', 'Bathroom vanities'], closet: ['/c/closets-wardrobes/', 'Closets and wardrobes'],
  doors: ['/door-styles', 'Door styles and finishes'], measure: ['/how-to-measure-your-kitchen', 'How to measure your kitchen'], design: ['/design', 'Design your cabinets'],
}
for (const p of posts) {
  const c = cat(p.fm.category); const { html, headings } = markdown(p.body)
  const url = `${SITE}/news/${p.slug}/`; const canonical = p.fm.canonical || url
  const related = posts.filter((x) => x !== p && (x.fm.category === p.fm.category || (x.fm.tags || []).some((t) => (p.fm.tags || []).includes(t)))).slice(0, 3)
  const links = (p.fm.links || []).map((k) => LINK_BLOCKS[k]).filter(Boolean)
  const img = p.fm.hero ? abs(p.fm.hero) : SITE + '/og-home.jpg'
  const toc = headings.filter((h) => h.lvl === 2).length >= 4 ? `<nav class="nw-toc" aria-label="In this post"><b>In this post</b><ol>${headings.filter((h) => h.lvl === 2).map((h) => `<li><a href="#${h.id}">${esc(h.text)}</a></li>`).join('')}</ol></nav>` : ''
  const main = `<article class="nw-post" itemscope itemtype="https://schema.org/BlogPosting">${crumbsHtml([['Home', '/'], ['News', '/news/'], [c.name, `/news/category/${c.slug}/`], [p.fm.title, `/news/${p.slug}/`]])}` +
    `<header><span class="nw-meta"><a href="/news/category/${c.slug}/">${esc(c.name)}</a></span><h1 itemprop="headline">${esc(p.fm.title)}</h1><p class="nw-meta">By ${esc(p.fm.author || 'The Local Cabinetry')} &middot; <time datetime="${p.date}" itemprop="datePublished">${fmtDate(p.date)}</time>${p.updated !== p.date ? ` &middot; Updated <time datetime="${p.updated}" itemprop="dateModified">${fmtDate(p.updated)}</time>` : ''}</p></header>` +
    (p.fm.hero ? `<figure class="nw-hero"><img src="${esc(p.fm.hero)}" alt="${esc(p.fm.hero_alt)}" width="${p.fm.hero_w || 1200}" height="${p.fm.hero_h || 800}" fetchpriority="high" decoding="async"></figure>` : '') +
    toc + `<div class="nw-prose" itemprop="articleBody">${html}` +
    `<aside class="nw-cta"><h2>Plan yours with us</h2><p>Tell us the room and the size, and we draw the layout with you and send an estimate. Free design help, and the standard price list is the same for everyone.</p><a class="btn" href="/design">Design your cabinets</a></aside>` +
    (links.length ? `<h2>Related pages</h2><ul>${links.map((l) => `<li><a href="${l[0]}">${esc(l[1])}</a></li>`).join('')}</ul>` : '') + `</div></article>` +
    (related.length ? `<section class="nw nw-rel" aria-labelledby="rel"><h2 id="rel">More from the news</h2><div class="nw-grid">${related.map((r) => card(r, 'h3')).join('')}</div></section>` : '')
  const ld = [ORG, { '@type': 'WebSite', '@id': SITE + '/#website', name: 'The Local Cabinetry', url: SITE + '/', publisher: { '@id': SITE + '/#organization' } },
    { '@type': 'BlogPosting', '@id': url + '#post', headline: p.fm.title, description: p.fm.description, datePublished: p.date, dateModified: p.updated, mainEntityOfPage: canonical, url: canonical, image: [img], author: { '@type': 'Organization', name: p.fm.author || 'The Local Cabinetry', url: SITE + '/' }, publisher: { '@id': SITE + '/#organization' }, articleSection: c.name, keywords: (p.fm.tags || []).join(', '), inLanguage: 'en-US', wordCount: wordCount(p.body) },
    crumbsLd([['Home', '/'], ['News', '/news/'], [c.name, `/news/category/${c.slug}/`], [p.fm.title, `/news/${p.slug}/`]])]
  put(`news/${p.slug}/index.html`, page({ title: p.fm.title, description: p.fm.description, canonical, ogType: 'article', ogImage: img, jsonld: ld, main, extraHead: `<meta property="article:published_time" content="${p.date}"><meta property="article:modified_time" content="${p.updated}"><meta property="article:section" content="${esc(c.name)}">` }))
}

// ---------- index, pagination, categories
function listing({ base, title, intro, list, pageNo, pages, catSlug }) {
  const url = pageNo === 1 ? `${SITE}${base}` : `${SITE}${base}page/${pageNo}/`
  const cats = `<nav class="nw-cats" aria-label="Categories"><a href="/news/"${!catSlug ? ' aria-current="page"' : ''}>All</a>${CATEGORIES.map((x) => `<a href="/news/category/${x.slug}/"${catSlug === x.slug ? ' aria-current="page"' : ''}>${esc(x.name)}</a>`).join('')}</nav>`
  const slice = list.slice((pageNo - 1) * PER_PAGE, pageNo * PER_PAGE)
  const pager = pages > 1 ? `<nav class="nw-pager" aria-label="Pages">${Array.from({ length: pages }, (_, i) => i + 1).map((n) => (n === pageNo ? `<span aria-current="page">${n}</span>` : `<a href="${n === 1 ? base : base + 'page/' + n + '/'}">${n}</a>`)).join('')}</nav>` : ''
  const main = `<div class="nw"><div class="nw-head">${crumbsHtml(catSlug ? [['Home', '/'], ['News', '/news/'], [title, base]] : [['Home', '/'], ['News', '/news/']])}<h1>${esc(title)}</h1><p>${esc(intro)}</p>${cats}</div>` +
    (slice.length ? `<div class="nw-grid">${slice.map((p) => card(p)).join('')}</div>${pager}` : `<p class="nw-empty">No posts here yet. Check back soon, or <a href="/design">start your own design</a>.</p>`) + '</div>'
  const ld = [ORG, { '@type': 'CollectionPage', '@id': url, name: title, description: intro, url, isPartOf: { '@id': SITE + '/#website' } },
    crumbsLd(catSlug ? [['Home', '/'], ['News', '/news/'], [title, base]] : [['Home', '/'], ['News', '/news/']])]
  const prev = pageNo > 1 ? `<link rel="prev" href="${pageNo === 2 ? SITE + base : SITE + base + 'page/' + (pageNo - 1) + '/'}">` : ''
  const next = pageNo < pages ? `<link rel="next" href="${SITE}${base}page/${pageNo + 1}/">` : ''
  return { path: pageNo === 1 ? `${base.slice(1)}index.html` : `${base.slice(1)}page/${pageNo}/index.html`, html: page({ title: pageNo > 1 ? `${title}, page ${pageNo}` : title, description: intro, canonical: url, jsonld: ld, main, noindex: !list.length, extraHead: prev + next }) }
}
const pagesOf = (n) => Math.max(1, Math.ceil(n / PER_PAGE))
const NEWS_INTRO = 'Guides, projects and product news from The Local Cabinetry: how to measure, how to plan, and what goes into our cabinets.'
for (let n = 1; n <= pagesOf(posts.length); n++) { const r = listing({ base: '/news/', title: 'News', intro: NEWS_INTRO, list: posts, pageNo: n, pages: pagesOf(posts.length) }); put(r.path, r.html) }
for (const c of CATEGORIES) {
  const list = posts.filter((p) => p.fm.category === c.slug)
  for (let n = 1; n <= pagesOf(list.length); n++) { const r = listing({ base: `/news/category/${c.slug}/`, title: c.name, intro: c.blurb, list, pageNo: n, pages: pagesOf(list.length), catSlug: c.slug }); put(r.path, r.html) }
}

// ---------- feeds
const feedPosts = posts.slice(0, 20)
const rfc = (d) => new Date(d + 'T12:00:00Z').toUTCString()
put('news/rss.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>The Local Cabinetry news</title><link>${SITE}/news/</link><description>${esc(NEWS_INTRO)}</description><language>en-us</language><atom:link href="${SITE}/news/rss.xml" rel="self" type="application/rss+xml"/>` +
  (feedPosts[0] ? `<lastBuildDate>${rfc(feedPosts[0].updated)}</lastBuildDate>` : '') +
  feedPosts.map((p) => `<item><title>${esc(p.fm.title)}</title><link>${SITE}/news/${p.slug}/</link><guid isPermaLink="true">${SITE}/news/${p.slug}/</guid><pubDate>${rfc(p.date)}</pubDate><category>${esc(cat(p.fm.category).name)}</category><description>${esc(p.fm.description)}</description></item>`).join('') + '</channel></rss>\n')
put('news/atom.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom"><title>The Local Cabinetry news</title><link href="${SITE}/news/atom.xml" rel="self"/><link href="${SITE}/news/"/><id>${SITE}/news/</id><updated>${feedPosts[0] ? feedPosts[0].updated + 'T12:00:00Z' : '2026-01-01T00:00:00Z'}</updated><author><name>The Local Cabinetry</name></author>` +
  feedPosts.map((p) => `<entry><title>${esc(p.fm.title)}</title><link href="${SITE}/news/${p.slug}/"/><id>${SITE}/news/${p.slug}/</id><published>${p.date}T12:00:00Z</published><updated>${p.updated}T12:00:00Z</updated><summary>${esc(p.fm.description)}</summary></entry>`).join('') + '</feed>\n')

// ---------- sitemap-news.xml (+ one line in sitemap-index.xml)
const smUrls = [{ loc: `${SITE}/news/`, lastmod: posts[0] ? posts[0].updated : null }]
for (let n = 2; n <= pagesOf(posts.length); n++) smUrls.push({ loc: `${SITE}/news/page/${n}/`, lastmod: posts[0].updated })
for (const c of CATEGORIES) { const l = posts.filter((p) => p.fm.category === c.slug); if (l.length) smUrls.push({ loc: `${SITE}/news/category/${c.slug}/`, lastmod: l[0].updated }) }
for (const p of posts) smUrls.push({ loc: `${SITE}/news/${p.slug}/`, lastmod: p.updated })
put('sitemap-news.xml', `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${smUrls.map((u) => `<url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('')}</urlset>`)
let idx = read('sitemap-index.xml')
if (!idx.includes('sitemap-news.xml')) idx = idx.replace('</sitemapindex>', `<sitemap><loc>${SITE}/sitemap-news.xml</loc></sitemap></sitemapindex>`)
put('sitemap-index.xml', idx)

// ---------- marked blocks inside existing files (home page block, llms.txt block)
const mark = (file, name, inner) => {
  const re = new RegExp(`(<!--${name}-->)[\\s\\S]*?(<!--/${name}-->)`)
  let s = OUT.has(file) ? OUT.get(file) : read(file)
  if (!re.test(s)) throw new Error(`${file}: marker <!--${name}--> not found`)
  put(file, s.replace(re, `$1${inner}$2`))
}
mark('index.html', 'news-latest', posts.length ? `<section class="nw nw-latest" aria-labelledby="nl"><h2 id="nl">Latest from the news</h2><div class="nw-grid">${posts.slice(0, 3).map((p) => card(p, 'h3')).join('')}</div><a class="nw-more" href="/news/">All news &rarr;</a></section>` : '')
mark('index.html', 'news-css', posts.length ? `<link rel="stylesheet" href="/${cssPath}">` : '')
{ let ll = read('llms.txt'); const re = /<!-- news:start -->[\s\S]*?<!-- news:end -->/
  const block = `<!-- news:start -->\n` + (posts.length ? `\n## News\n\n- [News](${SITE}/news/): guides, projects and product news.\n` + posts.slice(0, 10).map((p) => `- [${p.fm.title}](${SITE}/news/${p.slug}/): ${p.fm.description}`).join('\n') + '\n' : '') + `<!-- news:end -->`
  put('llms.txt', re.test(ll) ? ll.replace(re, block) : ll.replace(/\s*$/, '\n') + block + '\n') }

// ---------- write or check
let bad = 0
for (const [p, c] of OUT) {
  const f = path.join(ROOT, p); const cur = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null
  if (CHECK) { if (cur !== c) { console.error('out of date: ' + p); bad++ } continue }
  if (cur !== c) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, c) }
}
// stale generated post folders (a post that became a draft or was removed must not stay published)
const published = new Set(posts.map((p) => p.slug))
const newsDir = path.join(ROOT, 'news')
if (fs.existsSync(newsDir)) for (const d of fs.readdirSync(newsDir)) {
  if (['page', 'category', 'rss.xml', 'atom.xml', 'index.html'].includes(d)) continue
  if (fs.statSync(path.join(newsDir, d)).isDirectory() && !published.has(d)) { console.error(`${CHECK ? 'stale' : 'STALE (remove by hand, nothing is deleted automatically)'}: news/${d}/ is not a published post`); bad++ }
}
if (CHECK && bad) { console.error(`news: ${bad} problem(s). Run: node scripts/news/build.mjs`); process.exit(1) }
console.log(`news: ${posts.length} published post(s), ${all.length - posts.length} draft(s) skipped, ${OUT.size} files ${CHECK ? 'checked' : 'written'}`)
