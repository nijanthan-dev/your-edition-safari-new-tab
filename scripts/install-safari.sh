#!/bin/sh
# Build the Safari app and install exactly one copy in ~/Applications.
#
# macOS registers every app that Xcode builds, and Safari lists the extension
# of each registered copy. So the build goes to a temporary folder, the app is
# copied to ~/Applications, and the build copy is unregistered and deleted.
# Run it with `pnpm install:safari`.
#
# The release workflow runs it with YOUR_EDITION_OUTPUT=<folder>: then it builds,
# signs and notarizes the app into that folder, and installs nothing.
set -eu
OUTPUT_DIR="${YOUR_EDITION_OUTPUT:-}"

ROOT=$(cd "$(dirname "$0")/.." && pwd)
APP_NAME="Your Edition"
DEST="$HOME/Applications/$APP_NAME.app"
LSREGISTER=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
BUILD_DIR=$(mktemp -d)

# Optional: sign with your own certificate (see signing.local.env.example).
# The release workflow sets these from GitHub secrets instead of the file.
SIGN_IDENTITY="${SIGN_IDENTITY:-}"
TEAM_ID="${TEAM_ID:-}"
NOTARY_PROFILE="${NOTARY_PROFILE:-}"
# Or an App Store Connect API key: the .p8 file, its key ID and the issuer ID.
NOTARY_KEY_PATH="${NOTARY_KEY_PATH:-}"
NOTARY_KEY_ID="${NOTARY_KEY_ID:-}"
NOTARY_ISSUER="${NOTARY_ISSUER:-}"
[ -f "$ROOT/signing.local.env" ] && . "$ROOT/signing.local.env"
# notarytool with this build's sign-in: the API key if there is one, else the keychain profile.
notary() {
  if [ -n "$NOTARY_KEY_PATH" ]; then
    xcrun notarytool "$@" --key "$NOTARY_KEY_PATH" --key-id "$NOTARY_KEY_ID" --issuer "$NOTARY_ISSUER"
  else
    xcrun notarytool "$@" --keychain-profile "$NOTARY_PROFILE"
  fi
}
# Safari hides a Developer ID app that Apple has not notarized, even with
# "Allow unsigned extensions" on. Without a way to notarize, stay ad hoc.
if [ -n "$SIGN_IDENTITY" ] && [ -z "$NOTARY_KEY_PATH" ] && [ -z "$NOTARY_PROFILE" ]; then
  echo "There is no notary profile or API key, so this build is ad hoc signed."
  echo "Safari hides a Developer ID app until Apple notarizes it. See signing.local.env.example."
  SIGN_IDENTITY=""
fi
if [ -n "$SIGN_IDENTITY" ] && ! notary history >/dev/null 2>&1; then
  echo "notarytool cannot sign in with these notary credentials." >&2
  echo "For a keychain profile: xcrun notarytool store-credentials NAME --apple-id YOUR_APPLE_ID --team-id $TEAM_ID" >&2
  exit 1
fi
if [ -n "$SIGN_IDENTITY" ]; then
  echo "Signing with your certificate (team $TEAM_ID)."
  set -- CODE_SIGN_IDENTITY="$SIGN_IDENTITY" DEVELOPMENT_TEAM="$TEAM_ID" OTHER_CODE_SIGN_FLAGS=--timestamp
else
  # An ad hoc signature: Safari accepts it once "Allow unsigned extensions" is on.
  set -- CODE_SIGN_IDENTITY=- DEVELOPMENT_TEAM=
fi
BUILT="$BUILD_DIR/Build/Products/Release/$APP_NAME.app"

# One version for the manifest, the app and the extension: the latest release
# tag (vX.Y.Z), else package.json. Each install gets a new build number, so
# macOS never sees two different apps with the same version and build.
git -C "$ROOT" fetch --tags --quiet 2>/dev/null || true
# The release workflow passes the version it is about to tag.
VERSION="${YOUR_EDITION_VERSION:-}"
[ -n "$VERSION" ] || VERSION=$(git -C "$ROOT" tag --list 'v[0-9]*.[0-9]*.[0-9]*' | sed 's/^v//' | sort -V | tail -1)
[ -n "$VERSION" ] || VERSION=$(node -p "require('$ROOT/apps/extension/package.json').version")
BUILD_NUMBER=$(date +%Y%m%d%H%M)

# Xcode adds get-task-allow (debuggers may attach) even to this signed Release
# build. Sign each bundle again, inside out, with the same entitlements minus that one.
resign_without_debugging() {
  for bundle in "$BUILT/Contents/PlugIns/$APP_NAME Extension.appex" "$BUILT"; do
    entitlements="$BUILD_DIR/entitlements.plist"
    codesign -d --entitlements :- "$bundle" > "$entitlements" 2>/dev/null
    /usr/libexec/PlistBuddy -c "Delete :com.apple.security.get-task-allow" "$entitlements" 2>/dev/null || true
    codesign --force --options runtime --timestamp \
      --entitlements "$entitlements" --sign "$SIGN_IDENTITY" "$bundle" 2>/dev/null
  done
  codesign --verify --deep --strict "$BUILT"
}

# Send the signed app to Apple's notary service, then attach the ticket.
notarize() {
  zip="$BUILD_DIR/notarize.zip"
  ditto -c -k --keepParent "$BUILT" "$zip"
  echo "Sending the app to Apple for notarization. This takes 2 to 5 minutes..."
  result=$(notary submit "$zip" --wait 2>&1) || true
  if ! echo "$result" | grep -q "status: Accepted"; then
    echo "$result" >&2
    echo "Notarization failed. For details, run notarytool log with the submission ID above." >&2
    exit 1
  fi
  xcrun stapler staple -q "$BUILT"
  spctl --assess --type exec "$BUILT"
}

cleanup() {
  "$LSREGISTER" -u "$BUILT" 2>/dev/null || true
  rm -rf "$BUILD_DIR"
}
trap cleanup EXIT

# Safari 27 can crash when an extension's app is replaced while Safari runs: it
# loads the extension again and inserts a toolbar item that is already there.
if [ -z "$OUTPUT_DIR" ] && pgrep -xq Safari; then
  if [ -t 0 ]; then
    printf "Safari is open. Replacing the app now can crash Safari. Quit Safari and continue? [y/N] "
    read -r answer
    case "$answer" in
      [yY]*) osascript -e 'quit app "Safari"' ;;
      *) echo "Stopped. Quit Safari, then run this again."; exit 1 ;;
    esac
    while pgrep -xq Safari; do sleep 1; done
  else
    echo "Safari is open. Quit Safari, then run this again." >&2
    exit 1
  fi
fi

echo "Building the extension bundle (version $VERSION, build $BUILD_NUMBER)..."
WXT_LOG="$BUILD_DIR/wxt.log"
(cd "$ROOT/apps/extension" && YOUR_EDITION_VERSION="$VERSION" ./node_modules/.bin/wxt build -b safari --mv3) \
  >"$WXT_LOG" 2>&1 || { cat "$WXT_LOG" >&2; exit 1; }

echo "Building $APP_NAME..."
# Xcode prints harmless notes on every build. Show its output only when it fails.
XCODE_LOG="$BUILD_DIR/xcodebuild.log"
xcodebuild -quiet \
  -project "$ROOT/apps/safari/$APP_NAME/$APP_NAME.xcodeproj" \
  -scheme "$APP_NAME" -configuration Release -destination "generic/platform=macOS" \
  -derivedDataPath "$BUILD_DIR" \
  CODE_SIGN_STYLE=Manual "$@" \
  MARKETING_VERSION="$VERSION" CURRENT_PROJECT_VERSION="$BUILD_NUMBER" \
  build >"$XCODE_LOG" 2>&1 || { cat "$XCODE_LOG" >&2; exit 1; }
if [ -n "$SIGN_IDENTITY" ]; then
  resign_without_debugging
  notarize
fi

if [ -n "$OUTPUT_DIR" ]; then
  mkdir -p "$OUTPUT_DIR"
  rm -rf "$OUTPUT_DIR/$APP_NAME.app"
  ditto "$BUILT" "$OUTPUT_DIR/$APP_NAME.app"
  # On a Mac with Safari, an extra registered copy shows a second Your Edition.
  "$LSREGISTER" -u "$OUTPUT_DIR/$APP_NAME.app" 2>/dev/null || true
  echo "Built $OUTPUT_DIR/$APP_NAME.app (version $VERSION, build $BUILD_NUMBER)"
  exit 0
fi

osascript -e "quit app \"$APP_NAME\"" 2>/dev/null || true
# The app was called Morning Tab before. It has the same bundle ID, so Safari
# would list both copies: remove the old one.
OLD_APP="$HOME/Applications/Morning Tab.app"
if [ -d "$OLD_APP" ]; then
  osascript -e 'quit app "Morning Tab"' 2>/dev/null || true
  "$LSREGISTER" -u "$OLD_APP" 2>/dev/null || true
  rm -rf "$OLD_APP"
  echo "Removed the old Morning Tab app."
fi
mkdir -p "$HOME/Applications"
rm -rf "$DEST"
ditto "$BUILT" "$DEST"
"$LSREGISTER" -f "$DEST"
open "$DEST"

echo "Installed $DEST (version $VERSION, build $BUILD_NUMBER)"
if [ -n "$SIGN_IDENTITY" ]; then
  echo "Next: open Safari, then Settings > Extensions, and select Your Edition."
else
  echo "Next: open Safari. Then open Develop > Developer Settings and select Allow unsigned extensions."
fi
