#!/bin/bash
# Fix macOS file descriptor limits for development

CURRENT_SOFT=$(ulimit -n)
CURRENT_HARD=$(ulimit -Hn)
TARGET_LIMIT=65536

echo "Current soft limit: $CURRENT_SOFT"
echo "Current hard limit: $CURRENT_HARD"

# Only increase if current limit is too low
if [ "$CURRENT_SOFT" -lt "$TARGET_LIMIT" ]; then
  # Try to set to target, but respect hard limit
  if [ "$CURRENT_HARD" != "unlimited" ] && [ "$CURRENT_HARD" -lt "$TARGET_LIMIT" ]; then
    ulimit -n "$CURRENT_HARD"
    echo "Set soft limit to hard limit: $(ulimit -n)"
  else
    ulimit -n "$TARGET_LIMIT" 2>/dev/null || ulimit -n "$CURRENT_HARD"
    echo "Increased soft limit to: $(ulimit -n)"
  fi
else
  echo "Soft limit is already sufficient (>= $TARGET_LIMIT)"
fi

echo ""
echo "File limits ready for development!"
echo "Note: This fix is temporary for this terminal session only."
