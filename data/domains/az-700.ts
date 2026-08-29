export const AZ700_DOMAINS = [
  {
    id: "hybrid-connectivity",
    name: "Design, Implement, and Manage Hybrid Networking",
    weight: 0.20,
    keyServices: ["Azure VPN Gateway", "Azure ExpressRoute", "Azure Virtual WAN", "Azure Route Server"],
    concepts: ["site-to-site VPN", "point-to-site VPN", "ExpressRoute circuits", "BGP routing", "hybrid connectivity"],
  },
  {
    id: "core-infra",
    name: "Design and Implement Core Networking Infrastructure",
    weight: 0.20,
    keyServices: ["Azure Virtual Network", "Azure DNS", "Azure DDoS Protection", "Azure Firewall", "Network Security Groups"],
    concepts: ["VNet design", "IP addressing", "DNS resolution", "network segmentation", "hub-spoke topology"],
  },
  {
    id: "routing",
    name: "Design and Implement Routing",
    weight: 0.25,
    keyServices: ["Azure Route Tables", "Azure Route Server", "Azure Virtual WAN", "Border Gateway Protocol"],
    concepts: ["user-defined routes", "system routes", "BGP", "route propagation", "traffic management"],
  },
  {
    id: "load-balancing",
    name: "Secure and Monitor Networks",
    weight: 0.20,
    keyServices: ["Azure Load Balancer", "Azure Application Gateway", "Azure Front Door", "Azure Traffic Manager", "Azure Network Watcher"],
    concepts: ["load balancing algorithms", "WAF", "network monitoring", "packet capture", "connection troubleshooting"],
  },
  {
    id: "private-access",
    name: "Design and Implement Private Access to Azure Services",
    weight: 0.15,
    keyServices: ["Azure Private Link", "Azure Private Endpoint", "Azure Service Endpoints", "Azure App Service VNet Integration"],
    concepts: ["private endpoints", "service endpoints", "DNS private zones", "network isolation", "data exfiltration prevention"],
  },
] as const;

export type AZ700DomainId = (typeof AZ700_DOMAINS)[number]["id"];
