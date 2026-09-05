using '../main.bicep'

param environment = 'dev'
param location = 'swedencentral'
param postgresAdminPassword = readEnvironmentVariable('POSTGRES_ADMIN_PASSWORD')
