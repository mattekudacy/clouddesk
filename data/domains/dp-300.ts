export const DP300_DOMAINS = [
  {
    id: "plan-implement",
    name: "Plan and Implement Data Platform Resources",
    weight: 0.20,
    keyServices: ["Azure SQL Database", "Azure SQL Managed Instance", "Azure Database for PostgreSQL", "Azure Database for MySQL"],
    concepts: ["deployment options", "service tiers", "elastic pools", "migration strategies", "hybrid scenarios"],
  },
  {
    id: "secure-compliance",
    name: "Implement a Secure Environment",
    weight: 0.15,
    keyServices: ["Azure AD authentication", "Azure Key Vault", "Transparent Data Encryption", "Always Encrypted", "Azure Defender for SQL"],
    concepts: ["database authentication", "encryption at rest", "dynamic data masking", "auditing", "Advanced Threat Protection"],
  },
  {
    id: "monitor-optimize",
    name: "Monitor and Optimize Operational Resources",
    weight: 0.20,
    keyServices: ["Azure Monitor", "Query Performance Insight", "Azure SQL Analytics", "Intelligent Performance"],
    concepts: ["performance monitoring", "resource utilization", "automatic tuning", "alerts", "database advisors"],
  },
  {
    id: "query-performance",
    name: "Optimize Query Performance",
    weight: 0.20,
    keyServices: ["Query Store", "Execution Plans", "Index Advisor", "Automatic Tuning", "In-Memory OLTP"],
    concepts: ["query tuning", "indexing strategies", "statistics", "execution plan analysis", "blocking and deadlocks"],
  },
  {
    id: "tasks-automation",
    name: "Perform Automation of Tasks",
    weight: 0.10,
    keyServices: ["Azure Automation", "SQL Agent", "Elastic Jobs", "Azure Logic Apps", "Azure Data Factory"],
    concepts: ["scheduled jobs", "maintenance tasks", "index maintenance", "backup automation", "runbooks"],
  },
  {
    id: "ha-dr",
    name: "Plan and Implement High Availability and Disaster Recovery",
    weight: 0.15,
    keyServices: ["Always On Availability Groups", "Azure SQL Geo-Replication", "Failover Groups", "Azure Backup", "Long-Term Retention"],
    concepts: ["RTO", "RPO", "failover", "geo-redundancy", "backup and restore", "business continuity"],
  },
] as const;

export type DP300DomainId = (typeof DP300_DOMAINS)[number]["id"];
