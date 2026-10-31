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

# Optional: sign with your own certificate (see signing.local.env.example).
SIGN_IDENTITY=""
TEAM_ID=""
NOTARY_PROFILE=""
[ -f "$ROOT/signing.local.env" ] && . "$ROOT/signing.local.env"
# Safari hides a Developer ID app that Apple has not notarized, even with
# "Allow unsigned extensions" on. Without a way to notarize, stay ad hoc.
if [ -n "$SIGN_IDENTITY" ] && [ -z "$NOTARY_PROFILE" ]; then
  echo "signing.local.env has no NOTARY_PROFILE, so this build is ad hoc signed."
  echo "Safari hides a Developer ID app until Apple notarizes it. See signing.local.env.example."
  SIGN_IDENTITY=""
fi
if [ -n "$SIGN_IDENTITY" ] && ! xcrun notarytool history --keychain-profile "$NOTARY_PROFILE" >/dev/null 2>&1; then
  echo "The keychain has no notary profile named \"$NOTARY_PROFILE\". Create it first:" >&2
  echo "  xcrun notarytool store-credentials $NOTARY_PROFILE --apple-id YOUR_APPLE_ID --team-id $TEAM_ID" >&2
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
  result=$(xcrun notarytool submit "$zip" --keychain-profile "$NOTARY_PROFILE" --wait 2>&1) || true
  if ! echo "$result" | grep -q "status: Accepted"; then
    echo "$result" >&2
    echo "Notarization failed. For details: xcrun notarytool log <id> --keychain-profile $NOTARY_PROFILE" >&2
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
if pgrep -xq Safari; then
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

echo "Building $APP_NAME..."
xcodebuild -quiet \
  -project "$ROOT/apps/safari/$APP_NAME/$APP_NAME.xcodeproj" \
  -scheme "$APP_NAME" -configuration Release -destination "generic/platform=macOS" \
  -derivedDataPath "$BUILD_DIR" \
  CODE_SIGN_STYLE=Manual "$@" \
  build
if [ -n "$SIGN_IDENTITY" ]; then
  resign_without_debugging
  notarize
fi

osascript -e "quit app \"$APP_NAME\"" 2>/dev/null || true
mkdir -p "$HOME/Applications"
rm -rf "$DEST"
ditto "$BUILT" "$DEST"
"$LSREGISTER" -f "$DEST"
open "$DEST"

echo "Installed $DEST"
if [ -n "$SIGN_IDENTITY" ]; then
  echo "Next: open Safari, then Settings > Extensions, and select Morning Tab."
else
  echo "Next: open Safari. Then open Develop > Developer Settings and select Allow unsigned extensions."
fi
