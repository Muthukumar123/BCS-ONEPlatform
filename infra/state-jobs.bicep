targetScope = 'resourceGroup'

@allowed(['dev', 'test', 'prod'])
param environment string
param location string
param imageTag string
param containerAppsEnvironmentId string
param acrLoginServer string
param managedIdentityId string
param postgresFqdn string

@secure()
param postgresAdminPassword string

@secure()
param postgresRuntimePassword string

param tags object = {
  system: 'bcs-one'
  environment: environment
  managedBy: 'bicep'
  workload: 'database-migration'
}

var prefix = 'bcsone-${environment}'
var registry = [{
  server: acrLoginServer
  identity: managedIdentityId
}]
var identityConfig = {
  type: 'UserAssigned'
  userAssignedIdentities: {
    '${managedIdentityId}': {}
  }
}

resource dbMigrator 'Microsoft.App/jobs@2026-01-01' = {
  name: '${prefix}-db-migrator'
  location: location
  tags: tags
  identity: identityConfig
  properties: {
    environmentId: containerAppsEnvironmentId
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 900
      replicaRetryLimit: 0
      manualTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
      }
      registries: registry
      secrets: [
        { name: 'postgres-admin-password', value: postgresAdminPassword }
        { name: 'postgres-runtime-password', value: postgresRuntimePassword }
      ]
    }
    template: {
      containers: [{
        name: 'db-migrator'
        image: '${acrLoginServer}/bcs-one/db-migrator:${imageTag}'
        env: [
          { name: 'POSTGRES_HOST', value: postgresFqdn }
          { name: 'POSTGRES_PORT', value: '5432' }
          { name: 'POSTGRES_DATABASE', value: 'bcsone' }
          { name: 'POSTGRES_ADMIN_USER', value: 'bcsoneadmin' }
          { name: 'POSTGRES_ADMIN_PASSWORD', secretRef: 'postgres-admin-password' }
          { name: 'POSTGRES_RUNTIME_USER', value: 'bcsone_runtime' }
          { name: 'POSTGRES_RUNTIME_PASSWORD', secretRef: 'postgres-runtime-password' }
        ]
        resources: { cpu: json('0.5'), memory: '1Gi' }
      }]
    }
  }
}

output dbMigratorJobName string = dbMigrator.name
