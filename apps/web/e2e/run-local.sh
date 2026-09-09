#!/usr/bin/env bash
set -euo pipefail

e2e_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repository_directory="$(cd "${e2e_directory}/../../.." && pwd)"

if [[ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" || -z "${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}" || -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  if ! local_environment="$(cd "${repository_directory}" && corepack pnpm dlx supabase@2.116.0 status --output env 2>/dev/null)"; then
    echo "La stack Supabase locale de ce repository doit être démarrée avant les tests E2E." >&2
    exit 1
  fi

  eval "${local_environment}"

  if [[ -z "${API_URL:-}" || -z "${ANON_KEY:-}" || -z "${SERVICE_ROLE_KEY:-}" ]]; then
    echo "Supabase n’a pas fourni les trois valeurs locales nécessaires aux tests E2E." >&2
    exit 1
  fi

  export NEXT_PUBLIC_SUPABASE_URL="${API_URL}"
  export NEXT_PUBLIC_SUPABASE_ANON_KEY="${ANON_KEY}"
  export SUPABASE_SERVICE_ROLE_KEY="${SERVICE_ROLE_KEY}"
  unset local_environment
fi

cd "${e2e_directory}/.."
unset FORCE_COLOR
exec corepack pnpm exec playwright test "$@"
