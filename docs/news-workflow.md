# News: how to write and publish a post

The site is static. Posts are Markdown files; a small script turns them into pages. Nothing is published automatically.

## 1. Start a post
    npm run new-post "Your title here"
This creates `content/news/<today>-<slug>.md` as a DRAFT with the front matter and a checklist. Drafts are never written to the site, the sitemap, the feeds, `llms.txt` or the home page.

## 2. Front matter
| field | rule |
|---|---|
| `title` | up to 70 characters, written for people, unique |
| `description` | 70 to 170 characters, unique; it is the meta description and the card text |
| `date`, `updated` | `yyyy-mm-dd`; set `updated` when you change a published post (it becomes `lastmod` in the sitemap and `dateModified` in the page data) |
| `category` | `guides`, `projects`, `product-news` or `company` |
| `tags` | short list, used for related posts |
| `keyword`, `intent` | the main search phrase and what the reader wants (informational, comparison, how-to ...) |
| `hero`, `hero_alt`, `hero_w`, `hero_h` | one of OUR OWN images already in the repo (for example `/accessories/closet.jpg`), with alt text and its real pixel size |
| `links` | blocks of related pages to append: `kitchen`, `vanity`, `closet`, `doors`, `measure`, `design` |
| `canonical` | optional; leave empty unless the post exists elsewhere first |
| `draft` | `true` until it is approved. `false` publishes it |
| `facts_verified` | `true` only after every claim was checked against our approved facts |
| `reviewed_by` | `owner` or `lead`: who approved it |
| `prices_verified` | only `true` if the post shows a price taken from our saved price list |

## 3. Writing rules
- The title is the only h1. In the text use `##` and `###` only (the script refuses a `#`).
- At least 2 `##` headings, at least 350 words, at least 2 internal links in the text.
- Every image needs alt text: `![alt text](/path.jpg "optional caption") {1200x800}` (the size in braces becomes width and height).
- Facts only from our approved list: the warranty sentence (quote it and link `/policies#warranty`, never paraphrase the legal terms), the lead-time sentence ("Lead time is about 7 days. Shipping within the US then takes 3 to 7 days, depending on your location."; for custom work "For custom work we confirm the production time when the order is placed."), 1/2 inch cabinet-grade plywood box with a UV-coated interior and solid-wood dovetailed drawer boxes on the kitchen lines (do not say that about closets), KCMA, CARB2 and TSCA Title VI certified and NGBS Green, RTA means ready to assemble and we do not assemble.
- The standard price list is the same for everyone; members get 10% off all orders (say nothing more about member discounts, and nothing about trade or distributor prices). No prices at all unless they come from our saved price list.
- No images or text from a supplier catalog. Our own photos only.

## 4. Build and check
    node scripts/news/build.mjs      # writes /news/, feeds, sitemap-news.xml, the home block, the llms.txt block
    node scripts/news/check.mjs      # the same gate CI runs
Commit the post AND the generated files together. CI (`check-assets` workflow) runs `check.mjs` and fails when a published post is missing something, a price or banned wording appears, a draft leaks into any output, or the generated files do not match the posts.

## 5. Who approves
The owner or the lead approves a post by setting `reviewed_by` (and the author turns `draft` to `false` in the same pull request). Nobody merges a hand-written post without that approval.

**The automated pipeline** (owner 2026-10-28: three posts a week on random, non-adjacent weekdays) is the one exception. Its posts carry `generated_by: pipeline` and `reviewed_by: gate`, and the gate is their approval:
- `scripts/news/gate.mjs` is the publish gate. Offline rules (CI runs them through `check.mjs` on every published pipeline post): no AI-tell phrasing (a banned-phrase list), at most 2 em dashes, no claim we cannot back (no "made in", no green / eco / NGBS / other certifications; only KCMA, CARB2 and TSCA Title VI), no warranty wording, no phone number, no price, 700 to 1600 words, Flesch-Kincaid grade 9.5 or lower, the keyword in the title or description and the first paragraph, links to `/design` and to a product or category page, images only our own files under `accessories/ closets/ rooms/ kitchens/ vanities/ installs/ doors/`, and a closing `## Sources` section with 2 or more https sources from 2 or more sites. Online rules (the pipeline runs `--online` before it opens the PR): every external link answers, and no run of 10 words is copied from any source page.
- The pipeline itself (topic choice, writing, fact check, schedule, merge) lives in the ops repo, `scripts/news/` (see its `CLAUDE.md`). It opens a PR here and merges it only when the gate and this repo's `check-assets` check pass; a post that fails is left as a draft PR with the gate report and is never merged.
- `reviewed_by: gate` is refused on any post without `generated_by: pipeline`.

## 6. After publishing
Check the live page at 390 and 1280 px, then submit `https://thelocalcabinetry.com/sitemap-index.xml` in Google Search Console and Bing Webmaster Tools if it is not there yet.
