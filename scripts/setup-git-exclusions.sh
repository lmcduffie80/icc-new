#!/bin/bash
# Additional macOS-specific exclusions for Git directory

cd "$(git rev-parse --show-toplevel)" || exit 1

# Add .git directory to Spotlight exclusion list (requires admin password)
echo "🔒 Adding .git to Spotlight exclusions..."
sudo mdutil -i off "$(pwd)/.git" 2>/dev/null || echo "Note: Spotlight exclusion requires admin access"

# Ensure .metadata_never_index exists and has correct attributes
touch .git/.metadata_never_index
xattr -w com.apple.metadata:com_apple_backup_excludeItem com.apple.backupd .git 2>/dev/null || true

# Clear all extended attributes
xattr -cr .git 2>/dev/null || true

echo "✅ Additional exclusions configured"
