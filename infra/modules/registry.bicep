param location string
param prefix string
param uniqueSuffix string
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

output name string = acr.name
output loginServer string = acr.properties.loginServer
output id string = acr.id
