# Site catalog source
Build (macOS, Google Chrome, Python 3, poppler for the checks), from the repo root:

    cd catalog/src && python3 make_catalog.py 28 && cd ../.. && sh catalog/src/build.sh

`make_catalog.py` writes `index.html` from `data/` (cabinet codes and sizes from our design catalog index, the factory code lists, the finish colours sampled from the factory pages). `build.sh` prints it to `../The-Local-Cabinetry-Catalog.pdf` and `../cover.jpg`.
Fonts: Figtree (variable), SIL OFL 1.1, licence text in `fonts/OFL.txt`. After a build `pdffonts` must list Figtree only. Images are the site's own project photos in /accessories and the logo files in the site root.
