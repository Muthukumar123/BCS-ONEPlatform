param location string
param prefix string
param uniqueSuffix string
param tenantId string
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

// Key Vault data-plane roles are assigned in scripts/bootstrap-rbac.sh by a privileged bootstrap identity.
output name string = kv.name
output id string = kv.id
