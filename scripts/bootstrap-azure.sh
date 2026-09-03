#!/usr/bin/env bash
set -euo pipefail

: "${AZURE_SUBSCRIPTION_ID:?Set AZURE_SUBSCRIPTION_ID}"
: "${GITHUB_ORG:=Muthukumar123}"
: "${GITHUB_REPO:=BCS-ONEPlatform}"
: "${LOCATION:=westeurope}"
: "${RESOURCE_GROUP:=rg-bcs-one-dev}"
: "${APP_NAME:=github-bcs-one-platform}"

az account set --subscription "$AZURE_SUBSCRIPTION_ID"
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" >/dev/null

APP_ID=$(az ad app create --display-name "$APP_NAME" --query appId -o tsv)
OBJECT_ID=$(az ad app show --id "$APP_ID" --query id -o tsv)
az ad sp create --id "$APP_ID" >/dev/null

cat > /tmp/bcs-one-fic.json <<JSON
{
  "name": "github-main",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:${GITHUB_ORG}/${GITHUB_REPO}:ref:refs/heads/main",
  "description": "GitHub Actions OIDC for BCS ONE main branch",
  "audiences": ["api://AzureADTokenExchange"]
}
JSON

az ad app federated-credential create --id "$OBJECT_ID" --parameters /tmp/bcs-one-fic.json >/dev/null
az role assignment create --assignee "$APP_ID" --role Contributor --scope "/subscriptions/${AZURE_SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP}" >/dev/null

TENANT_ID=$(az account show --query tenantId -o tsv)

echo "Configure these GitHub repository variables:"
echo "AZURE_CLIENT_ID=$APP_ID"
echo "AZURE_TENANT_ID=$TENANT_ID"
echo "AZURE_SUBSCRIPTION_ID=$AZURE_SUBSCRIPTION_ID"
echo "AZURE_RESOURCE_GROUP=$RESOURCE_GROUP"
echo "AZURE_LOCATION=$LOCATION"
echo
echo "Add POSTGRES_ADMIN_PASSWORD as a GitHub Actions secret."
