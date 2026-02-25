#!/bin/bash
# IMP Interactive Music Player - Widget Launcher (Mac/Linux)

DIR="$(cd "$(dirname "$0")" && pwd)"
HTML="$DIR/index.html"
WIDTH=380
HEIGHT=660

echo ""
echo " ============================================="
echo "  IMP Interactive Music Player - Widget Mode"
echo " ============================================="
echo ""

# macOS
if [[ "$OSTYPE" == "darwin"* ]]; then
  CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  if [ -f "$CHROME" ]; then
    echo " Launching with Google Chrome (Mac)..."
    "$CHROME" \
      --app="file://$HTML" \
      --window-size=$WIDTH,$HEIGHT \
      --no-first-run \
      --user-data-dir="$DIR/chrome_profile" &
    echo " Widget launched!"
    exit 0
  fi

  # Try Edge
  EDGE="/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
  if [ -f "$EDGE" ]; then
    echo " Launching with Microsoft Edge (Mac)..."
    "$EDGE" \
      --app="file://$HTML" \
      --window-size=$WIDTH,$HEIGHT \
      --no-first-run \
      --user-data-dir="$DIR/edge_profile" &
    echo " Widget launched!"
    exit 0
  fi

  # Fallback to Safari/default
  echo " Chrome/Edge not found. Opening in default browser..."
  open "$HTML"
  exit 0
fi

# Linux
if command -v google-chrome &> /dev/null; then
  echo " Launching with Google Chrome (Linux)..."
  google-chrome \
    --app="file://$HTML" \
    --window-size=$WIDTH,$HEIGHT \
    --no-first-run \
    --user-data-dir="$DIR/chrome_profile" &
elif command -v chromium-browser &> /dev/null; then
  echo " Launching with Chromium..."
  chromium-browser \
    --app="file://$HTML" \
    --window-size=$WIDTH,$HEIGHT \
    --no-first-run \
    --user-data-dir="$DIR/chrome_profile" &
elif command -v microsoft-edge &> /dev/null; then
  echo " Launching with Microsoft Edge..."
  microsoft-edge \
    --app="file://$HTML" \
    --window-size=$WIDTH,$HEIGHT \
    --no-first-run \
    --user-data-dir="$DIR/edge_profile" &
else
  echo " Chrome/Chromium/Edge not found. Opening in default browser..."
  xdg-open "$HTML"
fi

echo " Widget launched!"
