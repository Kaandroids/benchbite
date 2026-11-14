#!/usr/bin/env bash
# Runs the status function `$1` of the hosted project through the Management API's read-only query,
# as supabase_read_only_user (ADR 0132), and writes its one row, which has `healthy`, to `$2` as
# JSON. Fails with an error annotation when the query fails or returns no status: the row goes to a
# file, not to standard output, which a caller capturing it would keep the annotation in. Reads
# SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_ID, which the runner masks as secrets.
set -euo pipefail

function_name=$1
status_file=$2
[[ "$function_name" =~ ^[a-z_]+$ ]] || { echo "::error::Not a function name: $function_name"; exit 1; }

result="$RUNNER_TEMP/$function_name.json"
http_status=$(curl --silent --show-error --max-time 60 \
  --output "$result" --write-out '%{http_code}' \
  --request POST "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_ID/database/query/read-only" \
  --header "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  --header 'Content-Type: application/json' \
  --data "{\"query\": \"select * from public.$function_name()\"}")
# Any 2xx is a success; the query endpoint currently answers with 201.
if [[ "$http_status" != 2?? ]]; then
  echo "::error::The status query failed with HTTP $http_status"
  exit 1
fi

if ! jq --exit-status '.[0] | select(has("healthy"))' "$result" > "$status_file"; then
  echo "::error::The status query returned no status"
  exit 1
fi
