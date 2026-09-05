param location string
param prefix string
param uniqueSuffix string
param tags object

// Service Bus namespace names are globally unique and must not end with reserved
// suffixes such as '-sb' or '-mgmt'. Include the deterministic deployment suffix
// and end with '-bus' to satisfy the platform naming rules.
var namespaceName = take(toLower('${prefix}-${take(uniqueSuffix, 8)}-bus'), 50)

resource sb 'Microsoft.ServiceBus/namespaces@2024-01-01' = {
  name: namespaceName
  location: location
  tags: tags
  sku: { name: 'Standard', tier: 'Standard' }
  properties: {
    disableLocalAuth: true
    publicNetworkAccess: 'Enabled'
    minimumTlsVersion: '1.2'
  }
}

resource workflowTopic 'Microsoft.ServiceBus/namespaces/topics@2024-01-01' = {
  parent: sb
  name: 'workflow-events'
  properties: {
    defaultMessageTimeToLive: 'P7D'
    enablePartitioning: true
  }
}

output namespaceName string = sb.name
output namespaceId string = sb.id
