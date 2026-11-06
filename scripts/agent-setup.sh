#!/usr/bin/env bash
# Run once in a fresh agent worktree. node_modules is cloned copy-on-write from the main checkout,
# so a worktree costs almost no disk.
set -euo pipefail
main="$(git worktree list --porcelain | sed -n 's/^worktree //p' | head -1)"
if [ ! -d node_modules ]; then
  cp -cR "$main/node_modules" node_modules
fi
echo "Ready: $(pwd)"
