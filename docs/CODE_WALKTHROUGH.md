# BCS ONE Code Walkthrough

This document is the reviewer-friendly map of the BCS ONE codebase. It is intentionally written for architects, senior engineers, Product Owners and technical reviewers who need to understand **why each layer exists**, not only where the files are located.

> **Data boundary:** the pilot runtime is live on Azure, while employer/employee/product business records are deterministic synthetic reference data. Source-system facts remain authoritative; the language model is only allowed to explain or synthesize governed evidence.

## 1. Runtime request path

```text
Browser / Console
    |
    | Entra access token
    v
Gateway
    |  validates identity and creates trusted tenant/user/role/purpose context
    v
Orchestrator (LangGraph)
    |  validates request + runs policy-governed workflow
    v
OPA policy
    |  deterministic authorization before scenario/tool execution
    v
Canonical MCP capability
    |  tools/call using stable business capability names
    v
Product adapter
    |  translates canonical contract to product-specific contract
    v
Synthetic reference source
    |  returns structured authoritative evidence
    v
PostgreSQL artifacts + events
    |  tenant-scoped durable evidence and trace
    v
Azure OpenAI
    |  receives only governed evidence for explanation/synthesis
    v
Business response + provenance
```

The key architectural rule is: **the model never becomes an authorization system, a payroll calculation authority, or a source of HR facts.**

## 2. Repository map

| Area | Responsibility | Start here |
|---|---|---|
| `apps/console` | Executive, business and engineering experience | `apps/console/public/index.html`, `ux-shell.js` |
| `apps/gateway` | External trust boundary, Entra authentication, trusted context | `apps/gateway/src/index.ts`, `auth.ts` |
| `services/orchestrator` | LangGraph workflows, governance sequencing, evidence assembly, AI synthesis | `scenario-graph.ts`, `graph.ts`, `index.ts` |
| `services/mcp-server` | Canonical AI-facing capability protocol | `services/mcp-server/src/index.ts` |
| `services/adapters` | Product-specific translation behind canonical capabilities | reference payroll / portfolio adapters |
| `policy/rego` | Deterministic OPA authorization | policy and tests |
| `services/db-migrator` | Privileged schema and LangGraph checkpoint bootstrap | migrations + migrator entry point |
| `services/eval-runner` | Release hard gates for policy, MCP, grounding and isolation | evaluation runner |
| `infra` | Azure Container Apps, PostgreSQL, identity and supporting services | `infra/main.bicep`, `infra/modules/` |
| `.github/workflows` | CI, release and source-export automation | `ci.yml`, `release-dev.yml`, `export-source.yml` |

## 3. Gateway: establish trusted context

**File:** `apps/gateway/src/index.ts`

The gateway is the external application trust boundary. It validates the bearer token, derives business purpose from trusted roles, and forwards only internal headers created by the gateway.

Important design points:

- Browser-supplied `x-bcs-tenant-id`, `x-bcs-user-id`, and role headers are not the production identity authority.
- Tenant/user/role/purpose context is created after authentication.
- A correlation/request ID is created at the edge and reused through the workflow.
- Streaming requests use Server-Sent Events so the Console can show identity, policy, MCP, adapter, source and AI stages as they happen.

Reviewer question to ask: **Can untrusted input change tenant identity or authorization context?** The intended answer is no.

## 4. Orchestrator HTTP boundary

**File:** `services/orchestrator/src/index.ts`

The orchestrator exposes internal APIs for scenario execution, workforce reference browsing, durable runs, evaluations and the CTO dashboard.

Responsibilities:

1. Reconstruct the internal `SecurityContext` from gateway-created headers.
2. Validate request contracts with Zod.
3. Select the scenario definition.
4. Execute the appropriate LangGraph graph.
5. Keep run/artifact/dashboard queries tenant-scoped.
6. Return only explicit error codes at the API boundary while detailed operational diagnostics remain in logs/events.

The orchestrator is deployed with internal Container Apps ingress. The gateway is the internet-facing trust boundary.

## 5. Scenario graph: governed multi-product execution

**File:** `services/orchestrator/src/scenario-graph.ts`

Conceptually the graph is:

```text
START
  -> scenario policy
  -> supervisor
  -> product federation
       -> capability policy
       -> MCP tools/call
       -> adapter
       -> source evidence
       -> persisted artifact
  -> evidence merge
  -> grounded synthesis (optional/required by scenario)
  -> durable completion
END
```

For multi-product scenarios, MCP branches execute independently and produce separately attributable artifacts. The merge step does not erase product/source provenance.

Runtime guardrails should be reviewed together with this graph: wall-clock budget, tool-call budget, repeat-call protection and output-size limits.

## 6. MCP: stable AI-facing business capabilities

**Area:** `services/mcp-server`

MCP does **not** replace product APIs. It creates a stable AI-facing capability boundary:

```text
Agent
  -> employee.profile.get
  -> payroll.employee_summary
  -> leave.balance.get
  -> workforce.schedule.get
       ...
  -> MCP server
  -> adapter
  -> product/source API
```

The reason this matters after acquisitions is that the scenario can remain stable when an underlying product API changes. Ideally only the relevant adapter changes unless the business semantics themselves changed.

## 7. Adapters: isolate product-specific contracts

**Area:** `services/adapters`

Reference adapters currently return deterministic synthetic data. Their architectural purpose is production-relevant: isolate vendor/product schemas from canonical business capabilities.

A production adapter should own:

- product authentication;
- product request/response mapping;
- product-specific retries/timeouts;
- source-system identifiers and provenance;
- contract version translation;
- safe error normalization.

It should **not** own user authorization decisions that belong to BCS ONE policy.

## 8. Persistence: evidence, runs and LangGraph state

**File:** `services/orchestrator/src/persistence.ts`

PostgreSQL stores:

- durable agent runs;
- execution events;
- governed artifacts;
- evaluation results;
- LangGraph checkpoints;
- AI token/cost telemetry.

Tenant isolation uses PostgreSQL RLS plus `bcs.tenant_id` session context. Runtime code should always go through tenant-scoped persistence helpers rather than issuing unscoped queries.

The DB migrator, not the runtime identity, owns privileged checkpoint/schema creation.

## 9. Azure OpenAI: grounded synthesis only

**File:** `services/orchestrator/src/azure-openai.ts`

The model client uses managed identity rather than an API key. The implementation:

- authenticates through `DefaultAzureCredential`;
- uses the Azure OpenAI v1 endpoint;
- keeps reasoning effort deliberately low for operational summarization;
- retries once with a larger output-token budget only for incomplete max-token responses;
- records input/cached/output/reasoning token usage;
- estimates token economics using explicit reference rates;
- logs sanitized diagnostics without logging employee evidence or prompts.

`estimatedAiCostUsd` is an operational estimate, **not Azure invoice data**.

## 10. Console: one runtime, multiple audiences

**Area:** `apps/console/public`

The Console deliberately provides different lenses over the same runtime:

- **Platform Overview** — self-explanatory landing page.
- **Scenario Lab** — execute business scenarios and inspect final answer/evidence.
- **Product Owner + BA** — outcome, requirements, data flow, exceptions and acceptance criteria.
- **CTO Dashboard** — agent activity, MCP federation, token consumption and AI economics.
- **Agent Runs / Observability / Evaluations** — engineering and release evidence.
- **Capability Hub / Product Landscape** — platform capability and portfolio mapping.

The UI must never fabricate operational KPIs. Dynamic metrics are loaded from authenticated runtime APIs.

## 11. Release path

The live-dev release is intentionally ordered:

```text
Foundation
 -> image build/push
 -> privileged DB migration
 -> application rollout
 -> health verification
 -> enterprise evaluation gate
 -> publish endpoints
```

A release should not be considered successful merely because Container Apps deployed. The evaluation gate proves policy, MCP contracts, tenant isolation and grounding behavior.

## 12. Commenting convention

Comments in this repository should explain **intent, trust boundaries and non-obvious constraints** rather than narrating syntax.

Good comment:

```ts
// Tenant identity is derived at the authenticated gateway. Never accept a
// tenant identifier from model/tool input as the authorization boundary.
```

Avoid comments such as:

```ts
// Increment the counter by one.
counter += 1;
```

For security-sensitive or architecture-critical functions, prefer a short JSDoc block that states:

- what the function owns;
- what it deliberately does not own;
- which input is trusted;
- what failure semantics callers should expect.

## 13. Suggested code-review order

For a 45–60 minute technical review, use this order:

1. `README.md` and this walkthrough.
2. `apps/gateway/src/auth.ts` + `index.ts`.
3. `services/orchestrator/src/scenarios.ts`.
4. `services/orchestrator/src/scenario-graph.ts`.
5. `services/mcp-server`.
6. one reference adapter.
7. `services/orchestrator/src/persistence.ts`.
8. `services/orchestrator/src/azure-openai.ts`.
9. OPA policy/tests.
10. `infra/modules/apps.bicep` and `release-dev.yml`.
11. Console audience views.

This order follows the production request path rather than the folder tree.