# Catalog rebuild from the factory catalog (T-261018-11)

`The-Local-Cabinetry-Catalog.pdf` is the 20-page factory catalog (2026 edition; ours per the owner) laid out again in the TLC brand. Same pages, photos, swatches, codes and specifications; brand name, logo, URL and contact are ours; typos fixed. See `DIFF.md` for every text change.

Pipeline (scripts here are as used, with scratchpad paths): `svgall.py` (PyMuPDF `get_svg_image` per page of the source PDF), `matte.py` (finds images whose soft mask has a /Matte entry, so they are un-premultiplied), `recat.py` (recolor, bake masks, swap fonts, brand and typo edits, crop to trim), `topdf.mjs` (headless Chrome prints the 20 inline SVG pages to PDF, fonts from `/fonts/`). The source PDF is not stored here (sha256 in DIFF.md).
The earlier self-built 15-page catalog (sha256 4afb05e2...) is in git history (commit fdd084b).
