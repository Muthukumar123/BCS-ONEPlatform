package bcsone.authz_test

import rego.v1
import data.bcsone.authz

test_employee_self_read if {
  authz.allow with input as {
    "tenant_id": "t1",
    "user_id": "e1",
    "roles": ["employee"],
    "purpose": "self-service",
    "action": "read",
    "resource": {"owner_user_id": "e1"}
  }
}

test_employee_other_read_denied if {
  not authz.allow with input as {
    "tenant_id": "t1",
    "user_id": "e1",
    "roles": ["employee"],
    "purpose": "self-service",
    "action": "read",
    "resource": {"owner_user_id": "e2"}
  }
}
