# Site catalog source

`index.html` is the single source of `../The-Local-Cabinetry-Catalog.pdf` and `../cover.jpg`.

Build (macOS, needs Google Chrome and Python 3 with Pillow; run from the repo root):

    sh catalog/src/build.sh

Fonts: Figtree (variable), SIL Open Font License 1.1, copyright The Figtree Project Authors
(https://github.com/erikdkennedy/figtree). The licence text ships next to the font in `fonts/OFL.txt`.
Do not use characters Figtree lacks (for example the inch mark U+2033): the PDF would embed a
fallback system font. After a build, `pdffonts` must list Figtree only.

Images are the site's own files from `doors/`, `kitchens/`, `closets/` and `hero-kitchen.jpg`.
No supplier catalog, photo or text is used. Facts come from the site's door-styles page.
