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
- Facts only from our approved list: the warranty sentence (quote it and link `/policies#warranty`, never paraphrase the legal terms), the shipping sentence ("Orders ship within a week of purchase and arrive about a week after dispatch, often sooner"; for custom and own-build items "we confirm the production time when the order is placed"), 1/2 inch cabinet-grade plywood box with a UV-coated interior and solid-wood dovetailed drawer boxes on the kitchen lines (do not say that about closets), KCMA, CARB2 and TSCA Title VI certified and NGBS Green, RTA means ready to assemble and we do not assemble.
- One price for everyone. Nothing about member, trade or distributor prices. No prices at all unless they come from our saved price list.
- No images or text from a supplier catalog. Our own photos only.

## 4. Build and check
    node scripts/news/build.mjs      # writes /news/, feeds, sitemap-news.xml, the home block, the llms.txt block
    node scripts/news/check.mjs      # the same gate CI runs
Commit the post AND the generated files together. CI (`check-assets` workflow) runs `check.mjs` and fails when a published post is missing something, a price or banned wording appears, a draft leaks into any output, or the generated files do not match the posts.

## 5. Who approves
The owner or the lead approves a post by setting `reviewed_by` (and the author turns `draft` to `false` in the same pull request). Nobody merges a post without that approval. There is no scheduled or automatic publishing.

## 6. After publishing
Check the live page at 390 and 1280 px, then submit `https://thelocalcabinetry.com/sitemap-index.xml` in Google Search Console and Bing Webmaster Tools if it is not there yet.
