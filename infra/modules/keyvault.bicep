param location string
param prefix string
param uniqueSuffix string
param tenantId string
param workloadPrincipalId string
param tags object

var name = take(replace(toLower('${prefix}-${uniqueSuffix}-kv'), '-', ''), 24)

resource kv 'Microsoft.KeyVault/vaults@2024-11-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    tenantId: tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    enablePurgeProtection: true
    softDeleteRetentionInDays: 90
    publicNetworkAccess: 'Enabled'
  }
}

resource secretUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(kv.id, workloadPrincipalId, 'key-vault-secrets-user')
  scope: kv
  properties: {
    principalId: workloadPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
  }
}

output name string = kv.name
output id string = kv.id
