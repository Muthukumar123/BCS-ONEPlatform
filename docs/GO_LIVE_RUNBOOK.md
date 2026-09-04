# BCS ONE — Azure Go-Live Runbook

## Target

This runbook brings the current repository online as an **Azure live pilot using synthetic payroll data**. It does not authorize use of real employee/payroll data. Real-data production requires the additional controls listed in the final section.

## Current release topology

```text
Microsoft Entra ID
      |
      v
External Gateway Container App
      |
      v
Internal Orchestrator Container App
      |--------------------> Azure OpenAI / Foundry model deployment
      |
      +--> Internal OPA Policy Container App
      |
      +--> Internal MCP Container App
                    |
                    v
          Synthetic Reference Payroll Adapter
```

All application images are built into Azure Container Registry and are released with the immutable Git commit SHA as the image tag.

## 1. Required Azure permissions for initial bootstrap

Use a human/privileged bootstrap identity for the one-time operations that create role assignments. The normal GitHub Actions identity should remain **Contributor** at the BCS ONE resource-group scope.

The bootstrap operator needs:

- permission to create the resource group and Entra application/federated credential; and
- `Microsoft.Authorization/roleAssignments/write` at the target resource-group/resource scope, normally through **Role Based Access Control Administrator** or an equivalent approved role.

Do not give the GitHub Actions identity permanent Owner/RBAC Administrator rights merely to simplify deployment.

## 2. GitHub OIDC bootstrap

From Azure Cloud Shell or another authenticated Azure CLI environment:

```bash
export AZURE_SUBSCRIPTION_ID='<subscription-id>'
export LOCATION='westeurope'
export RESOURCE_GROUP='rg-bcs-one-dev'
./scripts/bootstrap-azure.sh
```

Configure the GitHub repository variables printed by the script:

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`
- `AZURE_RESOURCE_GROUP`
- `AZURE_LOCATION`

Add `POSTGRES_ADMIN_PASSWORD` as a GitHub Actions secret. This is bootstrap-only; production should migrate PostgreSQL to Entra-based authentication.

## 3. Create or select the Azure OpenAI / Foundry deployment

Create/select an Azure OpenAI-compatible Foundry resource and deploy an approved model in a region where your subscription has quota.

Configure repository variables:

- `AZURE_OPENAI_ENDPOINT` — e.g. `https://<resource>.openai.azure.com`
- `AZURE_OPENAI_MODEL_DEPLOYMENT` — the actual Azure deployment name

Record the resource ID for the next RBAC step:

```bash
export AZURE_OPENAI_RESOURCE_ID='/subscriptions/.../providers/Microsoft.CognitiveServices/accounts/<name>'
```

BCS ONE uses Microsoft Entra / managed identity for inference; API keys are not required by the runtime.

## 4. Deploy foundation once

The **Release live dev pilot** workflow deploys foundation automatically. On its first run it will stop before application release because workload RBAC has not yet been bootstrapped.

Alternatively deploy foundation manually:

```bash
export POSTGRES_ADMIN_PASSWORD='<strong-bootstrap-password>'
az deployment group create \
  --name bcs-one-foundation-dev \
  --resource-group rg-bcs-one-dev \
  --template-file infra/main.bicep \
  --parameters infra/environments/dev.bicepparam \
  --parameters postgresAdminPassword="$POSTGRES_ADMIN_PASSWORD"
```

## 5. One-time workload RBAC bootstrap

Run this with the privileged bootstrap identity after foundation exists:

```bash
export AZURE_SUBSCRIPTION_ID='<subscription-id>'
export RESOURCE_GROUP='rg-bcs-one-dev'
export ENVIRONMENT='dev'
export AZURE_OPENAI_RESOURCE_ID='/subscriptions/.../providers/Microsoft.CognitiveServices/accounts/<name>'
./scripts/bootstrap-rbac.sh
```

This grants the runtime managed identity:

- `AcrPull` on the repository ACR;
- `Key Vault Secrets User` on the BCS ONE vault; and
- `Cognitive Services OpenAI User` on the configured Azure OpenAI resource.

## 6. Microsoft Entra application registration

Create a **single-tenant API application registration** for the first pilot. Expose an API audience and define application roles matching the current policy vocabulary:

- `employee`
- `hr`
- `payroll`

Set GitHub variables:

- `BCS_ENTRA_TENANT_ID`
- `BCS_ENTRA_API_AUDIENCE`

The gateway validates signature, issuer, audience and tenant before creating the trusted internal security context. Development identity headers are disabled in Azure.

For employee self-service, configure an `employee_id` token claim only if your Entra/customer identity model can reliably map it to the BCS canonical employee identifier. Until canonical identity mapping is implemented, use HR/payroll pilot roles rather than claiming employee self-service is production-ready.

## 7. Release the live pilot

GitHub → **Actions** → **Release live dev pilot** → **Run workflow**.

The workflow will:

1. deploy/update Azure foundation;
2. verify `AcrPull` bootstrap;
3. build five immutable images in ACR;
4. deploy internal Policy, MCP, Orchestrator and Reference Payroll services;
5. deploy the external Gateway;
6. print the live gateway URL in the workflow summary.

## 8. Smoke test

Obtain an Entra access token for the BCS ONE API and run:

```bash
export BASE_URL='https://<gateway-fqdn>'
export ACCESS_TOKEN='<entra-access-token>'
export EMPLOYEE_ID='employee-1001'
./scripts/smoke-test.sh
```

For the initial pilot use an account with the `hr` or `payroll` app role so the synthetic employee ID does not depend on unresolved employee identity mapping.

Expected behavior:

- `/healthz` returns HTTP 200;
- invalid/missing tokens are rejected at the gateway;
- authorization is deny-by-default;
- MCP returns synthetic payroll facts with provenance/freshness;
- the orchestrator requests an Azure OpenAI explanation using managed identity;
- the response includes the request correlation ID.

## 9. Operational validation before sharing the URL

Confirm:

- Container Apps revisions are healthy and at minimum one replica each;
- only the Gateway has external ingress;
- ACR admin credentials remain disabled;
- `ALLOW_DEV_HEADERS=false` in Azure;
- Azure OpenAI local/API-key authentication is disabled where supported by the selected resource design;
- Application Insights / Log Analytics receives service logs;
- no access token or HR payload is logged;
- GitHub deployment uses OIDC, not a client secret;
- Azure cost budget/alerts are configured for the pilot resource group;
- the live URL is shared only with intended pilot users.

## 10. What still blocks real HR/payroll production

Do **not** connect real employee/payroll data until these are completed:

1. Real BCS product sandbox/API and reviewed adapter contract.
2. Canonical tenant + employee identity mapping.
3. Durable audit service/outbox and audit reconstruction.
4. Field-level authorization/minimization obligations.
5. Approved retention schedule and DPIA/privacy review where required.
6. Private endpoints/public-network lockdown for Key Vault, Storage and Azure OpenAI according to BCS standards.
7. APIM/WAF/custom-domain design for customer-facing production.
8. PostgreSQL Entra-only authentication, production SKU, backup and restore test.
9. Load/performance validation against documented p95 SLOs.
10. Prompt/tool injection, cross-tenant and authorization bypass security testing.
11. Agent grounding regression suite and zero fabricated regulated-value release gate.
12. Approval/idempotency/reconciliation implementation before any write capability.
13. Production incident runbooks, on-call ownership, alert routing and DR evidence.
14. Branch protection and required CI/security checks on `main`.

The first live milestone should therefore be a controlled synthetic-data pilot. Real-data GA is a separate production-readiness gate.
