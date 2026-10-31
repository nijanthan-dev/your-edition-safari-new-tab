#!/bin/sh
# Build the Safari app and install exactly one copy in ~/Applications.
#
# macOS registers every app that Xcode builds, and Safari lists the extension
# of each registered copy. So the build goes to a temporary folder, the app is
# copied to ~/Applications, and the build copy is unregistered and deleted.
# Run it with `pnpm install:safari` (that builds the extension bundle first).
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
APP_NAME="Morning Tab"
DEST="$HOME/Applications/$APP_NAME.app"
LSREGISTER=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
BUILD_DIR=$(mktemp -d)
BUILT="$BUILD_DIR/Build/Products/Release/$APP_NAME.app"

cleanup() {
  "$LSREGISTER" -u "$BUILT" 2>/dev/null || true
  rm -rf "$BUILD_DIR"
}
trap cleanup EXIT

echo "Building $APP_NAME..."
# An ad hoc signature: Safari accepts it once "Allow unsigned extensions" is on.
xcodebuild -quiet \
  -project "$ROOT/apps/safari/$APP_NAME/$APP_NAME.xcodeproj" \
  -scheme "$APP_NAME" -configuration Release \
  -derivedDataPath "$BUILD_DIR" \
  CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM= \
  build

osascript -e "quit app \"$APP_NAME\"" 2>/dev/null || true
mkdir -p "$HOME/Applications"
rm -rf "$DEST"
ditto "$BUILT" "$DEST"
"$LSREGISTER" -f "$DEST"
open "$DEST"

echo "Installed $DEST"
echo "Next: in Safari, open Develop > Developer Settings and select Allow unsigned extensions."
