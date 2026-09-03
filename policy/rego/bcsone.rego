package bcsone.authz

import rego.v1

default allow := false

decision := {
  "allow": allow,
  "reason": reason,
}

allow if {
  valid_context
  input.action == "read"
  "hr" in input.roles
}

allow if {
  valid_context
  input.action == "read"
  "payroll" in input.roles
}

allow if {
  valid_context
  input.action == "read"
  "employee" in input.roles
  input.resource.owner_user_id == input.user_id
}

valid_context if {
  is_string(input.tenant_id)
  input.tenant_id != ""
  is_string(input.user_id)
  input.user_id != ""
  is_array(input.roles)
  count(input.roles) > 0
  is_string(input.purpose)
  input.purpose != ""
}

reason := "allowed" if allow
reason := "deny-by-default" if not allow
