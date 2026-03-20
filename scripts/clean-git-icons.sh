#!/bin/bash
# Comprehensive Git Icon file cleanup script
# Removes all Icon\r files from .git directory, clears extended attributes, and verifies git functionality
# These files are created by macOS and can corrupt git references

# Navigate to git root
cd "$(git rev-parse --show-toplevel)" || exit 1

echo "🔍 Checking for Icon files in .git directory..."

# Count files before cleanup
BEFORE=$(find .git -name "*Icon*" -type f 2>/dev/null | wc -l | tr -d ' ')

if [ "$BEFORE" -eq "0" ]; then
  echo "✅ No Icon files found. Git is clean."
  exit 0
fi

echo "⚠️  Found $BEFORE Icon file(s) in .git directory"
echo ""
echo "🗑️  Removing Icon files using Python for robust handling..."

# Python script for robust deletion (handles Icon\r and special characters)
python3 << 'PYTHON_SCRIPT'
import os
import sys

def remove_icon_files(directory):
    removed = 0
    for root, dirs, files in os.walk(directory):
        for filename in files:
            if filename.startswith('Icon') and (filename == 'Icon\r' or filename == 'Icon' or '?' in filename):
                filepath = os.path.join(root, filename)
                try:
                    os.remove(filepath)
                    removed += 1
                except Exception as e:
                    print(f"Error removing {filepath}: {e}", file=sys.stderr)
    return removed

git_dir = '.git'
if os.path.exists(git_dir):
    count = remove_icon_files(git_dir)
    print(f"Removed {count} Icon files")
PYTHON_SCRIPT

# Clear extended attributes recursively
echo ""
echo "🔒 Clearing extended attributes..."
xattr -cr .git 2>/dev/null || true

# Ensure .metadata_never_index exists to prevent future indexing
touch .git/.metadata_never_index

# Verify cleanup
echo ""
echo "🔍 Verifying cleanup..."
AFTER=$(find .git -name "*Icon*" -type f 2>/dev/null | wc -l | tr -d ' ')

if [ "$AFTER" -eq "0" ]; then
  echo "✅ All Icon files removed successfully"
  echo ""
  echo "🧪 Testing git commands..."
  if git status >/dev/null 2>&1; then
    echo "✅ Git is working correctly"
    exit 0
  else
    echo "❌ Git errors still present. Manual intervention may be needed."
    exit 1
  fi
else
  echo "⚠️  Warning: $AFTER Icon file(s) remain. Manual intervention may be needed."
  exit 1
fi
