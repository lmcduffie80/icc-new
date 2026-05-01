#!/usr/bin/env bash
# Run once after cloning to install git hooks into .git/hooks/.
# Usage: bash scripts/install-hooks.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOKS_SRC="$REPO_ROOT/.githooks"
HOOKS_DST="$REPO_ROOT/.git/hooks"

if [ ! -d "$HOOKS_SRC" ]; then
  echo "No .githooks directory found at $HOOKS_SRC — nothing to install."
  exit 0
fi

for hook in "$HOOKS_SRC"/*; do
  name="$(basename "$hook")"
  cp "$hook" "$HOOKS_DST/$name"
  chmod +x "$HOOKS_DST/$name"
  echo "✅ Installed hook: $name"
done

echo "Done."
