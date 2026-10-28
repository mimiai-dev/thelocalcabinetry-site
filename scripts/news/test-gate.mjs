#!/usr/bin/env node
// node --test scripts/news/test-gate.mjs : the publish gate for pipeline posts (scripts/news/gate.mjs) on a clean post and on each kind of failure.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gatePost, gateOnline, readingGrade, sharedRuns } from './gate.mjs'

const fm = { title: 'How to plan a vanity: sizes that fit a small bathroom', description: 'Plan a vanity for a small bathroom: the widths, depths and heights to check before you order.', keyword: 'plan a vanity', hero: '/rooms/bathroom-vanity.jpg', generated_by: 'pipeline', reviewed_by: 'gate' }
const para = 'Measure the wall from corner to corner. Note where the pipes come out of the wall and the floor. Check how far the door swings into the room. Write each number down in inches and take a photo with the tape in the shot. '
const body = `You can plan a vanity in an hour with a tape measure and a photo. Start with the wall, then the pipes, then the door.

## Measure the wall first

${para.repeat(8)}

## Pick the width and depth

${para.repeat(8)} See our [bathroom vanities](/vanities/) or [start your design](/design).

## Sources

- [Bathroom planning guide](https://www.nkba.org/guidelines) on clearances
- [Plumbing basics](https://www.energy.gov/plumbing) on pipe heights
`
const errs = (f = fm, b = body) => gatePost(f, b).errors

test('a clean pipeline post passes', () => { assert.deepEqual(errs(), []) })
test('AI-tell phrasing fails', () => { assert.match(errs(fm, body.replace('Start with the wall', 'Let us delve into the wall')).join(), /AI-tell/) })
test('too many em dashes fail', () => { assert.match(errs(fm, body.replace('Start with', 'Start — with — the — ')).join(), /em dashes/) })
test('unbacked claims fail', () => {
  for (const s of ['Our boxes are made in the USA.', 'An eco-friendly finish.', 'GREENGUARD certified.', 'A lifetime warranty.', 'We assemble every unit.'])
    assert.match(errs(fm, body.replace('Start with the wall', s)).join(), /claim we cannot back/, s)
})
test('certification wording only next to KCMA / CARB2 / TSCA Title VI', () => {
  assert.match(errs(fm, body.replace('Start with the wall', 'Every box is certified.')).join(), /certification wording/)
  assert.doesNotMatch(errs(fm, body.replace('Start with the wall', 'Our cabinets are KCMA certified.')).join(), /certification wording/)
})
test('a phone number fails', () => { assert.match(errs(fm, body.replace('Start with the wall', 'Ring ' + ['713', '555', '0100'].join('-') + ' today.')).join(), /phone/) })
test('a price fails', () => { assert.match(errs(fm, body.replace('Start with the wall', 'It costs $1,200.')).join(), /price/) })
test('too short fails', () => { assert.match(errs(fm, body.replace(para.repeat(8), para).replace(para.repeat(8), para)).join(), /words/) })
test('hard reading level fails', () => { assert.ok(readingGrade('Notwithstanding considerable organizational complications, comprehensive institutional documentation necessitates extraordinarily methodical verification procedures.') > 9.5) })
test('missing /design link fails', () => { assert.match(errs(fm, body.replace('(/design)', '(/contact)')).join(), /\/design/) })
test('missing Sources fails', () => { assert.match(errs(fm, body.slice(0, body.indexOf('## Sources'))).join(), /Sources/) })
test('one source domain fails', () => { assert.match(errs(fm, body.replace('https://www.energy.gov/plumbing', 'https://www.nkba.org/other')).join(), /different sites/) })
test('external link outside Sources fails', () => { assert.match(errs(fm, body.replace('Start with the wall', 'See [this](https://example.com/x)')).join(), /not in the Sources/) })
test('image outside our folders fails', () => { assert.match(errs({ ...fm, hero: '/fonts/x.jpg' }).join(), /photo folders/); assert.match(errs({ ...fm, hero: 'https://cdn.example.com/a.jpg' }).join(), /not from the site repo/) })
test('keyword must be in title/description and first paragraph', () => { assert.match(errs({ ...fm, keyword: 'kitchen island seating' }).join(), /keyword/) })
test('pipeline post must say reviewed_by: gate', () => { assert.match(errs({ ...fm, reviewed_by: 'lead' }).join(), /reviewed_by: gate/) })
test('source quality: a forum fails, no authority fails', () => {
  assert.match(errs(fm, body.replace('https://www.energy.gov/plumbing', 'https://www.reddit.com/r/x')).join(), /not acceptable/)
  assert.match(errs(fm, body.replace('https://www.nkba.org/guidelines', 'https://a-blog.com/x').replace('https://www.energy.gov/plumbing', 'https://b-blog.com/y')).join(), /no source from an authority/)
})
test('body image repeating the hero, and a bare /design, fail', () => {
  assert.match(errs(fm, body.replace('Start with the wall', 'Start.\n\n![A vanity](/rooms/bathroom-vanity.jpg)\n\nWith the wall')).join(), /repeats the hero/)
  assert.match(errs(fm, body.replace('Start with the wall', 'Or start at /design and send it')).join(), /bare text/)
})
test('copied text is found', () => { assert.equal(sharedRuns('we measure the wall from corner to corner and note where the pipes come out', 'Guide: Measure the wall from corner to corner and note where the pipes come out of it.').length, 1) })
test('online: dead link and copied text fail, robot refusal warns', async () => {
  const pages = { 'https://www.nkba.org/guidelines': { status: 200, text: '<p>' + para + '</p>' }, 'https://www.energy.gov/plumbing': { status: 404, text: '' } }
  const r = await gateOnline(fm, body, { fetcher: async (u) => pages[u] })
  assert.match(r.errors.join(), /copied text/); assert.match(r.errors.join(), /does not resolve \(404\)/)
  const r2 = await gateOnline(fm, body, { fetcher: async () => ({ status: 403, text: '' }) })
  assert.deepEqual(r2.errors, []); assert.equal(r2.warnings.length, 2)
})
