targetScope = 'resourceGroup'

@description('Deployment environment.')
@allowed(['dev', 'test', 'prod'])
param environment string = 'dev'

@description('Primary Azure region.')
param location string = resourceGroup().location

@description('Short globally-unique suffix for resources with global names.')
param uniqueSuffix string = uniqueString(subscription().subscriptionId, resourceGroup().id)

@secure()
@description('Bootstrap PostgreSQL administrator password. Replace with Entra-only database auth before production.')
param postgresAdminPassword string

param tags object = {
  system: 'bcs-one'
  environment: environment
  managedBy: 'bicep'
}

var prefix = 'bcsone-${environment}'

module network './modules/network.bicep' = {
  name: 'network'
  params: {
    location: location
    prefix: prefix
    tags: tags
  }
}

module observability './modules/observability.bicep' = {
  name: 'observability'
  params: {
    location: location
    prefix: prefix
    tags: tags
  }
}

module identity './modules/identity.bicep' = {
  name: 'identity'
  params: {
    location: location
    prefix: prefix
    tags: tags
  }
}

module registry './modules/registry.bicep' = {
  name: 'registry'
  params: {
    location: location
    prefix: prefix
    uniqueSuffix: uniqueSuffix
    tags: tags
  }
}

module keyVault './modules/keyvault.bicep' = {
  name: 'keyvault'
  params: {
    location: location
    prefix: prefix
    uniqueSuffix: uniqueSuffix
    tenantId: tenant().tenantId
    tags: tags
  }
}

module messaging './modules/messaging.bicep' = {
  name: 'messaging'
  params: {
    location: location
    prefix: prefix
    uniqueSuffix: uniqueSuffix
    tags: tags
  }
}

module storage './modules/storage.bicep' = {
  name: 'storage'
  params: {
    location: location
    prefix: prefix
    uniqueSuffix: uniqueSuffix
    tags: tags
  }
}

module database './modules/postgres.bicep' = {
  name: 'database'
  params: {
    location: location
    prefix: prefix
    subnetId: network.outputs.dataSubnetId
    privateDnsZoneId: network.outputs.postgresPrivateDnsZoneId
    administratorPassword: postgresAdminPassword
    highAvailability: environment == 'prod'
    tags: tags
  }
}

module containerApps './modules/container-apps.bicep' = {
  name: 'containerAppsEnvironment'
  params: {
    location: location
    prefix: prefix
    subnetId: network.outputs.containerAppsSubnetId
    logAnalyticsCustomerId: observability.outputs.logAnalyticsCustomerId
    logAnalyticsSharedKey: observability.outputs.logAnalyticsSharedKey
    tags: tags
  }
}

output containerAppsEnvironmentId string = containerApps.outputs.environmentId
output containerAppsEnvironmentName string = containerApps.outputs.environmentName
output containerAppsDefaultDomain string = containerApps.outputs.defaultDomain
output containerRegistryName string = registry.outputs.name
output containerRegistry string = registry.outputs.loginServer
output containerRegistryId string = registry.outputs.id
output keyVaultName string = keyVault.outputs.name
output keyVaultId string = keyVault.outputs.id
output postgresFqdn string = database.outputs.fqdn
output serviceBusNamespace string = messaging.outputs.namespaceName
output storageAccount string = storage.outputs.name
output applicationInsightsConnectionString string = observability.outputs.applicationInsightsConnectionString
output workloadIdentityClientId string = identity.outputs.clientId
output workloadIdentityPrincipalId string = identity.outputs.principalId
output workloadIdentityResourceId string = identity.outputs.resourceId
