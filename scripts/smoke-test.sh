#!/usr/bin/env bash
set -euo pipefail

: "${BASE_URL:?Set BASE_URL, for example https://bcsone-dev-gateway.example.azurecontainerapps.io}"
: "${ACCESS_TOKEN:?Set ACCESS_TOKEN to a Microsoft Entra access token for the BCS ONE API}"
: "${EMPLOYEE_ID:=employee-1001}"
: "${PERIOD:=2026-08}"

curl --fail --silent --show-error "$BASE_URL/healthz" | jq .

curl --fail --silent --show-error \
  -X POST "$BASE_URL/v1/employee-summary" \
  -H "authorization: Bearer $ACCESS_TOKEN" \
  -H 'content-type: application/json' \
  -d "{\"employeeId\":\"$EMPLOYEE_ID\",\"period\":\"$PERIOD\",\"explain\":true}" | jq .
