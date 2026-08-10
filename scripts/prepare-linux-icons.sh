#!/usr/bin/env bash
set -euo pipefail

SOURCE_ICON="${1:-assets/logo.jpg}"
OUTPUT_DIR="${2:-build/icons}"

if [[ ! -f "$SOURCE_ICON" ]]; then
  echo "Linux icon source not found: $SOURCE_ICON" >&2
  exit 1
fi

if command -v magick >/dev/null 2>&1; then
  IMAGE_TOOL="magick"
elif command -v convert >/dev/null 2>&1; then
  IMAGE_TOOL="convert"
else
  echo "ImageMagick is required to prepare Linux PNG icons." >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
rm -f "$OUTPUT_DIR"/*.png

for SIZE in 16 24 32 48 64 96 128 256 512; do
  "$IMAGE_TOOL" "$SOURCE_ICON" \
    -auto-orient \
    -resize "${SIZE}x${SIZE}^" \
    -gravity center \
    -extent "${SIZE}x${SIZE}" \
    -strip \
    "$OUTPUT_DIR/${SIZE}x${SIZE}.png"
done

for SIZE in 16 24 32 48 64 96 128 256 512; do
  ICON="$OUTPUT_DIR/${SIZE}x${SIZE}.png"
  if [[ ! -s "$ICON" ]]; then
    echo "Linux icon generation failed: $ICON" >&2
    exit 1
  fi
done

echo "Prepared Linux icon set in $OUTPUT_DIR"
