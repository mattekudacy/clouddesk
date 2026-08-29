export const AZ500_DOMAINS = [
  {
    id: "identity-access",
    name: "Manage Identity and Access",
    weight: 0.25,
    keyServices: ["Azure AD", "Azure AD B2C", "Privileged Identity Management", "Conditional Access", "Azure AD Connect"],
    concepts: ["zero trust", "least privilege", "MFA", "conditional access policies", "identity governance"],
  },
  {
    id: "network-security",
    name: "Secure Networking",
    weight: 0.20,
    keyServices: ["Azure Firewall", "Azure DDoS Protection", "Network Security Groups", "Azure Bastion", "Azure Private Link"],
    concepts: ["network segmentation", "DDoS mitigation", "perimeter security", "private connectivity", "traffic inspection"],
  },
  {
    id: "compute-security",
    name: "Secure Compute, Storage, and Databases",
    weight: 0.25,
    keyServices: ["Azure Key Vault", "Azure Disk Encryption", "Azure Security Center", "Azure Defender", "Storage Service Encryption"],
    concepts: ["encryption at rest", "encryption in transit", "vulnerability management", "security posture", "just-in-time access"],
  },
  {
    id: "security-ops",
    name: "Manage Security Operations",
    weight: 0.30,
    keyServices: ["Microsoft Sentinel", "Azure Security Center", "Azure Monitor", "Azure Policy", "Microsoft Defender for Cloud"],
    concepts: ["SIEM", "threat detection", "incident response", "compliance management", "security automation"],
  },
] as const;

export type AZ500DomainId = (typeof AZ500_DOMAINS)[number]["id"];
