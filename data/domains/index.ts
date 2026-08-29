import { AZ104_DOMAINS } from "./az-104";
import { AZ204_DOMAINS } from "./az-204";
import { AZ500_DOMAINS } from "./az-500";
import { AZ700_DOMAINS } from "./az-700";
import { DP300_DOMAINS } from "./dp-300";

export const CERT_REGISTRY = {
  "az-104": { name: "Azure Administrator Associate", domains: AZ104_DOMAINS },
  "az-204": { name: "Azure Developer Associate", domains: AZ204_DOMAINS },
  "az-500": { name: "Azure Security Engineer Associate", domains: AZ500_DOMAINS },
  "az-700": { name: "Azure Network Engineer Associate", domains: AZ700_DOMAINS },
  "dp-300": { name: "Azure Database Administrator Associate", domains: DP300_DOMAINS },
} as const;

export type CertId = keyof typeof CERT_REGISTRY;

// Helper: get a domain's human-readable name within a cert
export function getDomainName(certId: CertId, domainId: string): string {
  const domain = (CERT_REGISTRY[certId].domains as readonly { id: string; name: string }[])
    .find((d) => d.id === domainId);
  return domain?.name ?? domainId;
}
