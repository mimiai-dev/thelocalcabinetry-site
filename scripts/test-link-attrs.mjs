// node scripts/test-link-attrs.mjs : the link policy (internal same tab; external new tab + noopener noreferrer, no nofollow)
import assert from 'node:assert/strict'
import { fixLinks } from './link-attrs.mjs'
import { markdown } from './news/lib.mjs'
const f = fixLinks
assert.equal(f('<a href="/x">a</a>'), '<a href="/x">a</a>')
assert.equal(f('<a href="/x" target="_blank">a</a>'), '<a href="/x">a</a>')
assert.equal(f('<a href="https://thelocalcabinetry.com/x" target="_blank" rel="noopener">a</a>'), '<a href="https://thelocalcabinetry.com/x" rel="noopener">a</a>')
assert.equal(f('<a href="https://design.thelocalcabinetry.com/design">a</a>'), '<a href="https://design.thelocalcabinetry.com/design">a</a>')
assert.equal(f('<a href="https://www.epa.gov/x">a</a>'), '<a href="https://www.epa.gov/x" target="_blank" rel="noopener noreferrer">a</a>')
assert.equal(f('<a href="https://epa.gov/x" rel="nofollow">a</a>'), '<a href="https://epa.gov/x" target="_blank" rel="noopener noreferrer">a</a>')
assert.equal(f('<a href="https://epa.gov/x" rel="me noopener" target="_self">a</a>'), '<a href="https://epa.gov/x" target="_blank" rel="me noopener noreferrer">a</a>')
const ok = '<a href="https://instagram.com/a" target="_blank" rel="noopener noreferrer" aria-label="x">a</a>'
assert.equal(f(ok), ok)                      // already right: untouched
assert.equal(f(f('<a href="https://a.org/">a</a>')), f('<a href="https://a.org/">a</a>'))   // idempotent
for (const h of ['mailto:a@b.c', 'te' + 'l:1', '#top']) assert.equal(f(`<a href="${h}">a</a>`), `<a href="${h}">a</a>`)
assert.equal(f('<script>var s="<a href=\'https://x.org\'>"</script>'), '<script>var s="<a href=\'https://x.org\'>"</script>')
// a news post: the Sources list comes out with the policy applied, with no hand edit
const { html } = markdown('## Sources\n\n- [EPA](https://www.epa.gov/x)\n- [Design](/design)\n- [Us](https://thelocalcabinetry.com/design)\n')
assert.ok(html.includes('<a href="https://www.epa.gov/x" target="_blank" rel="noopener noreferrer">EPA</a>'))
assert.ok(html.includes('<a href="/design">Design</a>') && html.includes('<a href="https://thelocalcabinetry.com/design">Us</a>'))
console.log('link-attrs ok')
