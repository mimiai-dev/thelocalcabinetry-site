#!/usr/bin/env node
// node --test scripts/news/test-markdown.mjs : the news markdown subset (scripts/news/lib.mjs), tables from the vanity sizes post (2026-11-20: printed as raw "| Check |" text).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { markdown } from './lib.mjs'

const md = `## Clearances to check before ordering

| Check | Recommended | Code minimum |
|---|---|---|
| Clear floor space in front of the vanity | 30 inches | 21 inches |
| Sink center to side wall | 20 inches | 15 inches |
| Between two sink centers | 30 to 36 inches | Not stated |
| Space beside the toilet to a vanity or other fixture | 18 inches | 15 inches |

A few notes on how to use them.`

test('a markdown table builds into a table: header + 4 rows x 3 columns', () => {
  const { html } = markdown(md)
  assert.doesNotMatch(html, /\|---\|/)
  const t = /<table><thead>(.*?)<\/thead><tbody>(.*?)<\/tbody><\/table>/.exec(html)
  assert.ok(t, html)
  assert.equal((t[1].match(/<th>/g) || []).length, 3)
  const rows = t[2].match(/<tr>.*?<\/tr>/g)
  assert.equal(rows.length, 4)
  for (const r of rows) assert.equal((r.match(/<td>/g) || []).length, 3)
  assert.match(html, /<p>A few notes on how to use them.<\/p>/)
})

test('cells are escaped like paragraphs; alignment colons are honoured', () => {
  const { html } = markdown('| a | b |\n|:-:|--:|\n| <x> & y | **z** |')
  assert.match(html, /<td style="text-align:center">&lt;x&gt; &amp; y<\/td><td style="text-align:right"><strong>z<\/strong><\/td>/)
})
