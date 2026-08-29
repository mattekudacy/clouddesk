export const AZ104_DOMAINS = [
  {
    id: "identities",
    name: "Manage Azure identities and governance",
    weight: 0.24324324324324326,
    keyServices: ["Microsoft Entra ID", "Azure Policy", "Azure Management Groups", "Azure Advisor"],
    concepts: ["user and group lifecycle management", "self-service password reset", "role assignment scopes", "resource governance with locks and tags", "cost monitoring and budgeting"],
  },
  {
    id: "storage",
    name: "Implement and manage storage",
    weight: 0.1891891891891892,
    keyServices: ["Azure Storage", "Azure Files", "Azure Blob Storage", "Azure Storage Explorer", "AzCopy"],
    concepts: ["access control and firewalls", "identity-based access", "storage redundancy and replication", "encryption and data protection", "tiering and lifecycle management"],
  },
  {
    id: "compute",
    name: "Deploy and manage Azure compute resources",
    weight: 0.24324324324324326,
    keyServices: ["Azure Resource Manager", "Azure Virtual Machines", "Azure Virtual Machine Scale Sets", "Azure Container Instances", "Azure App Service"],
    concepts: ["Infrastructure as Code", "template authoring and modification", "VM sizing and scaling", "container deployment and scaling", "App Service configuration and deployment slots"],
  },
  {
    id: "networking",
    name: "Implement and manage virtual networking",
    weight: 0.1891891891891892,
    keyServices: ["Azure Virtual Network", "Azure Bastion", "Azure DNS", "Azure Load Balancer", "Network Security Groups"],
    concepts: ["virtual network and subnet design", "VNet peering configuration", "user-defined routes (UDR)", "effective NSG rule evaluation", "private endpoint and service endpoint setup", "load balancer troubleshooting"],
  },
  {
    id: "monitoring",
    name: "Monitor and maintain Azure resources",
    weight: 0.13513513513513514,
    keyServices: ["Azure Monitor", "Azure Monitor Insights", "Azure Network Watcher", "Azure Backup", "Azure Site Recovery"],
    concepts: ["metrics interpretation", "log analytics query and analysis", "alert rule and action group configuration", "VM/storage/network insights monitoring", "backup policy creation and restore operations", "site recovery failover to secondary region"],
  },
] as const;

export type AZ104DomainId = (typeof AZ104_DOMAINS)[number]["id"];
