#!/usr/bin/env bash
# Puts the team's "CreatorClub Dev" signing certificate (a .p12 in CREATORCLUB_DEV_CERT_BASE64, its password in
# CREATORCLUB_DEV_CERT_PASSWORD) into a keychain of its own on a CI Mac, and that keychain on the search list:
# codesign then signs with it by SHA-1 (recorder/app/scripts/sign-creatorclub-dev.cjs), trusted or not.
# Fails unless the imported certificate is the expected one: a different certificate would be published and then
# refused by every installed Mac.
set -euo pipefail
: "${CREATORCLUB_DEV_CERT_BASE64:?}" "${CREATORCLUB_DEV_CERT_PASSWORD:?}" "${CREATORCLUB_SIGN_SHA1:?}"
keychain="${RUNNER_TEMP:-/tmp}/creatorclub-signing.keychain-db"
keychain_pass="$(openssl rand -hex 16)"
security create-keychain -p "$keychain_pass" "$keychain"
security set-keychain-settings -lut 21600 "$keychain"
security unlock-keychain -p "$keychain_pass" "$keychain"
p12="$(mktemp).p12"
trap 'rm -f "$p12"' EXIT
printf '%s' "$CREATORCLUB_DEV_CERT_BASE64" | base64 --decode > "$p12"
security import "$p12" -k "$keychain" -P "$CREATORCLUB_DEV_CERT_PASSWORD" -T /usr/bin/codesign -T /usr/bin/security
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$keychain_pass" "$keychain" >/dev/null
security list-keychains -d user -s "$keychain" $(security list-keychains -d user | tr -d '"')
security find-identity -p codesigning "$keychain" | grep -q "$CREATORCLUB_SIGN_SHA1" || { echo "The imported certificate is not $CREATORCLUB_SIGN_SHA1." >&2; exit 1; }
echo "CreatorClub Dev certificate ready ($CREATORCLUB_SIGN_SHA1)."
