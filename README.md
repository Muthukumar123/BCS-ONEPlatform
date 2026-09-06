# BCS ONE Platform

BCS ONE is a governed, multi-tenant AI + MCP integration platform for HR, payroll, workforce, benefits and the wider BCS product portfolio.

The repository implements the architecture described in [`docs/BCS_ONE_Master_Development_and_Solution_Design.md`](docs/BCS_ONE_Master_Development_and_Solution_Design.md).

For a code-review-oriented explanation, start with [`docs/CODE_WALKTHROUGH.md`](docs/CODE_WALKTHROUGH.md). For controlled source sharing, see [`docs/SHARING_SOURCE_CODE.md`](docs/SHARING_SOURCE_CODE.md).

## What is live vs synthetic

The pilot uses a live Azure runtime for identity, policy, orchestration, MCP execution, persistence, telemetry and Azure OpenAI. Employer, employee and product business records are deterministic synthetic reference data; the repository does not contain production BCS customer HR/payroll data.

The platform rule is simple: **systems of record own facts; policy owns authorization; MCP exposes canonical capabilities; Azure OpenAI explains or synthesizes governed evidence.**

## Runtime architecture

```text
Console / API consumer
        |
        v
Entra-authenticated Gateway
        |
        v
OPA + LangGraph Orchestrator
        |
        v
Canonical MCP capabilities
        |
        v
Product adapters
        |
        v
Source-system evidence
        |
        +--> PostgreSQL artifacts / events / checkpoints
        |
        v
Azure OpenAI grounded synthesis
        |
        v
Business response + provenance
```

## Azure reference platform

The current Azure implementation uses:

- Azure Container Apps for Console, Gateway, Orchestrator, MCP, OPA and reference adapters.
- Azure OpenAI / Microsoft Foundry model endpoint for grounded language generation.
- Azure Database for PostgreSQL Flexible Server for durable workflow state, artifacts, events, evaluations and LangGraph checkpoints.
- Azure Key Vault for secrets and certificates.
- Azure Container Registry for service images.
- Azure Service Bus and Azure Storage as platform foundation services for future durable write/audit flows.
- Azure Monitor / Log Analytics for runtime telemetry.
- Azure Virtual Network integration for the application/data plane.
- User-assigned Managed Identity and Azure RBAC for workload authentication.

Container Apps is used instead of AKS for the current platform implementation to reduce operational overhead while retaining managed identity, VNet integration and independent service scaling.

## Repository structure

```text
.
├── apps/
│   ├── console/                    # Executive/business/engineering web experience
│   └── gateway/                    # External Entra-authenticated trust boundary
├── services/
│   ├── orchestrator/               # LangGraph workflows, evidence and AI synthesis
│   ├── mcp-server/                 # Canonical MCP capability boundary
│   ├── db-migrator/                # Privileged DB + LangGraph schema bootstrap
│   ├── eval-runner/                # Enterprise release quality gates
│   └── adapters/
│       ├── reference-payroll/      # Synthetic payroll source adapter
│       └── reference-portfolio/    # Synthetic cross-product source adapter
├── policy/
│   └── rego/                       # OPA authorization policy
├── infra/
│   ├── main.bicep                  # Azure deployment entry point
│   ├── environments/               # Environment parameter files
│   └── modules/                    # Azure infrastructure modules
├── scripts/
│   └── export-shareable-source.sh  # Controlled source-review bundle generator
├── .github/workflows/
│   ├── ci.yml                      # TypeScript/build/Bicep/policy checks
│   ├── release-dev.yml             # Full live-dev release + eval gate
│   └── export-source.yml           # Manual source-sharing artifact
└── docs/                           # Architecture, code walkthrough and sharing guide
```

## Development security boundary

The gateway can accept development identity headers only when explicitly enabled for local development. Live deployment uses Entra authentication and gateway-created trusted context.

The model is never allowed to provide the trusted tenant identity. Tenant/user/role/purpose context is established by the authenticated application tier before policy or MCP execution.

PostgreSQL tenant isolation is enforced with row-level security and tenant-scoped runtime helpers. Privileged schema/checkpoint creation is performed by the DB migration job rather than the runtime identity.

## Local development

Prerequisites: Node.js 22+, pnpm 9+, Docker/PostgreSQL as required by the selected runtime mode.

```bash
corepack enable
pnpm install
pnpm typecheck
pnpm build
```

For the narrow reference-payroll path, start services in separate shells:

```bash
pnpm --filter @bcs-one/reference-payroll dev
pnpm --filter @bcs-one/mcp-server dev
pnpm --filter @bcs-one/orchestrator dev
ALLOW_DEV_HEADERS=true pnpm --filter @bcs-one/gateway dev
```

Example synthetic request:

```bash
curl -X POST http://localhost:3000/v1/employee-summary \
  -H 'content-type: application/json' \
  -H 'x-bcs-tenant-id: tenant-demo' \
  -H 'x-bcs-user-id: employee-1001' \
  -H 'x-bcs-roles: employee' \
  -H 'x-bcs-purpose: self-service' \
  -d '{"employeeId":"employee-1001","period":"2026-08","explain":false}'
```

The reference adapters return synthetic data only.

## Code review

A reviewer should not need to reverse-engineer the folder tree. Use [`docs/CODE_WALKTHROUGH.md`](docs/CODE_WALKTHROUGH.md), which follows one request through:

1. Entra/Gateway trust establishment.
2. Orchestrator validation and LangGraph state.
3. OPA authorization.
4. Canonical MCP capability execution.
5. Product adapter/source evidence.
6. PostgreSQL artifacts and events.
7. Azure OpenAI grounded synthesis.
8. Console business/technical views.
9. Enterprise evaluation/release gate.

Architecture-critical source files include comments that explain trust boundaries and non-obvious constraints rather than restating syntax.

## Sharing source safely

Keep the repository private unless an explicit BCS decision changes that policy.

For a time-boxed code review, run **Actions → Export shareable source** and select one of:

- `internal` — tracked source at the selected commit;
- `external-review` — reviewer-focused bundle with repository automation, environment parameters and operational bootstrap helpers removed.

The workflow creates a short-lived artifact with a commit manifest and SHA-256 checksum. It does not have access to Azure/GitHub secrets. See [`docs/SHARING_SOURCE_CODE.md`](docs/SHARING_SOURCE_CODE.md) before distributing a bundle.

Local equivalent:

```bash
./scripts/export-shareable-source.sh external-review ./out/bcs-one-source
```

## Azure deployment

See [`infra/README.md`](infra/README.md).

The live-dev release path is deliberately ordered:

```text
foundation -> image build/push -> DB migration -> app rollout -> health -> enterprise eval gate -> publish
```

Use the full release workflow when database migrations, runtime code or Console changes need to move together.

## Current scope and production gaps

The repository is an enterprise-grade synthetic pilot/reference implementation, not a finished production customer rollout. Production adoption still requires real BCS product API contracts/adapters, customer identity mapping, approved retention/privacy controls, production network/database hardening, operational SLO/DR/FinOps controls, and governed approval/write workflows where applicable.
