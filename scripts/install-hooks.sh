#!/usr/bin/env bash
# Run once after cloning to install git hooks into .git/hooks/.
# Usage: bash scripts/install-hooks.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOKS_SRC="$REPO_ROOT/.githooks"
# Use `git rev-parse --git-path hooks` instead of a hardcoded "$REPO_ROOT/.git/hooks"
# so this also works inside a git worktree, where .git is a file, not a directory.
HOOKS_DST="$(git -C "$REPO_ROOT" rev-parse --git-path hooks)"

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
