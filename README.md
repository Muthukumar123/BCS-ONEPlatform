# BCS ONE Platform

BCS ONE is a governed, multi-tenant agentic integration platform for HR, payroll, workforce, benefits and acquired BCS products.

The repository implements the architecture described in [`docs/BCS_ONE_Master_Development_and_Solution_Design.md`](docs/BCS_ONE_Master_Development_and_Solution_Design.md).

## Azure reference platform

The Phase-0 Azure scaffold uses:

- Azure Container Apps for gateway, orchestrator, MCP and adapters.
- Azure OpenAI / Microsoft Foundry model endpoint for language generation.
- Azure Database for PostgreSQL Flexible Server for workflow/configuration state.
- Azure Key Vault for secrets and certificates.
- Azure Container Registry for service images.
- Azure Service Bus for durable asynchronous workflow/outbox messaging.
- Azure Storage for audit/export payloads.
- Azure Monitor, Application Insights and OpenTelemetry for telemetry.
- Azure Virtual Network + Private Endpoints for data/AI services.
- User-assigned Managed Identities and Azure RBAC for workload authentication.

Container Apps is used instead of AKS for the first platform implementation to reduce operational overhead while retaining VNet integration, private-endpoint connectivity and managed identities. AKS remains an option if future workload or platform requirements justify it.

## Repository structure

```text
.
├── apps/
│   └── gateway/                    # External API/experience edge
├── services/
│   ├── orchestrator/               # Policy-aware agent/orchestration service
│   ├── mcp-server/                 # Canonical MCP capability boundary
│   └── adapters/
│       └── reference-payroll/      # Synthetic reference adapter; no BCS data
├── policy/
│   └── rego/                       # OPA authorization policy
├── infra/
│   ├── main.bicep                  # Azure deployment entry point
│   ├── environments/               # Environment parameter files
│   └── modules/                    # Azure infrastructure modules
├── scripts/                        # Azure bootstrap/deployment helpers
├── .github/workflows/              # CI, what-if and dev deployment
└── docs/                           # Master architecture + Azure notes
```

## Development security boundary

The sample gateway can accept development identity headers only when `ALLOW_DEV_HEADERS=true`. This is deliberately disabled by default. Production must terminate OIDC/OAuth2 at the approved edge and create the trusted tenant/user context from validated claims.

The model is never allowed to provide the trusted tenant identity. The MCP service removes model-supplied tenant identifiers and uses the internal security context forwarded by the trusted application tier.

## Local development

Prerequisites: Node.js 22+, pnpm 9+, Docker.

```bash
corepack enable
pnpm install
pnpm build
```

Start the reference services in separate shells:

```bash
pnpm --filter @bcs-one/reference-payroll dev
pnpm --filter @bcs-one/mcp-server dev
pnpm --filter @bcs-one/orchestrator dev
ALLOW_DEV_HEADERS=true pnpm --filter @bcs-one/gateway dev
```

Example request:

```bash
curl -X POST http://localhost:3000/v1/employee-summary \
  -H 'content-type: application/json' \
  -H 'x-bcs-tenant-id: tenant-demo' \
  -H 'x-bcs-user-id: employee-1001' \
  -H 'x-bcs-roles: employee' \
  -H 'x-bcs-purpose: self-service' \
  -d '{"employeeId":"employee-1001","period":"2026-08","explain":false}'
```

The reference payroll adapter returns synthetic data only.

## Azure deployment

See [`infra/README.md`](infra/README.md).

High level:

1. Run `scripts/bootstrap-azure.sh` once to create the resource group and GitHub OIDC identity.
2. Configure the GitHub repository variables printed by the script.
3. Add `POSTGRES_ADMIN_PASSWORD` as a GitHub Actions secret for the bootstrap database administrator.
4. Run **Deploy dev** from GitHub Actions.
5. Deploy/configure an approved Azure OpenAI model deployment and set the deployment name used by the orchestrator.

For production, move PostgreSQL to Entra-only database authentication after bootstrap and enable zone redundancy/production SKU settings.

## Status

This is a Phase-0 implementation scaffold. It is intended to provide a secure structure, infrastructure baseline, runnable synthetic path and CI/CD foundation. Product adapters, customer identity mappings, final policy rules, production model deployments and legal retention settings require BCS-specific input before production use.
