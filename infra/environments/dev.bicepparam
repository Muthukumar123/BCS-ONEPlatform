using '../main.bicep'

param environment = 'dev'
param location = readEnvironmentVariable('AZURE_LOCATION', 'swedencentral')
param postgresAdminPassword = readEnvironmentVariable('POSTGRES_ADMIN_PASSWORD')
