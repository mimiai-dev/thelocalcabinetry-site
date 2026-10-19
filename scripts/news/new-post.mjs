#!/usr/bin/env node
// npm run new-post "<title>"  ->  content/news/<date>-<slug>.md as a DRAFT with front matter and a checklist. Nothing is published.
import fs from 'node:fs'
import path from 'node:path'
import { slugify, CATEGORIES } from './lib.mjs'
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..')
const title = process.argv.slice(2).join(' ').trim()
if (!title) { console.error('usage: npm run new-post "<title>"'); process.exit(1) }
const date = new Date().toISOString().slice(0, 10)
const slug = slugify(title)
const file = path.join(ROOT, 'content/news', `${date}-${slug}.md`)
if (fs.existsSync(file)) { console.error('already exists: ' + file); process.exit(1) }
fs.mkdirSync(path.dirname(file), { recursive: true })
fs.writeFileSync(file, `---
title: ${title}
description: 
date: ${date}
updated: ${date}
author: The Local Cabinetry
category: guides
tags: []
keyword: 
intent: informational
hero: 
hero_alt: 
hero_w: 1200
hero_h: 800
links: [design]
draft: true
facts_verified: false
reviewed_by: 
---
<!--
CHECKLIST (delete this comment when done; the checks in CI refuse to publish until the front matter says so)
[ ] keyword and search intent written in the front matter (keyword, intent)
[ ] title up to 70 characters, description 70 to 170 characters, both unique and written for people
[ ] one idea per post, at least 2 h2 headings, no h1 in the body (the title is the h1), at least 350 words
[ ] at least 2 internal links in the text and links: [kitchen, vanity, closet, doors, measure, design] chosen
[ ] hero image: our own file under /accessories, /closets, /rooms ... with alt text, width and height (hero_w, hero_h); every image in the text has alt text
[ ] facts verified against our approved facts (warranty text from /policies#warranty, shipping sentence, certifications, build details); facts_verified: true
[ ] no prices unless from our saved price list (then prices_verified: true); the standard price list is the same for everyone and members get 10% off all orders (nothing more about member discounts, nothing about trade or distributor prices)
[ ] approved by the owner or the lead: reviewed_by: owner (or lead); then draft: false
-->

## Write the first section here

Write for the reader first. State the answer early, then explain.

## Next section

Link to the relevant pages, for example [how to measure your kitchen](/how-to-measure-your-kitchen) or [our kitchen cabinets](/c/kitchen-cabinets/).
`)
console.log('created ' + path.relative(ROOT, file) + ' (draft). Categories: ' + CATEGORIES.map((c) => c.slug).join(', ') + '\nNext: fill it in, then node scripts/news/build.mjs and node scripts/news/check.mjs')
