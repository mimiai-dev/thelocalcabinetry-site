# Catalog rebuild from the factory catalog (T-261018-11)

`The-Local-Cabinetry-Catalog.pdf` is the 20-page factory catalog (2026 edition; ours per the owner) laid out again in the TLC brand. Same pages, photos, swatches, codes and specifications; brand name, logo, URL and contact are ours; typos fixed. See `DIFF.md` for every text change.

Pipeline: `svgall.py` (PyMuPDF `get_svg_image` per page of the source PDF), `matte.py` (finds images whose soft mask has a /Matte entry, so they are un-premultiplied), `recat.py` (recolor, bake masks, swap fonts, brand and typo edits, crop to trim), `topdf.mjs` (a private headless Chrome prints the 20 inline SVG pages to PDF). The source PDF is not stored here (sha256 in DIFF.md; in ops it is `services/catalog/media/core/source/luxova-catalog.pdf`).

Run from a build folder holding `cot/source.pdf`, `cot/svg/`, a link `tlc2` to this repo's root and a link `cot/tlc2` to the same root:

    python3 <rebrand>/svgall.py && python3 <rebrand>/matte.py && python3 <rebrand>/recat.py --alibaba
    node <rebrand>/topdf.mjs "$PWD/cot" catalog-alibaba.html out.pdf

Without `--alibaba`, recat writes `cot/catalog.html` (the full catalog); its page 20 still adds the phone line that the published full PDF has redacted (#108).
The earlier self-built 15-page catalog (sha256 4afb05e2...) is in git history (commit fdd084b).
