# Sharing BCS ONE Source Code

The repository is private. Do **not** make it public as a convenience step for a review. Use one of the controlled sharing methods below.

## Recommended options

### 1. Internal reviewer with GitHub access

Use the private repository directly. Grant the minimum repository permission required by the reviewer and remove access when the review is complete.

This is the preferred option for BCS employees or approved engineering reviewers because it preserves:

- commit history;
- pull-request context;
- CI evidence;
- code navigation;
- architecture documentation.

### 2. External or time-boxed source review

Use the manual GitHub Action **Export shareable source**.

The workflow creates a downloadable source artifact from the exact commit that was selected when the workflow ran. It does not export Git history and it does not include runtime secrets from GitHub/Azure.

Two profiles are available:

| Profile | Intended audience | Contents |
|---|---|---|
| `internal` | approved internal technical reviewer | all tracked repository source at the selected commit |
| `external-review` | approved third-party / leadership technical review | application/service/policy/docs and generic infrastructure code, with environment-specific and repository-automation material removed |

The exported source tree contains a `SOURCE_BUNDLE_MANIFEST.txt` file with the commit SHA, profile and generation time so the recipient can identify exactly what was reviewed.

## How to create the bundle

1. Open **GitHub → Actions → Export shareable source**.
2. Select **Run workflow**.
3. Choose `internal` or `external-review`.
4. Run from the branch/commit you intend to share.
5. Download the generated `bcs-one-source-<profile>-<commit-sha>` workflow artifact.
6. Inside the artifact, use the `bcs-one-source-<profile>-<short-sha>.tar.gz` archive and its matching `.sha256` file.
7. Review the manifest and sample the archive before forwarding it.

The workflow artifact is intentionally short-lived. Re-run the workflow when a newer reviewed version is required rather than maintaining manually copied ZIP files.

## Local export

The same packaging logic can be run locally without relying on executable-file permissions:

```bash
bash scripts/export-shareable-source.sh external-review ./out/bcs-one-source
```

or:

```bash
bash scripts/export-shareable-source.sh internal ./out/bcs-one-source
```

The script only packages files already tracked in Git. Local untracked `.env`, credential files and build output are therefore not copied.

## External-review exclusions

The external-review profile removes material that is not needed to understand the architecture and could expose environment/repository operating details:

- `.github/` workflow configuration;
- `.env*` files;
- `infra/environments/` environment parameter files;
- operational bootstrap/deployment helper scripts;
- package-manager/cache/build output if present.

It keeps generic Bicep modules so reviewers can still understand the Azure architecture.

## Automated credential scan

Before producing the bundle, the export script scans the complete exported tree for several high-confidence credential formats such as private keys, GitHub tokens, AWS access-key identifiers, Slack tokens and OpenAI-style secret keys. If one is detected, the export fails instead of creating a shareable artifact.

This is a defensive control, not a replacement for human review.

## Required human review before distribution

Automation reduces accidental leakage; it does not replace ownership approval. Before sending source outside the approved organization, confirm:

- the recipient is authorized to receive BCS ONE source;
- the selected commit is the intended version;
- no customer data, copied production payloads or local diagnostic files were committed;
- intellectual-property/licensing requirements have been checked;
- architecture documents do not contain information that should be redacted for that audience.

## What is not in the repository export

GitHub/Azure runtime secrets are not part of the source repository and therefore are not exported, including:

- GitHub Actions secrets;
- Azure Key Vault secret values;
- managed-identity credentials;
- bearer tokens;
- PostgreSQL runtime/admin passwords;
- Azure portal billing data.

Never add any of those values to a source package manually.

## Reviewer entry point

Send reviewers these two files first:

1. `README.md`
2. `docs/CODE_WALKTHROUGH.md`

The walkthrough follows one request from Entra/Gateway through OPA, LangGraph, MCP, adapters, persistence and Azure OpenAI, and is the fastest way to understand the codebase.