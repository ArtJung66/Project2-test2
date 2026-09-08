export type RiskLevel = 'safe' | 'low' | 'medium' | 'high' | 'critical';

export interface CVE {
  id: string;
  severity: RiskLevel;
  description: string;
  cvss: number;
}

export interface PortService {
  port: number;
  protocol: 'tcp' | 'udp' | string;
  state: string;
  name?: string;
  product?: string;
  version?: string;
  extraInfo?: string;
  tunnel?: string;
  method?: string;
  confidence?: number;
  cpe?: string[];
}

export interface SecurityFinding {
  port: number;
  source: 'nmap-nse' | string;
  scriptId: string;
  title: string;
  severity: RiskLevel;
  evidence: string;
  recommendation: string;
  verified: boolean;
}

export interface RiskRationale {
  port: number;
  risk: RiskLevel;
  reason: string;
}

export interface Device {
  id: string;
  name: string;
  ipAddress: string;
  macAddress: string;
  openPorts: number[];
  services?: PortService[];
  findings?: SecurityFinding[];
  riskRationale?: RiskRationale[];
  riskLevel: RiskLevel;
  lastScan: Date;
  deviceType: string;
}

export interface ScanResult {
  id: string;
  scanDate: Date;
  devices: Device[];
  duration: number;
  scannedRange: string;
}

export interface PortInfo {
  port: number;
  service: string;
  risk: RiskLevel;
  description: string;
  cves?: CVE[];
}
