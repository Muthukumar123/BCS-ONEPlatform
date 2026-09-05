#!/usr/bin/env bash
set -euo pipefail

: "${AZURE_SUBSCRIPTION_ID:?Set AZURE_SUBSCRIPTION_ID}"
: "${GITHUB_ORG:=Muthukumar123}"
: "${GITHUB_OWNER_ID:=3875126}"
: "${GITHUB_REPO:=BCS-ONEPlatform}"
: "${GITHUB_REPO_ID:=1356417496}"
: "${GITHUB_ENVIRONMENT:=dev}"
: "${LOCATION:=swedencentral}"
: "${RESOURCE_GROUP:=rg-bcs-one-dev}"
: "${APP_NAME:=github-bcs-one-platform}"

az account set --subscription "$AZURE_SUBSCRIPTION_ID"
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" >/dev/null

APP_ID=$(az ad app list --display-name "$APP_NAME" --query '[0].appId' -o tsv)
if [[ -z "$APP_ID" ]]; then
  APP_ID=$(az ad app create --display-name "$APP_NAME" --query appId -o tsv)
fi

OBJECT_ID=$(az ad app show --id "$APP_ID" --query id -o tsv)
SP_OBJECT_ID=$(az ad sp list --filter "appId eq '$APP_ID'" --query '[0].id' -o tsv)
if [[ -z "$SP_OBJECT_ID" ]]; then
  SP_OBJECT_ID=$(az ad sp create --id "$APP_ID" --query id -o tsv)
fi

# GitHub repositories created after 2026-07-15 use immutable OIDC subjects
# containing the repository owner ID and repository ID.
OIDC_SUBJECT="repo:${GITHUB_ORG}@${GITHUB_OWNER_ID}/${GITHUB_REPO}@${GITHUB_REPO_ID}:environment:${GITHUB_ENVIRONMENT}"
FIC_NAME="github-${GITHUB_ENVIRONMENT}-immutable"

cat > /tmp/bcs-one-fic.json <<JSON
{
  "name": "${FIC_NAME}",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "${OIDC_SUBJECT}",
  "description": "GitHub Actions immutable OIDC for BCS ONE ${GITHUB_ENVIRONMENT} environment",
  "audiences": ["api://AzureADTokenExchange"]
}
JSON

EXISTING_FIC=$(az ad app federated-credential list --id "$OBJECT_ID" --query "[?name=='${FIC_NAME}'].name | [0]" -o tsv)
if [[ -z "$EXISTING_FIC" ]]; then
  az ad app federated-credential create --id "$OBJECT_ID" --parameters /tmp/bcs-one-fic.json >/dev/null
fi

az role assignment create \
  --assignee-object-id "$SP_OBJECT_ID" \
  --assignee-principal-type ServicePrincipal \
  --role Contributor \
  --scope "/subscriptions/${AZURE_SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP}" \
  >/dev/null 2>&1 || true

TENANT_ID=$(az account show --query tenantId -o tsv)

echo "Configure these GitHub repository variables:"
echo "AZURE_CLIENT_ID=$APP_ID"
echo "AZURE_TENANT_ID=$TENANT_ID"
echo "AZURE_SUBSCRIPTION_ID=$AZURE_SUBSCRIPTION_ID"
echo "AZURE_RESOURCE_GROUP=$RESOURCE_GROUP"
echo "AZURE_LOCATION=$LOCATION"
echo
echo "GitHub OIDC subject: ${OIDC_SUBJECT}"
echo "Add POSTGRES_ADMIN_PASSWORD as a GitHub Actions secret."
