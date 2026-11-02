#!/usr/bin/env bash
# Docs check for pull requests (instructions.md §9, R3): if code or migrations changed, the pull
# request must also change documentation or tests. A prompt for reviewers, not a substitute:
# label the pull request "no-docs-needed" for genuine exceptions such as pure refactors.
set -euo pipefail
base="${1:-origin/main}"
changed=$(git diff --name-only "$base"...HEAD)
code=$(echo "$changed" | grep -E '^(src/|drizzle/migrations/|smoke/|scripts/)' || true)
docs=$(echo "$changed" | grep -E '^(docs/|README\.md|roadmap\.md|AGENTS\.md|db/tests/|e2e/)|\.test\.tsx?$' || true)
if [ -n "$code" ] && [ -z "$docs" ]; then
  echo "Code changed but no documentation or test changed:"
  echo "$code"
  echo 'Update the docs and tests (instructions.md §3, §6), or label the pull request "no-docs-needed".'
  exit 1
fi
echo "docs check ok"
