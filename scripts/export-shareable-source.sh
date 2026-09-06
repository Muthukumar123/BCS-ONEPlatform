#!/usr/bin/env bash
# Build a reviewer-friendly source tree from files already tracked by Git.
#
# Why this exists:
# - reviewers sometimes need a source bundle without repository history;
# - local .env files, tokens and build output must never be copied accidentally;
# - the external-review profile deliberately removes environment/repository
#   operating details while retaining the application and architecture code.
#
# Usage:
#   ./scripts/export-shareable-source.sh internal ./out/bcs-one-source
#   ./scripts/export-shareable-source.sh external-review ./out/bcs-one-source

set -euo pipefail

PROFILE="${1:-external-review}"
OUTPUT_DIR="${2:-./out/bcs-one-source}"

case "$PROFILE" in
  internal|external-review) ;;
  *)
    echo "Unsupported profile: $PROFILE" >&2
    echo "Expected: internal or external-review" >&2
    exit 2
    ;;
esac

# Require a Git working tree because git archive is the protection that prevents
# untracked local secrets and developer files from entering the bundle.
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || {
  echo "Run this script from inside the BCS ONE Git repository." >&2
  exit 2
}

REPO_ROOT="$(git rev-parse --show-toplevel)"
COMMIT_SHA="$(git rev-parse HEAD)"
SHORT_SHA="$(git rev-parse --short=12 HEAD)"
GENERATED_AT="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"

rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

# Export only tracked files at HEAD. This deliberately ignores local untracked
# .env files, downloaded logs, node_modules and other workstation state.
git -C "$REPO_ROOT" archive --format=tar HEAD | tar -xf - -C "$OUTPUT_DIR"

# Build/cache folders should not normally be tracked, but remove them defensively
# so a future repository change cannot silently make them part of a review pack.
find "$OUTPUT_DIR" -type d \( \
  -name node_modules -o \
  -name dist -o \
  -name coverage -o \
  -name .turbo -o \
  -name .pnpm-store \
\) -prune -exec rm -rf {} + 2>/dev/null || true

if [[ "$PROFILE" == "external-review" ]]; then
  # External reviewers need architectural source, not repository administration,
  # environment-specific parameters or operational bootstrap helpers.
  rm -rf \
    "$OUTPUT_DIR/.github" \
    "$OUTPUT_DIR/infra/environments"

  rm -f "$OUTPUT_DIR"/.env "$OUTPUT_DIR"/.env.*

  if [[ -d "$OUTPUT_DIR/scripts" ]]; then
    # Keep this export script and remove operational Azure bootstrap/deploy helpers.
    find "$OUTPUT_DIR/scripts" -maxdepth 1 -type f ! -name 'export-shareable-source.sh' -delete
  fi
fi

# Fail fast on credential material that should never be committed. The patterns
# intentionally target high-confidence secret formats rather than ordinary words
# such as "password" that legitimately appear in documentation/config schemas.
if grep -RIlE \
  --exclude='SOURCE_BUNDLE_MANIFEST.txt' \
  --exclude='*.md' \
  -- '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9_]{30,}|sk-[A-Za-z0-9_-]{20,}' \
  "$OUTPUT_DIR" >/tmp/bcs-one-secret-scan.txt 2>/dev/null; then
  echo "Potential credential material detected; refusing to create a shareable bundle:" >&2
  cat /tmp/bcs-one-secret-scan.txt >&2
  exit 3
fi

cat > "$OUTPUT_DIR/SOURCE_BUNDLE_MANIFEST.txt" <<EOF
BCS ONE source review bundle
============================
profile: $PROFILE
commit: $COMMIT_SHA
short_commit: $SHORT_SHA
generated_utc: $GENERATED_AT
source: tracked Git files only

Start with:
- README.md
- docs/CODE_WALKTHROUGH.md
- docs/SHARING_SOURCE_CODE.md

Data boundary:
- Azure runtime/integration path is live in the pilot environment.
- Employer/employee/product business records are synthetic reference data.
- No runtime credentials are intentionally included in this bundle.
EOF

# Produce a stable file inventory for review/audit. Sort order makes comparison
# between two exported commits straightforward.
(
  cd "$OUTPUT_DIR"
  find . -type f -print | LC_ALL=C sort > SOURCE_BUNDLE_FILES.txt
)

echo "Created $PROFILE source bundle from $COMMIT_SHA at $OUTPUT_DIR"
