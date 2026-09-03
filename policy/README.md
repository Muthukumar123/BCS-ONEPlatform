# Policy service

This directory contains the first deny-by-default OPA policy used by the synthetic reference path.

The policy is intentionally small. Production policy must add tenant population scope, purpose controls, field obligations, action risk, approval state and BCS-specific HR/payroll rules.

Run locally:

```bash
docker build -f policy/Dockerfile -t bcs-one-policy .
docker run --rm -p 8181:8181 bcs-one-policy
```

Test directly with an OPA CLI image or local OPA binary:

```bash
opa test policy/rego -v
```
