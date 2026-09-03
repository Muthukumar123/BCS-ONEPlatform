# BCS ONE — Azure Implementation Guide

This guide maps the master solution design to the Azure Phase-0 repository scaffold.

## Azure service mapping

| Logical capability | Azure implementation baseline |
|---|---|
| Experience/API edge | Azure Container Apps gateway; APIM/Front Door before production |
| Agent orchestration | Azure Container Apps |
| LLM | Azure OpenAI / Microsoft Foundry deployment accessed by managed identity |
| MCP capability tier | Azure Container Apps |
| Product adapters | Independently scaled Container Apps |
| Policy service | OPA container on Container Apps; future managed policy option can be evaluated |
| Workflow/config state | Azure Database for PostgreSQL Flexible Server |
| Async workflow/outbox | Azure Service Bus |
| Audit/export objects | Azure Storage |
| Secrets | Azure Key Vault |
| Images | Azure Container Registry |
| Telemetry | Azure Monitor + Application Insights + OpenTelemetry |
| Identity | Microsoft Entra ID + managed identities |

## Why Container Apps first

BCS ONE services are HTTP/event-oriented, independently scalable and largely stateless. Container Apps provides managed revisions, autoscaling, VNet integration and managed identity without requiring the team to operate a Kubernetes control plane. AKS should be introduced only if platform requirements emerge that Container Apps cannot satisfy.

## Production hardening still required

The scaffold intentionally does not guess BCS tenant/domain/certificate or product-integration details. Before production:

1. Put APIM and/or Front Door/WAF in front of gateway ingress.
2. Enforce production Entra authentication and remove development header mode.
3. Disable public network access for Key Vault, Storage, Service Bus, ACR and Azure OpenAI using private endpoints/DNS where supported by the selected SKU and topology.
4. Move PostgreSQL from bootstrap password to Entra-only authentication.
5. Use production HA/backup settings and confirm regional zone support.
6. Assign least-privilege RBAC roles to individual workload identities; split identities by service rather than sharing the Phase-0 identity.
7. Create approved Azure OpenAI model deployments after quota, region, version and model-evaluation review.
8. Configure PII-minimized OpenTelemetry export and alert rules.
9. Add customer/product adapters only after conformance and tenant-isolation testing.
10. Add deployment rings, feature flags and sensitive-write approval services before enabling writes.

## Model authentication

The orchestrator code uses `DefaultAzureCredential`, allowing local Azure CLI/developer authentication and managed identity in Azure. Production containers should receive only the Azure OpenAI RBAC role needed for inference; do not store model API keys in environment variables.

## Current limitations

- Reference payroll data is synthetic.
- Only one read capability is wired end-to-end.
- MCP protocol-sensitive code is isolated in `services/mcp-server`; validate it against the pinned MCP SDK/spec before production.
- Approval, audit ingestion service, canonical identity service and long-running readiness jobs are architectural workstreams, not silently simulated in this scaffold.
