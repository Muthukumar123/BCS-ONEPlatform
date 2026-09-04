param location string
param prefix string
param subnetId string
param logAnalyticsCustomerId string
@secure()
param logAnalyticsSharedKey string
param tags object

resource env 'Microsoft.App/managedEnvironments@2026-01-01' = {
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

output environmentId string = env.id
output environmentName string = env.name
output defaultDomain string = env.properties.defaultDomain
