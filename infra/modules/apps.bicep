param location string
param prefix string
param environmentId string
param acrLoginServer string
param managedIdentityId string
param managedIdentityClientId string
param imageTag string
param azureOpenAIEndpoint string
param azureOpenAIModelDeployment string
param entraTenantId string
param entraApiAudience string
param tags object

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

resource referencePayroll 'Microsoft.App/containerApps@2026-01-01' = {
  name: '${prefix}-reference-payroll'
  location: location
  tags: tags
  identity: identityConfig
  properties: {
    managedEnvironmentId: environmentId
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: false
        targetPort: 3003
        transport: 'auto'
      }
      registries: registry
    }
    template: {
      containers: [{
        name: 'reference-payroll'
        image: '${acrLoginServer}/bcs-one/reference-payroll:${imageTag}'
        env: [{ name: 'PORT', value: '3003' }]
        probes: [{
          type: 'Liveness'
          httpGet: { path: '/healthz', port: 3003, scheme: 'HTTP' }
          initialDelaySeconds: 5
          periodSeconds: 15
          timeoutSeconds: 5
          failureThreshold: 3
        }]
        resources: { cpu: json('0.5'), memory: '1Gi' }
      }]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
}

resource policy 'Microsoft.App/containerApps@2026-01-01' = {
  name: '${prefix}-policy'
  location: location
  tags: tags
  identity: identityConfig
  properties: {
    managedEnvironmentId: environmentId
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: false
        targetPort: 8181
        transport: 'auto'
      }
      registries: registry
    }
    template: {
      containers: [{
        name: 'policy'
        image: '${acrLoginServer}/bcs-one/policy:${imageTag}'
        resources: { cpu: json('0.5'), memory: '1Gi' }
      }]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
}

resource mcp 'Microsoft.App/containerApps@2026-01-01' = {
  name: '${prefix}-mcp'
  location: location
  tags: tags
  identity: identityConfig
  properties: {
    managedEnvironmentId: environmentId
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: false
        targetPort: 3002
        transport: 'auto'
      }
      registries: registry
    }
    template: {
      containers: [{
        name: 'mcp'
        image: '${acrLoginServer}/bcs-one/mcp-server:${imageTag}'
        env: [
          { name: 'PORT', value: '3002' }
          { name: 'REFERENCE_PAYROLL_ADAPTER_URL', value: 'https://${referencePayroll.properties.configuration.ingress.fqdn}' }
        ]
        probes: [{
          type: 'Liveness'
          httpGet: { path: '/healthz', port: 3002, scheme: 'HTTP' }
          initialDelaySeconds: 5
          periodSeconds: 15
          timeoutSeconds: 5
          failureThreshold: 3
        }]
        resources: { cpu: json('0.5'), memory: '1Gi' }
      }]
      scale: { minReplicas: 1, maxReplicas: 5 }
    }
  }
}

resource orchestrator 'Microsoft.App/containerApps@2026-01-01' = {
  name: '${prefix}-orchestrator'
  location: location
  tags: tags
  identity: identityConfig
  properties: {
    managedEnvironmentId: environmentId
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: false
        targetPort: 3001
        transport: 'auto'
      }
      registries: registry
    }
    template: {
      containers: [{
        name: 'orchestrator'
        image: '${acrLoginServer}/bcs-one/orchestrator:${imageTag}'
        env: [
          { name: 'PORT', value: '3001' }
          { name: 'MCP_URL', value: 'https://${mcp.properties.configuration.ingress.fqdn}/mcp' }
          { name: 'POLICY_URL', value: 'https://${policy.properties.configuration.ingress.fqdn}' }
          { name: 'AZURE_CLIENT_ID', value: managedIdentityClientId }
          { name: 'AZURE_OPENAI_ENDPOINT', value: azureOpenAIEndpoint }
          { name: 'AZURE_OPENAI_MODEL_DEPLOYMENT', value: azureOpenAIModelDeployment }
        ]
        probes: [{
          type: 'Liveness'
          httpGet: { path: '/healthz', port: 3001, scheme: 'HTTP' }
          initialDelaySeconds: 5
          periodSeconds: 15
          timeoutSeconds: 5
          failureThreshold: 3
        }]
        resources: { cpu: json('1.0'), memory: '2Gi' }
      }]
      scale: { minReplicas: 1, maxReplicas: 5 }
    }
  }
}

resource gateway 'Microsoft.App/containerApps@2026-01-01' = {
  name: '${prefix}-gateway'
  location: location
  tags: tags
  identity: identityConfig
  properties: {
    managedEnvironmentId: environmentId
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
      }
      registries: registry
    }
    template: {
      containers: [{
        name: 'gateway'
        image: '${acrLoginServer}/bcs-one/gateway:${imageTag}'
        env: [
          { name: 'PORT', value: '3000' }
          { name: 'ALLOW_DEV_HEADERS', value: 'false' }
          { name: 'ORCHESTRATOR_URL', value: 'https://${orchestrator.properties.configuration.ingress.fqdn}' }
          { name: 'ENTRA_TENANT_ID', value: entraTenantId }
          { name: 'ENTRA_API_AUDIENCE', value: entraApiAudience }
          { name: 'ENTRA_EMPLOYEE_ID_CLAIM', value: 'employee_id' }
        ]
        probes: [{
          type: 'Liveness'
          httpGet: { path: '/healthz', port: 3000, scheme: 'HTTP' }
          initialDelaySeconds: 5
          periodSeconds: 15
          timeoutSeconds: 5
          failureThreshold: 3
        }]
        resources: { cpu: json('0.5'), memory: '1Gi' }
      }]
      scale: { minReplicas: 1, maxReplicas: 5 }
    }
  }
}

output gatewayFqdn string = gateway.properties.configuration.ingress.fqdn
