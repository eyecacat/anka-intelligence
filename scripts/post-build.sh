#!/bin/sh
set -e

ISO_FILE="$(find build -maxdepth 1 -name '*.iso' -print -quit)"

if [ -z "$ISO_FILE" ]; then
  echo "ISO dosyasi bulunamadi." >&2
  exit 1
fi

mkdir -p dist
cp "$ISO_FILE" dist/anka-intelligence.iso
sha256sum dist/anka-intelligence.iso > dist/anka-intelligence.iso.sha256

echo "Cikti: dist/anka-intelligence.iso"
echo "SHA256: dist/anka-intelligence.iso.sha256"
