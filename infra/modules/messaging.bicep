param location string
param prefix string
param tags object

resource sb 'Microsoft.ServiceBus/namespaces@2024-01-01' = {
  name: '${prefix}-sb'
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
