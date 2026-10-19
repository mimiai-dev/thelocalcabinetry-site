# Self-hosted fonts

| File | Family | Axes kept | Size |
|---|---|---|---|
| `fraunces-latin-var.woff2` | Fraunces roman | opsz 9 to 144, wght 400 to 600 (SOFT 0, WONK 0) | 58 KB |
| `fraunces-italic-latin-var.woff2` | Fraunces italic | same | 70 KB |
| `hanken-grotesk-latin-var.woff2` | Hanken Grotesk | wght 100 to 900 | 34 KB |

Licence: SIL Open Font License 1.1, texts next to the files (`OFL-Fraunces.txt`, `OFL-HankenGrotesk.txt`). Free to use, embed and redistribute with the licence kept.

Sources: npm `@fontsource-variable/fraunces@5.3.0` (the `latin-full` roman and italic files, "Fraunces Project Authors") and `@fontsource-variable/hanken-grotesk@5.3.0` (`latin-wght-normal`, Hanken Design Co.), both OFL-1.1, via cdn.jsdelivr.net. The Fraunces files were reduced with fontTools `instancer` (pin SOFT=0 and WONK=0, which are the defaults Google Fonts served for the site's old request; limit wght to 400 to 600). Latin subset only; other scripts fall back to the system font.

Use: `fonts.css` has the `@font-face` rules (`font-display: swap`). The site inlines the same rules in each page head and preloads `fraunces-latin-var.woff2`. For the ops `/points` page copy the three woff2 files, serve them as `font/woff2` from the design host and set CSP `font-src 'self'`.
