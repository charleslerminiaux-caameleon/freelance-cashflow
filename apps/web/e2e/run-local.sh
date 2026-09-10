#!/usr/bin/env bash
set -euo pipefail
# CLI pinned by the isolated harness: corepack pnpm dlx supabase@2.116.0 status
repository_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "${repository_directory}"
exec node scripts/run-isolated-tests.mjs e2e
