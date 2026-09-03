param location string
param prefix string
param subnetId string
param logAnalyticsCustomerId string
@secure()
param logAnalyticsSharedKey string
param managedIdentityId string
param acrLoginServer string
param tags object

resource env 'Microsoft.App/managedEnvironments@2024-10-02-preview' = {
  name: '${prefix}-cae'
  location: location
  tags: tags
  properties: {
    vnetConfiguration: {
      infrastructureSubnetId: subnetId
      internal: false
    }
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalyticsCustomerId
        sharedKey: logAnalyticsSharedKey
      }
    }
  }
}

// Container Apps are intentionally seeded with Microsoft hello-world images.
// CI/CD replaces these with BCS ONE service images after ACR build/push.
resource gateway 'Microsoft.App/containerApps@2024-10-02-preview' = {
  name: '${prefix}-gateway'
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${managedIdentityId}': {} }
  }
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
      }
      registries: [{ server: acrLoginServer, identity: managedIdentityId }]
    }
    template: {
      containers: [{
        name: 'gateway'
        image: 'mcr.microsoft.com/k8se/quickstart:latest'
        resources: { cpu: json('0.5'), memory: '1Gi' }
        env: [
          { name: 'PORT', value: '3000' }
          { name: 'ALLOW_DEV_HEADERS', value: 'false' }
        ]
      }]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
}

output environmentId string = env.id
output environmentName string = env.name
output gatewayName string = gateway.name
