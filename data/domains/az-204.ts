export const AZ204_DOMAINS = [
  {
    id: "compute-solutions",
    name: "Develop Azure compute solutions",
    weight: 0.2972972972972973,
    keyServices: ["Azure Container Registry", "Azure Container Instances", "Azure Container Apps", "Azure App Service", "Azure Functions"],
    concepts: ["container image creation and management", "container deployment and scaling", "diagnostics and logging configuration", "TLS and API settings for web apps", "function triggers and bindings"],
  },
  {
    id: "storage-solutions",
    name: "Develop for Azure storage",
    weight: 0.1891891891891892,
    keyServices: ["Azure Cosmos DB", "Azure Blob Storage"],
    concepts: ["container and item operations", "consistency levels", "change feed notifications", "metadata and properties handling", "data lifecycle management"],
  },
  {
    id: "security",
    name: "Implement Azure security",
    weight: 0.1891891891891892,
    keyServices: ["Microsoft Entra ID", "Microsoft Identity platform", "Azure Key Vault", "Azure App Configuration", "Microsoft Graph"],
    concepts: ["user authentication and authorization", "managed identities for resource access", "secure storage of secrets and certificates", "shared access signature implementation", "Microsoft Graph integration"],
  },
  {
    id: "monitoring-solutions",
    name: "Monitor and troubleshoot Azure solutions",
    weight: 0.08108108108108109,
    keyServices: ["Azure Monitor", "Application Insights", "Azure Alerts"],
    concepts: ["metrics monitoring", "log analytics", "trace collection", "availability testing", "alert configuration", "application instrumentation"],
  },
  {
    id: "third-party",
    name: "Connect to and consume Azure services and third-party services",
    weight: 0.24324324324324326,
    keyServices: ["Azure API Management", "Azure Event Grid", "Azure Event Hubs", "Azure Service Bus", "Azure Queue Storage"],
    concepts: ["API lifecycle management", "API security and access control", "API policies and transformations", "event-driven architecture", "message queuing and pub/sub", "asynchronous messaging patterns"],
  },
] as const;

export type AZ204DomainId = (typeof AZ204_DOMAINS)[number]["id"];
