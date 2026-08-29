export const AZ204_DOMAINS = [
  {
    id: "compute-solutions",
    name: "Develop Azure Compute Solutions",
    weight: 0.25,
    keyServices: ["Azure Functions", "Azure App Service", "Azure Container Apps", "Azure Kubernetes Service"],
    concepts: ["serverless", "containerization", "deployment slots", "scaling", "triggers and bindings"],
  },
  {
    id: "storage-solutions",
    name: "Develop for Azure Storage",
    weight: 0.15,
    keyServices: ["Azure Blob Storage", "Azure Cosmos DB", "Azure SQL", "Azure Cache for Redis", "Azure Table Storage"],
    concepts: ["data consistency", "caching", "partitioning", "indexing", "data access patterns"],
  },
  {
    id: "security",
    name: "Implement Azure Security",
    weight: 0.20,
    keyServices: ["Azure Key Vault", "Azure AD", "Managed Identities", "Azure API Management"],
    concepts: ["secrets management", "OAuth2", "managed identity", "API security", "certificate management"],
  },
  {
    id: "monitoring-solutions",
    name: "Monitor, Troubleshoot, and Optimize Azure Solutions",
    weight: 0.15,
    keyServices: ["Azure Application Insights", "Azure Monitor", "Azure Log Analytics"],
    concepts: ["distributed tracing", "performance tuning", "logging", "alerting", "caching strategies"],
  },
  {
    id: "third-party",
    name: "Connect to and Consume Azure Services and Third-Party Services",
    weight: 0.25,
    keyServices: ["Azure Service Bus", "Azure Event Grid", "Azure Event Hubs", "Azure API Management", "Azure Logic Apps"],
    concepts: ["message queues", "event-driven architecture", "webhooks", "API versioning", "integration patterns"],
  },
] as const;

export type AZ204DomainId = (typeof AZ204_DOMAINS)[number]["id"];
