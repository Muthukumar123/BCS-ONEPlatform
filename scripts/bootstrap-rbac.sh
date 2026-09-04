#!/usr/bin/env bash
set -euo pipefail

: "${AZURE_SUBSCRIPTION_ID:?Set AZURE_SUBSCRIPTION_ID}"
: "${RESOURCE_GROUP:=rg-bcs-one-dev}"
: "${ENVIRONMENT:=dev}"
: "${FOUNDATION_DEPLOYMENT:=bcs-one-foundation-${ENVIRONMENT}}"

az account set --subscription "$AZURE_SUBSCRIPTION_ID"

principal_id=$(az deployment group show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$FOUNDATION_DEPLOYMENT" \
  --query 'properties.outputs.workloadIdentityPrincipalId.value' -o tsv)
acr_id=$(az deployment group show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$FOUNDATION_DEPLOYMENT" \
  --query 'properties.outputs.containerRegistryId.value' -o tsv)
kv_id=$(az deployment group show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$FOUNDATION_DEPLOYMENT" \
  --query 'properties.outputs.keyVaultId.value' -o tsv)

if [[ -z "$principal_id" || -z "$acr_id" || -z "$kv_id" ]]; then
  echo 'Required foundation outputs are missing.' >&2
  exit 1
fi

az role assignment create \
  --assignee-object-id "$principal_id" \
  --assignee-principal-type ServicePrincipal \
  --role 'AcrPull' \
  --scope "$acr_id" >/dev/null

az role assignment create \
  --assignee-object-id "$principal_id" \
  --assignee-principal-type ServicePrincipal \
  --role 'Key Vault Secrets User' \
  --scope "$kv_id" >/dev/null

if [[ -n "${AZURE_OPENAI_RESOURCE_ID:-}" ]]; then
  az role assignment create \
    --assignee-object-id "$principal_id" \
    --assignee-principal-type ServicePrincipal \
    --role 'Cognitive Services OpenAI User' \
    --scope "$AZURE_OPENAI_RESOURCE_ID" >/dev/null
else
  echo 'AZURE_OPENAI_RESOURCE_ID not set; OpenAI inference RBAC was not assigned.'
fi

echo 'BCS ONE workload RBAC bootstrap complete.'
