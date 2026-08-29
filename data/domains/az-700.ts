export const AZ700_DOMAINS = [
  {
    id: "core-infra",
    name: "Design and implement core networking infrastructure",
    weight: 0.28205128205128205,
    keyServices: ["Azure Virtual Network", "Azure DNS", "Azure NAT Gateway", "Azure Network Watcher", "Azure Virtual Network Manager"],
    concepts: ["IP address and subnet design", "VNet routing and user-defined routes", "DNS zones and private resolver configuration", "network monitoring and diagnostics", "network security and DDoS protection"],
  },
  {
    id: "hybrid-connectivity",
    name: "Design, implement, and manage connectivity services",
    weight: 0.23076923076923078,
    keyServices: ["Azure VPN Gateway", "Azure ExpressRoute", "Azure Virtual WAN", "Azure Virtual Network Gateway", "Azure Network Adapter"],
    concepts: ["site-to-site VPN design", "point-to-site VPN authentication", "ExpressRoute connectivity models", "Virtual WAN hub routing", "high availability VPN", "policy vs route-based VPN"],
  },
  {
    // New domain, not a rename of any single old one — Microsoft split
    // what used to be one bundled "routing" objective into core routing
    // (folded into core-infra above) and this dedicated application
    // delivery objective. See PR description for why this gets a new id
    // instead of reusing the old "routing" one.
    id: "app-delivery",
    name: "Design and implement application delivery services",
    weight: 0.1794871794871795,
    keyServices: ["Azure Load Balancer", "Azure Traffic Manager", "Azure Application Gateway", "Azure Front Door", "Gateway Load Balancer"],
    concepts: ["load balancing rule design", "traffic routing and failover", "TLS termination and end-to-end encryption", "health probes and backend pool configuration", "autoscale and capacity planning", "URL rewrite and redirect policies"],
  },
  {
    id: "private-access",
    name: "Design and implement private access to Azure services",
    weight: 0.1282051282051282,
    keyServices: ["Azure Private Link", "Azure Private Endpoint", "Azure Service Endpoint", "Azure DNS"],
    concepts: ["design private endpoints", "plan private endpoints", "configure access to private endpoints", "integrate Private Link with DNS", "integrate Private Link with on-premises clients", "service endpoint policies"],
  },
  {
    // New domain — see the app-delivery comment above. This absorbs what
    // used to be part of the old "Secure and Monitor Networks" objective.
    id: "network-security",
    name: "Design and implement Azure network security services",
    weight: 0.1794871794871795,
    keyServices: ["Network Security Groups", "Application Security Groups", "Azure Firewall", "Azure Firewall Manager", "Web Application Firewall"],
    concepts: ["NSG rule creation and association", "virtual network flow logs analysis", "Azure Firewall SKU selection", "secure hub design with Virtual WAN", "WAF policy configuration"],
  },
] as const;

export type AZ700DomainId = (typeof AZ700_DOMAINS)[number]["id"];
