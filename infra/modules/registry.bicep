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
    publicNetworkAccess: 'Enabled'
  }
}

// AcrPull is assigned in scripts/bootstrap-rbac.sh by a privileged bootstrap identity.
// Normal GitHub deployment identity remains Contributor-only.
output name string = acr.name
output loginServer string = acr.properties.loginServer
output id string = acr.id
