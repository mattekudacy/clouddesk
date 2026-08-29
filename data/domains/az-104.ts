export const AZ104_DOMAINS = [
  {
    id: "identities",
    name: "Manage Azure Identities and Governance",
    weight: 0.20,
    keyServices: ["Azure AD", "RBAC", "Azure Policy", "Management Groups", "Subscriptions"],
    concepts: ["identity management", "role assignments", "governance", "compliance", "resource locks"],
  },
  {
    id: "storage",
    name: "Implement and Manage Storage",
    weight: 0.15,
    keyServices: ["Azure Blob Storage", "Azure Files", "Azure Storage Accounts", "Azure Import/Export"],
    concepts: ["storage tiers", "replication", "access keys", "shared access signatures", "lifecycle policies"],
  },
  {
    id: "compute",
    name: "Deploy and Manage Azure Compute Resources",
    weight: 0.20,
    keyServices: ["Azure VMs", "Azure App Service", "Azure Container Instances", "Azure Kubernetes Service", "Azure Functions"],
    concepts: ["VM sizing", "availability sets", "scale sets", "deployment slots", "containerization"],
  },
  {
    id: "networking",
    name: "Implement and Manage Virtual Networking",
    weight: 0.25,
    keyServices: ["Azure VNet", "Network Security Groups", "Azure DNS", "VPN Gateway", "Azure Load Balancer"],
    concepts: ["subnets", "peering", "routing", "DNS resolution", "network security", "private endpoints"],
  },
  {
    id: "monitoring",
    name: "Monitor and Maintain Azure Resources",
    weight: 0.20,
    keyServices: ["Azure Monitor", "Log Analytics", "Azure Alerts", "Azure Backup", "Azure Site Recovery"],
    concepts: ["metrics", "log queries", "backup policies", "disaster recovery", "cost management"],
  },
] as const;

export type AZ104DomainId = (typeof AZ104_DOMAINS)[number]["id"];
