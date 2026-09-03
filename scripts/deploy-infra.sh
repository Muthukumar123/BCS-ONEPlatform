#!/usr/bin/env bash
set -euo pipefail

ENVIRONMENT=${1:-dev}
: "${AZURE_RESOURCE_GROUP:?Set AZURE_RESOURCE_GROUP}"
: "${POSTGRES_ADMIN_PASSWORD:?Set POSTGRES_ADMIN_PASSWORD}"

az deployment group create \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --template-file infra/main.bicep \
  --parameters "infra/environments/${ENVIRONMENT}.bicepparam" \
  --parameters postgresAdminPassword="$POSTGRES_ADMIN_PASSWORD"
