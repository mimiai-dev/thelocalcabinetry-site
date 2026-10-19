#!/bin/sh
# Rebuild catalog/The-Local-Cabinetry-Catalog.pdf and catalog/cover.jpg from catalog/src/index.html.
set -e
cd "$(dirname "$0")/../.."
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
"$CHROME" --headless=new --disable-gpu --no-pdf-header-footer --virtual-time-budget=8000 \
  --print-to-pdf=catalog/The-Local-Cabinetry-Catalog.pdf "file://$PWD/catalog/src/index.html"
pdftoppm -f 1 -l 1 -r 70 -jpeg -singlefile catalog/The-Local-Cabinetry-Catalog.pdf catalog/cover
echo "built; fonts in the PDF:"; pdffonts catalog/The-Local-Cabinetry-Catalog.pdf | awk 'NR>2{print $1}' | sed 's/^[A-Z]*+//' | sort -u
