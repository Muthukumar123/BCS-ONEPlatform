# Azure infrastructure

BCS ONE uses Bicep as the infrastructure-as-code baseline.

## Phase-0 Azure topology

```text
Internet / corporate edge
          |
     API Management* / WAF*
          |
   Azure Container Apps
      gateway (external)
          |
   orchestrator (internal)
      |        |        |
    policy    MCP     Azure OpenAI
               |
        reference adapters

Shared Azure services:
- VNet + delegated Container Apps subnet
- Azure Container Registry
- Key Vault
- PostgreSQL Flexible Server
- Service Bus
- Storage account
- Log Analytics + Application Insights
- User-assigned managed identity
```

`*` API Management / Front Door are kept as production-edge modules to enable when the public ingress and enterprise domain/certificate model are confirmed. The initial dev deployment exposes the Container Apps gateway directly.

## Security defaults

- Data services are designed for private-network access in production.
- Workloads use managed identity and Azure RBAC.
- Key Vault public access is disabled in the production parameter set.
- ACR admin credentials are disabled.
- Container Apps run as internal services except the gateway.
- PostgreSQL password auth is bootstrap-only in this scaffold; move to Entra-only auth before production.

## Deployment

```bash
az login
az account set --subscription <subscription-id>
az group create -n rg-bcs-one-dev -l swedencentral

az deployment group what-if \
  -g rg-bcs-one-dev \
  -f infra/main.bicep \
  -p infra/environments/dev.bicepparam \
  -p postgresAdminPassword='<bootstrap-password>'

az deployment group create \
  -g rg-bcs-one-dev \
  -f infra/main.bicep \
  -p infra/environments/dev.bicepparam \
  -p postgresAdminPassword='<bootstrap-password>'
```

After infrastructure deployment, build/push images to ACR and update the Container Apps image tags through the release workflow.

## Environment progression

- `dev`: low-cost non-HA baseline, external gateway, synthetic adapters.
- `test`: production-like network/security controls with synthetic/contract-test sources.
- `prod`: zone-redundant database where supported, private data/AI endpoints, APIM/Front Door edge, Entra-only DB auth, approval/audit hardening.

## Important

The Bicep scaffold creates platform resources; it does not deploy a production Azure OpenAI model automatically because model availability, version, capacity and quota must be selected for the target subscription/region and validated before rollout.
