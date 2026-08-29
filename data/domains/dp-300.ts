export const DP300_DOMAINS = [
  {
    id: "plan-implement",
    name: "Plan and implement data platform resources",
    weight: 0.17073170731707318,
    keyServices: ["Azure SQL Database", "Azure SQL Managed Instance", "SQL Server on Azure Virtual Machines", "Azure Arc-enabled SQL services", "Microsoft Fabric"],
    concepts: ["database offering selection", "automated deployment", "table partitioning", "sharding strategy", "scale and performance configuration", "migration strategy (online/offline)"],
  },
  {
    id: "secure-compliance",
    name: "Implement a secure environment",
    weight: 0.21951219512195122,
    keyServices: ["Azure SQL Database", "Azure SQL Managed Instance", "Microsoft Entra ID", "Azure Private Link"],
    concepts: ["authentication and authorization", "least privilege access", "encryption at rest and in transit", "row-level security and dynamic data masking", "data classification and compliance auditing"],
  },
  {
    // New id, not a rename — Microsoft merged the previous "Monitor and
    // Optimize Operational Resources" and "Optimize Query Performance"
    // domains into this single objective (6 domains -> 5). Old ids
    // monitor-optimize/query-performance are dropped; see PR description.
    id: "performance",
    name: "Monitor, configure, and optimize database resources",
    weight: 0.21951219512195122,
    keyServices: ["Azure Monitor", "Database Watcher", "Extended Events", "Query Store", "Intelligent Insights", "Resource Governor"],
    concepts: ["performance baseline creation", "query store monitoring", "index and statistics maintenance", "session blocking identification", "resource governor configuration"],
  },
  {
    id: "tasks-automation",
    name: "Configure and manage automation of tasks",
    weight: 0.17073170731707318,
    keyServices: ["SQL Server Agent", "Azure Resource Manager", "Bicep", "Azure PowerShell", "Azure CLI", "Azure Elastic Jobs"],
    concepts: ["job scheduling", "deployment automation", "alerting and notifications", "troubleshooting deployments", "elastic job configuration"],
  },
  {
    id: "ha-dr",
    name: "Plan and configure a high availability and disaster recovery (HA/DR) environment",
    weight: 0.21951219512195122,
    keyServices: ["Azure SQL Managed Instance", "Azure Virtual Machines", "Active Geo-Replication", "Failover Groups", "Azure Monitor"],
    concepts: ["RPO/RTO based HA/DR strategy", "hybrid deployment HA/DR evaluation", "backup and restore planning and execution", "long-term backup retention", "point-in-time restore", "testing HA/DR procedures"],
  },
] as const;

export type DP300DomainId = (typeof DP300_DOMAINS)[number]["id"];
