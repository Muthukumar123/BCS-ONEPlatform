targetScope = 'resourceGroup'

@allowed(['dev', 'test', 'prod'])
param environment string

@description('Azure region for the Container Apps application tier. Must match the managed environment region.')
param location string

param imageTag string
param containerAppsEnvironmentId string
param acrLoginServer string
param managedIdentityId string
param managedIdentityClientId string
param azureOpenAIEndpoint string
param azureOpenAIModelDeployment string
param entraTenantId string
param entraApiAudience string
param entraConsoleClientId string
param postgresFqdn string

@secure()
param postgresRuntimePassword string

param tags object = {
  system: 'bcs-one'
  environment: environment
  managedBy: 'bicep'
}

var prefix = 'bcsone-${environment}'

module apps './modules/apps.bicep' = {
  name: 'applications'
  params: {
    location: location
    prefix: prefix
    environmentId: containerAppsEnvironmentId
    acrLoginServer: acrLoginServer
    managedIdentityId: managedIdentityId
    managedIdentityClientId: managedIdentityClientId
    imageTag: imageTag
    azureOpenAIEndpoint: azureOpenAIEndpoint
    azureOpenAIModelDeployment: azureOpenAIModelDeployment
    entraTenantId: entraTenantId
    entraApiAudience: entraApiAudience
    entraConsoleClientId: entraConsoleClientId
    postgresFqdn: postgresFqdn
    postgresRuntimePassword: postgresRuntimePassword
    tags: tags
  }
}

output gatewayFqdn string = apps.outputs.gatewayFqdn
output gatewayUrl string = 'https://${apps.outputs.gatewayFqdn}'
output consoleFqdn string = apps.outputs.consoleFqdn
output consoleUrl string = 'https://${apps.outputs.consoleFqdn}'
output evalRunnerJobName string = apps.outputs.evalRunnerJobName
