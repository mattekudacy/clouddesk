export const AZ500_DOMAINS = [
  {
    id: "identity-access",
    name: "Secure identity and access",
    weight: 0.18421052631578946,
    keyServices: ["Microsoft Entra ID", "Microsoft Entra Privileged Identity Management", "Azure Multi-Factor Authentication", "Conditional Access", "Managed Identities"],
    concepts: ["role assignment management", "custom role design", "privileged identity management", "conditional access policies", "managed identities and service principals"],
  },
  {
    id: "network-security",
    name: "Secure networking",
    weight: 0.23684210526315788,
    keyServices: ["Azure Virtual Network", "Azure Firewall", "Azure Virtual WAN", "Azure Private Endpoint", "Azure DDoS Protection Standard", "Azure Front Door"],
    concepts: ["network segmentation with NSGs and ASGs", "secure VPN and ExpressRoute connectivity", "private link and service endpoint access", "traffic filtering with Azure Firewall and WAF", "monitoring network security with Network Watcher"],
  },
  {
    id: "compute-security",
    name: "Secure compute, storage, and databases",
    weight: 0.23684210526315788,
    keyServices: ["Azure Bastion", "Azure Kubernetes Service (AKS)", "Azure Container Registry (ACR)", "Azure Disk Encryption (ADE)", "Azure SQL Database"],
    concepts: ["just-in-time VM access", "AKS network isolation", "disk encryption strategies", "storage data protection (soft delete, immutable)", "SQL encryption and dynamic masking"],
  },
  {
    id: "security-ops",
    name: "Secure Azure using Microsoft Defender for Cloud and Microsoft Sentinel",
    weight: 0.34210526315789475,
    keyServices: ["Azure Policy", "Azure Key Vault", "Microsoft Defender for Cloud", "Microsoft Sentinel", "Azure Monitor"],
    concepts: ["cloud governance enforcement", "key vault access and rotation", "secure score risk remediation", "multi-cloud workload protection", "security automation with alerts"],
  },
] as const;

export type AZ500DomainId = (typeof AZ500_DOMAINS)[number]["id"];
