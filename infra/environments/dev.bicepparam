using '../main.bicep'

param environment = 'dev'
param location = 'westeurope'
param postgresAdminPassword = readEnvironmentVariable('POSTGRES_ADMIN_PASSWORD')
