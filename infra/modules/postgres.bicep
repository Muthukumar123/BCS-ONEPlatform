param location string
param prefix string
param subnetId string
param privateDnsZoneId string
@secure()
param administratorPassword string
param highAvailability bool = false
param tags object

resource db 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: '${prefix}-pg'
  location: location
  tags: tags
  sku: {
    name: highAvailability ? 'Standard_D2ds_v5' : 'Standard_B2ms'
    tier: highAvailability ? 'GeneralPurpose' : 'Burstable'
  }
  properties: {
    version: '16'
    administratorLogin: 'bcsoneadmin'
    administratorLoginPassword: administratorPassword
    storage: {
      storageSizeGB: 32
      autoGrow: 'Enabled'
    }
    backup: {
      backupRetentionDays: highAvailability ? 14 : 7
      geoRedundantBackup: 'Disabled'
    }
    network: {
      delegatedSubnetResourceId: subnetId
      privateDnsZoneArmResourceId: privateDnsZoneId
      publicNetworkAccess: 'Disabled'
    }
    highAvailability: highAvailability ? {
      mode: 'ZoneRedundant'
    } : {
      mode: 'Disabled'
    }
  }
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: db
  name: 'bcsone'
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

output fqdn string = db.properties.fullyQualifiedDomainName
output id string = db.id
