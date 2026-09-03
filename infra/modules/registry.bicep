param location string
param prefix string
param uniqueSuffix string
param workloadPrincipalId string
param tags object

var registryName = replace(toLower('${prefix}${take(uniqueSuffix, 8)}acr'), '-', '')

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: registryName
  location: location
  tags: tags
  sku: { name: 'Basic' }
  properties: {
    adminUserEnabled: false
    anonymousPullEnabled: false
    publicNetworkAccess: 'Enabled'
  }
}

resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, workloadPrincipalId, 'acrpull')
  scope: acr
  properties: {
    principalId: workloadPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
  }
}

output name string = acr.name
output loginServer string = acr.properties.loginServer
output id string = acr.id
