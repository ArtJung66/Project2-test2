import http from 'node:http';
import os from 'node:os';
import net from 'node:net';
import dns from 'node:dns/promises';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

function loadEnvFile(filePath = '.env') {
  if (!existsSync(filePath)) return;

  const envText = readFileSync(filePath, 'utf8');
  for (const rawLine of envText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (!key || process.env[key] !== undefined) continue;

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

loadEnvFile();

const PORT = Number(process.env.HOST_DISCOVERY_PORT ?? 4000);
const COMMON_SERVICE_PORTS = (process.env.BASIC_SCAN_COMMON_PORTS ?? '21,22,23,25,53,80,110,135,139,143,389,443,445,465,587,993,995,1433,1521,3306,3389,5000,5432,5900,6379,8080,8443,27017')
  .split(',')
  .map((port) => Number(port.trim()))
  .filter(Number.isInteger);
const FULL_SCAN_PORT_RANGE = process.env.FULL_SCAN_PORT_RANGE ?? '1-10000';
const DEFAULT_TIMEOUT_MS = Number(process.env.DISCOVERY_TIMEOUT_MS ?? 1500);
const DISCOVERY_PING_ATTEMPTS = Number(process.env.DISCOVERY_PING_ATTEMPTS ?? 3);
const MAX_HOSTS = Number(process.env.DISCOVERY_MAX_HOSTS ?? 512);
const MAX_PORTS = Number(process.env.DISCOVERY_MAX_PORTS ?? 10000);
const PORT_SCAN_CONCURRENCY = Number(process.env.PORT_SCAN_CONCURRENCY ?? 200);
const NMAP_SERVICE_TIMEOUT_MS = Number(process.env.NMAP_SERVICE_TIMEOUT_MS ?? 90000);
const NMAP_COMMAND = process.env.NMAP_PATH || 'nmap';
const NMAP_SAFE_SCRIPT_PROFILES = {
  21: ['ftp-anon'],
  22: ['ssh2-enum-algos'],
  80: ['http-headers', 'http-security-headers'],
  139: ['smb-protocols', 'smb-security-mode', 'smb2-security-mode', 'smb-vuln-ms17-010'],
  443: ['http-headers', 'http-security-headers'],
  445: ['smb-protocols', 'smb-security-mode', 'smb2-security-mode', 'smb-vuln-ms17-010'],
  3389: ['rdp-enum-encryption', 'rdp-ntlm-info'],
  6379: ['redis-info'],
  8080: ['http-headers', 'http-security-headers'],
  8443: ['http-headers', 'http-security-headers'],
};
const PORT_RISK_RATIONALE = {
  21: 'FTP often exposes file transfer and may allow weak or anonymous access, so an open FTP service is at least medium exposure.',
  22: 'SSH is an administrative service but can be acceptable when restricted and hardened, so it starts as low exposure.',
  23: 'Telnet sends credentials in clear text and is rarely acceptable, so it is critical exposure.',
  80: 'Plain HTTP may be normal for public web services, but it can expose unencrypted traffic, so it starts low.',
  135: 'MS RPC exposes Windows management surfaces and should usually be limited to trusted networks, so it is medium.',
  139: 'NetBIOS/SMB over NetBIOS can expose legacy Windows file-sharing surfaces, so it is medium.',
  445: 'SMB is a high-value lateral-movement and file-sharing surface, so broad exposure is high risk.',
  3389: 'RDP is remote interactive access and a frequent brute-force target, so exposure is high.',
  5900: 'VNC is remote interactive access and often weakly protected, so exposure is high.',
  1433: 'MSSQL should usually only be reachable by application/admin hosts, so exposure is high.',
  3306: 'MySQL should usually only be reachable by application/admin hosts, so exposure is high.',
  5432: 'PostgreSQL should usually only be reachable by application/admin hosts, so exposure is high.',
  6379: 'Redis is often deployed without internet-facing authentication assumptions, so exposure is high.',
  27017: 'MongoDB should usually only be reachable by application/admin hosts, so exposure is high.',
};
const PORT_RISK_RULES = {
  21: 'medium',
  22: 'low',
  23: 'critical',
  80: 'low',
  135: 'medium',
  139: 'medium',
  445: 'high',
  3389: 'high',
  5900: 'high',
  1433: 'high',
  3306: 'high',
  5432: 'high',
  6379: 'high',
  27017: 'high',
};
const RISK_WEIGHT = {
  safe: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};
const scanJobs = new Map();

function json(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
  });
  res.end(JSON.stringify(body, null, 2));
}

function sse(res, status = 200) {
  res.writeHead(status, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'access-control-allow-origin': '*',
  });
}

function writeSse(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function publicJob(job) {
  return {
    id: job.id,
    mode: job.mode,
    status: job.status,
    progress: job.progress,
    message: job.message,
    result: job.result,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

function updateJob(job, patch) {
  Object.assign(job, patch, { updatedAt: Date.now() });
  const payload = publicJob(job);
  for (const client of job.clients) {
    writeSse(client, job.status === 'completed' ? 'complete' : job.status === 'failed' ? 'error' : 'update', payload);
  }
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function ipToInt(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => part < 0 || part > 255 || !Number.isInteger(part))) {
    throw new Error(`Invalid IPv4 address: ${ip}`);
  }
  return parts.reduce((acc, part) => ((acc << 8) | part) >>> 0, 0);
}

function intToIp(int) {
  return [24, 16, 8, 0].map((shift) => (int >>> shift) & 255).join('.');
}

function expandCidr(cidr) {
  const [baseIp, prefixText] = cidr.split('/');
  const prefix = Number(prefixText);
  if (!baseIp || !Number.isInteger(prefix) || prefix < 16 || prefix > 32) {
    throw new Error('Target must be an IPv4 CIDR between /16 and /32, for example 26.12.34.0/24');
  }

  const base = ipToInt(baseIp);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = (base & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const first = prefix === 32 ? network : network + 1;
  const last = prefix >= 31 ? broadcast : broadcast - 1;
  const count = last - first + 1;

  if (count > MAX_HOSTS) {
    throw new Error(`Target expands to ${count} hosts. Limit is ${MAX_HOSTS}. Use a smaller CIDR or set DISCOVERY_MAX_HOSTS.`);
  }

  return Array.from({ length: count }, (_, index) => intToIp(first + index));
}

function normalizeTarget(target) {
  const trimmed = target.trim();
  return trimmed.includes('/') ? trimmed : `${trimmed}/32`;
}

function parseTargets(targetText) {
  const targets = targetText
    .split(/[\s,;]+/)
    .map((target) => target.trim())
    .filter(Boolean)
    .map(normalizeTarget);

  if (targets.length === 0) {
    throw new Error('Missing target CIDR, for example 26.12.34.5 or 26.12.34.0/24');
  }

  const ips = [];
  const seen = new Set();
  for (const target of targets) {
    for (const ip of expandCidr(target)) {
      if (!seen.has(ip)) {
        seen.add(ip);
        ips.push(ip);
      }
    }
  }

  if (ips.length > MAX_HOSTS) {
    throw new Error(`Targets expand to ${ips.length} unique hosts. Limit is ${MAX_HOSTS}.`);
  }

  return { targets, ips };
}

function parsePorts(input) {
  const rawParts = Array.isArray(input)
    ? input.flatMap((item) => String(item).split(/[\s,;]+/))
    : String(input ?? '').split(/[\s,;]+/);

  const ports = [];
  const seen = new Set();

  for (const part of rawParts.map((item) => item.trim()).filter(Boolean)) {
    const range = part.match(/^(\d+)-(\d+)$/);
    const values = range
      ? Array.from(
          { length: Number(range[2]) - Number(range[1]) + 1 },
          (_, index) => Number(range[1]) + index,
        )
      : [Number(part)];

    for (const port of values) {
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`Invalid port: ${part}`);
      }
      if (!seen.has(port)) {
        seen.add(port);
        ports.push(port);
      }
    }
  }

  if (ports.length === 0) return COMMON_SERVICE_PORTS;
  if (ports.length > MAX_PORTS) {
    throw new Error(`Too many ports: ${ports.length}. Limit is ${MAX_PORTS}.`);
  }

  return ports.sort((a, b) => a - b);
}

function compactPortsForNmap(ports) {
  const sorted = [...new Set(ports)].sort((a, b) => a - b);
  const ranges = [];
  let start = sorted[0];
  let previous = sorted[0];

  for (let index = 1; index <= sorted.length; index += 1) {
    const port = sorted[index];
    if (port === previous + 1) {
      previous = port;
      continue;
    }

    ranges.push(start === previous ? String(start) : `${start}-${previous}`);
    start = port;
    previous = port;
  }

  return ranges.join(',');
}

function execFileAsync(command, args, timeoutMs = 1200) {
  return new Promise((resolve) => {
    try {
      const child = execFile(command, args, { timeout: timeoutMs, windowsHide: true }, (error, stdout, stderr) => {
        resolve({ ok: !error, stdout: stdout ?? '', stderr: stderr ?? '', error });
      });
      child.once('error', (error) => resolve({ ok: false, stdout: '', stderr: '', error }));
    } catch {
      resolve({ ok: false, stdout: '', stderr: '', error: null });
    }
  });
}

async function pingHost(ip, timeoutMs, sourceAddress = '') {
  const isWindows = os.platform() === 'win32';
  const args = isWindows
    ? ['-n', '1', '-w', String(timeoutMs), ...(sourceAddress ? ['-S', sourceAddress] : []), ip]
    : ['-c', '1', '-W', String(Math.max(1, Math.ceil(timeoutMs / 1000))), ...(sourceAddress ? ['-I', sourceAddress] : []), ip];
  for (let attempt = 0; attempt < Math.max(1, DISCOVERY_PING_ATTEMPTS); attempt += 1) {
    const result = await execFileAsync('ping', args, timeoutMs + 700);
    if (result.ok || /ttl=|bytes=|reply from/i.test(result.stdout)) return true;
  }
  return false;
}

function checkPort(ip, port, timeoutMs, sourceAddress = '') {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (open) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(open);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect({ port, host: ip, ...(sourceAddress ? { localAddress: sourceAddress } : {}) });
  });
}

function decodeXmlValue(value = '') {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

function parseXmlAttributes(text = '') {
  const attrs = {};
  for (const match of text.matchAll(/(\w+)="([^"]*)"/g)) {
    attrs[match[1]] = decodeXmlValue(match[2]);
  }
  return attrs;
}

function getNmapScriptsForPorts(ports) {
  const scripts = new Set();
  for (const port of ports) {
    for (const script of NMAP_SAFE_SCRIPT_PROFILES[port] ?? []) {
      scripts.add(script);
    }
  }
  return Array.from(scripts);
}

function scriptOutputToFinding(port, scriptId, output) {
  const normalized = output.toLowerCase();
  const isVulnerable = /\bvulnerable\b/.test(normalized) && !/\bnot vulnerable\b/.test(normalized);
  const mentionsSmb1 = scriptId === 'smb-protocols' && /smbv1|nt lm 0\.12|insecure/.test(normalized);
  const signingNotRequired = /message signing enabled but not required|message signing.*not required|signing.*disabled/.test(normalized);
  const anonymousFtp = scriptId === 'ftp-anon' && /anonymous ftp login allowed|anonymous.*allowed/i.test(output);
  const weakSshAlgorithm = scriptId === 'ssh2-enum-algos' && /(diffie-hellman-group1-sha1|ssh-dss|cbc|hmac-md5|arcfour|3des-cbc)/.test(normalized);
  const missingHttpSecurityHeader = scriptId === 'http-security-headers' && /(strict.transport.security|content.security.policy|x.frame.options|x.content.type.options)[\s\S]{0,80}(not configured|missing)/.test(normalized);
  const redisInfoDisclosure = scriptId === 'redis-info' && /redis_version|redis server/i.test(output);
  const rdpLegacySecurity = scriptId === 'rdp-enum-encryption' && /rdp protocol security:\s*success/i.test(output);

  if (scriptId === 'smb-vuln-ms17-010' && isVulnerable) {
    return {
      port,
      source: 'nmap-nse',
      scriptId,
      title: 'MS17-010 vulnerability detected',
      severity: 'critical',
      evidence: output,
      recommendation: 'Patch the host against MS17-010 and restrict SMB access to trusted networks.',
      verified: true,
    };
  }

  if (anonymousFtp) {
    return {
      port,
      source: 'nmap-nse',
      scriptId,
      title: 'Anonymous FTP login is allowed',
      severity: 'high',
      evidence: output,
      recommendation: 'Disable anonymous FTP access or strictly limit it to read-only public content.',
      verified: true,
    };
  }

  if (mentionsSmb1) {
    return {
      port,
      source: 'nmap-nse',
      scriptId,
      title: 'SMBv1 appears enabled',
      severity: 'high',
      evidence: output,
      recommendation: 'Disable SMBv1 and use SMBv2/SMBv3 only.',
      verified: true,
    };
  }

  if (weakSshAlgorithm) {
    return {
      port,
      source: 'nmap-nse',
      scriptId,
      title: 'Weak SSH algorithms are offered',
      severity: 'medium',
      evidence: output,
      recommendation: 'Disable legacy SSH algorithms such as group1 SHA-1, DSS, CBC, 3DES, arcfour, and MD5 MACs.',
      verified: true,
    };
  }

  if (signingNotRequired) {
    return {
      port,
      source: 'nmap-nse',
      scriptId,
      title: 'SMB signing is not required',
      severity: 'medium',
      evidence: output,
      recommendation: 'Require SMB signing where possible to reduce relay and man-in-the-middle risk.',
      verified: true,
    };
  }

  if (missingHttpSecurityHeader) {
    return {
      port,
      source: 'nmap-nse',
      scriptId,
      title: 'HTTP security headers are missing',
      severity: 'low',
      evidence: output,
      recommendation: 'Review and add appropriate security headers such as HSTS, CSP, X-Frame-Options, and X-Content-Type-Options.',
      verified: true,
    };
  }

  if (rdpLegacySecurity) {
    return {
      port,
      source: 'nmap-nse',
      scriptId,
      title: 'Legacy RDP security layer is accepted',
      severity: 'medium',
      evidence: output,
      recommendation: 'Require Network Level Authentication and prefer TLS/CredSSP for RDP.',
      verified: true,
    };
  }

  if (redisInfoDisclosure) {
    return {
      port,
      source: 'nmap-nse',
      scriptId,
      title: 'Redis service information is exposed',
      severity: 'medium',
      evidence: output,
      recommendation: 'Restrict Redis to trusted interfaces and require authentication where supported.',
      verified: true,
    };
  }

  if (isVulnerable) {
    return {
      port,
      source: 'nmap-nse',
      scriptId,
      title: `${scriptId} reported a vulnerability`,
      severity: 'high',
      evidence: output,
      recommendation: 'Review the Nmap script evidence and remediate the reported issue.',
      verified: true,
    };
  }

  return null;
}

function parseNmapXml(xml) {
  const services = [];
  const findings = [];
  const portBlocks = xml.matchAll(/<port\b([^>]*)>([\s\S]*?)<\/port>/g);

  for (const block of portBlocks) {
    const portAttrs = parseXmlAttributes(block[1]);
    const body = block[2];
    const stateMatch = body.match(/<state\b([^>]*)\/?>/);
    const stateAttrs = parseXmlAttributes(stateMatch?.[1] ?? '');

    if (stateAttrs.state !== 'open') continue;

    const serviceMatch = body.match(/<service\b([^>]*)\/?>/);
    const serviceAttrs = parseXmlAttributes(serviceMatch?.[1] ?? '');
    const cpeValues = Array.from(body.matchAll(/<cpe>([^<]*)<\/cpe>/g)).map((match) =>
      decodeXmlValue(match[1]),
    );
    const port = Number(portAttrs.portid);

    for (const scriptMatch of body.matchAll(/<script\b([^>]*)\/?>/g)) {
      const scriptAttrs = parseXmlAttributes(scriptMatch[1]);
      const finding = scriptOutputToFinding(port, scriptAttrs.id, scriptAttrs.output ?? '');
      if (finding) findings.push(finding);
    }

    services.push({
      port,
      protocol: portAttrs.protocol ?? 'tcp',
      state: stateAttrs.state,
      name: serviceAttrs.name,
      product: serviceAttrs.product,
      version: serviceAttrs.version,
      extraInfo: serviceAttrs.extrainfo,
      tunnel: serviceAttrs.tunnel,
      method: serviceAttrs.method,
      confidence: serviceAttrs.conf ? Number(serviceAttrs.conf) : undefined,
      cpe: cpeValues,
    });
  }

  return {
    services: services.filter((service) => Number.isInteger(service.port)),
    findings,
  };
}

async function runNmapServiceScan(ip, ports, scripts = [], sourceAddress = '') {
  if (ports.length === 0) return null;
  const args = ['-sV', '-Pn', '-p', compactPortsForNmap(ports)];
  if (sourceAddress) args.push('--source-ip', sourceAddress);
  if (scripts.length > 0) {
    args.push('--script', scripts.join(','));
  }
  args.push('-oX', '-', ip);
  const result = await execFileAsync(NMAP_COMMAND, args, NMAP_SERVICE_TIMEOUT_MS);
  if (!result.ok || !result.stdout.includes('<nmaprun')) return null;

  const { services, findings } = parseNmapXml(result.stdout);
  return {
    openPorts: services.map((service) => service.port).sort((a, b) => a - b),
    services,
    findings,
  };
}

async function scanPortsWithNmap(ip, ports, sourceAddress = '') {
  const scripts = getNmapScriptsForPorts(ports);
  const scriptedResult = await runNmapServiceScan(ip, ports, scripts, sourceAddress);
  if (scriptedResult) return scriptedResult;

  return runNmapServiceScan(ip, ports, [], sourceAddress);
}

async function checkPorts(ip, ports, timeoutMs, sourceAddress = '') {
  const results = [];
  let cursor = 0;

  async function worker() {
    while (cursor < ports.length) {
      const port = ports[cursor++];
      results.push({
        port,
        open: await checkPort(ip, port, timeoutMs, sourceAddress),
      });
    }
  }

  await Promise.all(Array.from({ length: Math.min(PORT_SCAN_CONCURRENCY, ports.length) }, worker));
  return results.sort((a, b) => a.port - b.port);
}

async function checkPortsWithProgress(ip, ports, timeoutMs, onPortDone, sourceAddress = '') {
  const results = [];
  let cursor = 0;

  async function worker() {
    while (cursor < ports.length) {
      const port = ports[cursor++];
      const open = await checkPort(ip, port, timeoutMs, sourceAddress);
      results.push({ port, open });
      onPortDone?.(ip, port, open);
    }
  }

  await Promise.all(Array.from({ length: Math.min(PORT_SCAN_CONCURRENCY, ports.length) }, worker));
  return results.sort((a, b) => a.port - b.port);
}

async function getHostname(ip) {
  try {
    const names = await dns.reverse(ip);
    return names[0] ?? ip;
  } catch {
    return ip;
  }
}

async function getArpMac(ip) {
  const isWindows = os.platform() === 'win32';
  const result = await execFileAsync(isWindows ? 'arp' : 'arp', isWindows ? ['-a', ip] : ['-n', ip], 1200);
  const mac = result.stdout.match(/([0-9a-f]{2}[:-]){5}[0-9a-f]{2}/i)?.[0];
  return mac?.replaceAll('-', ':').toUpperCase() ?? '';
}

function classifyDevice(openPorts, services = []) {
  const serviceText = services
    .map((service) => [service.name, service.product, service.extraInfo, ...(service.cpe ?? [])].filter(Boolean).join(' '))
    .join(' ')
    .toLowerCase();

  if (serviceText.includes('apple') || serviceText.includes('mac os') || serviceText.includes('macos')) return 'macOS Host';
  if (serviceText.includes('microsoft') || serviceText.includes('windows')) return 'Windows Host';
  if (serviceText.includes('linux') || serviceText.includes('ubuntu') || serviceText.includes('debian')) return 'Linux Host';

  if (openPorts.includes(5000) && openPorts.includes(7000)) return 'macOS/AirPlay Host';
  if (openPorts.includes(3389)) return 'Windows/RDP Host';
  if (openPorts.includes(445) || openPorts.includes(139)) return 'Windows Host';
  if (openPorts.includes(22)) return 'Linux/SSH Host';
  if (openPorts.includes(80) || openPorts.includes(443) || openPorts.includes(8080)) return 'Web Service';
  return 'Unknown Host';
}

function calculateRiskLevel(openPorts) {
  return openPorts.reduce((highestRisk, port) => {
    const risk = PORT_RISK_RULES[port] ?? 'safe';
    return RISK_WEIGHT[risk] > RISK_WEIGHT[highestRisk] ? risk : highestRisk;
  }, 'safe');
}

function calculateDeviceRisk(openPorts, findings) {
  return findings.reduce((highestRisk, finding) => {
    const risk = finding.severity ?? 'safe';
    return RISK_WEIGHT[risk] > RISK_WEIGHT[highestRisk] ? risk : highestRisk;
  }, calculateRiskLevel(openPorts));
}

function getRiskRationale(openPorts) {
  return openPorts
    .map((port) => ({
      port,
      risk: PORT_RISK_RULES[port] ?? 'safe',
      reason: PORT_RISK_RATIONALE[port] ?? 'No specific exposure rule is defined for this port.',
    }))
    .filter((item) => item.risk !== 'safe');
}

async function buildDevice(ip, openPorts, services = [], findings = []) {
  const [name, macAddress] = await Promise.all([getHostname(ip), getArpMac(ip)]);

  return {
    id: randomUUID(),
    name,
    ipAddress: ip,
    macAddress,
    openPorts,
    services,
    findings,
    riskRationale: getRiskRationale(openPorts),
    riskLevel: calculateDeviceRisk(openPorts, findings),
    lastScan: new Date().toISOString(),
    deviceType: classifyDevice(openPorts, services),
  };
}

async function discoverHost(ip, timeoutMs, sourceAddress = '') {
  const aliveByPing = await pingHost(ip, timeoutMs, sourceAddress);
  if (!aliveByPing) return null;
  return buildDevice(ip, []);
}

async function scanHostPorts(ip, ports, timeoutMs, knownDevice = null, sourceAddress = '') {
  const nmapResult = await scanPortsWithNmap(ip, ports, sourceAddress);
  const portChecks = nmapResult ? [] : await checkPorts(ip, ports, timeoutMs, sourceAddress);
  const openPorts = nmapResult
    ? nmapResult.openPorts
    : portChecks.filter((item) => item.open).map((item) => item.port);
  const aliveByPing = await pingHost(ip, timeoutMs, sourceAddress);

  if (!aliveByPing && openPorts.length === 0 && !knownDevice) return null;

  const device = await buildDevice(ip, openPorts, nmapResult?.services ?? [], nmapResult?.findings ?? []);
  return knownDevice
    ? {
        ...device,
        id: knownDevice.id ?? device.id,
        name: knownDevice.name ?? device.name,
        macAddress: knownDevice.macAddress ?? device.macAddress,
      }
    : device;
}

async function scanHostPortsWithProgress(ip, ports, timeoutMs, knownDevice = null, onPortDone, sourceAddress = '') {
  const portChecks = await checkPortsWithProgress(ip, ports, timeoutMs, onPortDone, sourceAddress);
  const openPorts = portChecks.filter((item) => item.open).map((item) => item.port);
  const aliveByPing = await pingHost(ip, timeoutMs, sourceAddress);

  if (!aliveByPing && openPorts.length === 0 && !knownDevice) return null;

  const nmapResult = openPorts.length > 0 ? await scanPortsWithNmap(ip, openPorts, sourceAddress) : null;
  const nmapOpenPorts = nmapResult?.openPorts ?? [];
  const mergedOpenPorts = Array.from(new Set([...openPorts, ...nmapOpenPorts])).sort((a, b) => a - b);
  const device = await buildDevice(ip, mergedOpenPorts, nmapResult?.services ?? [], nmapResult?.findings ?? []);

  return knownDevice
    ? {
        ...device,
        id: knownDevice.id ?? device.id,
        name: knownDevice.name ?? device.name,
        macAddress: knownDevice.macAddress ?? device.macAddress,
      }
    : device;
}

function isVirtualOrVpnAdapter(name, address) {
  return /radmin|vpn|virtual|vmware|virtualbox|hyper-v|loopback|tailscale|zerotier|wireguard|tap|tun/i.test(name)
    || address.startsWith('26.');
}

function listAdapters() {
  return Object.entries(os.networkInterfaces()).flatMap(([name, addresses]) =>
    (addresses ?? [])
      .filter((item) => item.family === 'IPv4' && !item.internal)
      .map((item) => {
        const isVirtual = isVirtualOrVpnAdapter(name, item.address);
        return {
        name,
        address: item.address,
        netmask: item.netmask,
        cidr: item.cidr,
        subnet: item.cidr ? `${intToIp(ipToInt(item.address) & ipToInt(item.netmask))}/${item.cidr.split('/')[1]}` : '',
        isVirtual,
        preferredForLanScan: !isVirtual,
      };
      })
  );
}

function resolveSourceAddress(value) {
  const sourceAddress = String(value ?? '').trim();
  if (!sourceAddress) return '';
  const adapter = listAdapters().find((item) => item.address === sourceAddress);
  if (!adapter) throw new Error('Selected network adapter is no longer available. Refresh adapters and try again.');
  if (adapter.isVirtual) throw new Error('VPN and virtual adapters cannot be used for a local network scan. Select a LAN/Wi-Fi adapter.');
  return adapter.address;
}

async function handleDiscovery(req, res) {
  const startedAt = Date.now();
  const body = await readBody(req);
  const target = String(body.target ?? '').trim();
  const timeoutMs = Number(body.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const sourceAddress = resolveSourceAddress(body.sourceAddress);

  if (!target) {
    return json(res, 400, { error: 'Missing target CIDR, for example 26.12.34.0/24' });
  }

  const { targets, ips } = parseTargets(target);
  const devices = [];
  let cursor = 0;
  const concurrency = Number(body.concurrency ?? 64);

  async function worker() {
    while (cursor < ips.length) {
      const ip = ips[cursor++];
      const device = await discoverHost(ip, timeoutMs, sourceAddress);
      if (device) devices.push(device);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, ips.length) }, worker));

  return json(res, 200, {
    targetRange: targets.join(', '),
    timestamp: Date.now(),
    durationMs: Date.now() - startedAt,
    ports: [],
    scanMode: 'discovery',
    devices: devices.sort((a, b) => ipToInt(a.ipAddress) - ipToInt(b.ipAddress)),
  });
}

async function handleBasicScan(req, res) {
  const startedAt = Date.now();
  const body = await readBody(req);
  const target = String(body.target ?? '').trim();
  const ports = parsePorts(body.ports);
  const timeoutMs = Number(body.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const sourceAddress = resolveSourceAddress(body.sourceAddress);

  const knownDevices = Array.isArray(body.devices) ? body.devices : [];
  const deviceIps = knownDevices
    .map((device) => String(device.ipAddress ?? '').trim())
    .filter(Boolean);

  const targetsAndIps = target
    ? parseTargets(target)
    : { targets: deviceIps.map(normalizeTarget), ips: deviceIps };

  if (targetsAndIps.ips.length === 0) {
    return json(res, 400, { error: 'Missing target or devices for basic scan' });
  }

  const devices = [];
  let cursor = 0;
  const concurrency = Number(body.concurrency ?? 32);

  async function worker() {
    while (cursor < targetsAndIps.ips.length) {
      const ip = targetsAndIps.ips[cursor++];
      const knownDevice = knownDevices.find((device) => device.ipAddress === ip);
      const device = await scanHostPorts(ip, ports, timeoutMs, knownDevice, sourceAddress);
      if (device) devices.push(device);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, targetsAndIps.ips.length) }, worker));

  return json(res, 200, {
    targetRange: targetsAndIps.targets.join(', '),
    timestamp: Date.now(),
    durationMs: Date.now() - startedAt,
    scannedPorts: ports,
    portProfile: 'common-services',
    scanMode: 'basic',
    devices: devices.sort((a, b) => ipToInt(a.ipAddress) - ipToInt(b.ipAddress)),
  });
}

async function handleFullScan(req, res) {
  const startedAt = Date.now();
  const body = await readBody(req);
  const target = String(body.target ?? '').trim();
  const ports = parsePorts(body.ports ?? FULL_SCAN_PORT_RANGE);
  const timeoutMs = Number(body.timeoutMs ?? 700);
  const sourceAddress = resolveSourceAddress(body.sourceAddress);

  const knownDevices = Array.isArray(body.devices) ? body.devices : [];
  const deviceIps = knownDevices
    .map((device) => String(device.ipAddress ?? '').trim())
    .filter(Boolean);

  const targetsAndIps = target
    ? parseTargets(target)
    : { targets: deviceIps.map(normalizeTarget), ips: deviceIps };

  if (targetsAndIps.ips.length === 0) {
    return json(res, 400, { error: 'Missing target or devices for full scan' });
  }

  const devices = [];
  let cursor = 0;
  const concurrency = Number(body.concurrency ?? 8);

  async function worker() {
    while (cursor < targetsAndIps.ips.length) {
      const ip = targetsAndIps.ips[cursor++];
      const knownDevice = knownDevices.find((device) => device.ipAddress === ip);
      const device = await scanHostPorts(ip, ports, timeoutMs, knownDevice, sourceAddress);
      if (device) devices.push(device);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, targetsAndIps.ips.length) }, worker));

  return json(res, 200, {
    targetRange: targetsAndIps.targets.join(', '),
    timestamp: Date.now(),
    durationMs: Date.now() - startedAt,
    scannedPorts: ports,
    portProfile: `full-${FULL_SCAN_PORT_RANGE}`,
    scanMode: 'full',
    devices: devices.sort((a, b) => ipToInt(a.ipAddress) - ipToInt(b.ipAddress)),
  });
}

async function runDiscoveryJob(job, body) {
  const startedAt = Date.now();
  const target = String(body.target ?? '').trim();
  const timeoutMs = Number(body.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const sourceAddress = resolveSourceAddress(body.sourceAddress);
  if (!target) throw new Error('Missing target CIDR, for example 26.12.34.0/24');

  const { targets, ips } = parseTargets(target);
  const devices = [];
  let cursor = 0;
  let completed = 0;
  const concurrency = Number(body.concurrency ?? 64);

  updateJob(job, { status: 'running', progress: 1, message: `Discovering ${ips.length} hosts` });

  async function worker() {
    while (cursor < ips.length) {
      const ip = ips[cursor++];
      const device = await discoverHost(ip, timeoutMs, sourceAddress);
      if (device) devices.push(device);
      completed += 1;
      updateJob(job, {
        progress: Math.min(95, Math.round((completed / ips.length) * 95)),
        message: `Checked ${completed}/${ips.length} hosts`,
      });
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, ips.length) }, worker));

  return {
    targetRange: targets.join(', '),
    timestamp: Date.now(),
    durationMs: Date.now() - startedAt,
    ports: [],
    scanMode: 'discovery',
    devices: devices.sort((a, b) => ipToInt(a.ipAddress) - ipToInt(b.ipAddress)),
  };
}

async function runPortScanJob(job, mode, body) {
  const startedAt = Date.now();
  const target = String(body.target ?? '').trim();
  const ports = parsePorts(mode === 'full' ? (body.ports ?? FULL_SCAN_PORT_RANGE) : body.ports);
  const timeoutMs = Number(body.timeoutMs ?? (mode === 'full' ? 700 : DEFAULT_TIMEOUT_MS));
  const sourceAddress = resolveSourceAddress(body.sourceAddress);
  const knownDevices = Array.isArray(body.devices) ? body.devices : [];
  const deviceIps = knownDevices
    .map((device) => String(device.ipAddress ?? '').trim())
    .filter(Boolean);
  const targetsAndIps = target
    ? parseTargets(target)
    : { targets: deviceIps.map(normalizeTarget), ips: deviceIps };

  if (targetsAndIps.ips.length === 0) throw new Error(`Missing target or devices for ${mode} scan`);

  const devices = [];
  let cursor = 0;
  let scannedPorts = 0;
  const totalPorts = targetsAndIps.ips.length * ports.length;
  const concurrency = Number(body.concurrency ?? (mode === 'full' ? 8 : 32));

  updateJob(job, {
    status: 'running',
    progress: 1,
    message: `Scanning ${targetsAndIps.ips.length} hosts across ${ports.length} ports`,
  });

  const onPortDone = () => {
    scannedPorts += 1;
    updateJob(job, {
      progress: Math.min(92, Math.round((scannedPorts / totalPorts) * 92)),
      message: `Scanned ${scannedPorts}/${totalPorts} port checks`,
    });
  };

  async function worker() {
    while (cursor < targetsAndIps.ips.length) {
      const ip = targetsAndIps.ips[cursor++];
      const knownDevice = knownDevices.find((device) => device.ipAddress === ip);
      const device = await scanHostPortsWithProgress(ip, ports, timeoutMs, knownDevice, onPortDone, sourceAddress);
      if (device) devices.push(device);
      updateJob(job, {
        progress: Math.max(job.progress, 93),
        message: `Analyzed ${devices.length}/${targetsAndIps.ips.length} responding hosts`,
      });
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, targetsAndIps.ips.length) }, worker));

  return {
    targetRange: targetsAndIps.targets.join(', '),
    timestamp: Date.now(),
    durationMs: Date.now() - startedAt,
    scannedPorts: ports,
    portProfile: mode === 'full' ? `full-${FULL_SCAN_PORT_RANGE}` : 'common-services',
    scanMode: mode,
    devices: devices.sort((a, b) => ipToInt(a.ipAddress) - ipToInt(b.ipAddress)),
  };
}

async function runScanJob(job, body) {
  try {
    const result = job.mode === 'discovery'
      ? await runDiscoveryJob(job, body)
      : await runPortScanJob(job, job.mode, body);

    updateJob(job, {
      status: 'completed',
      progress: 100,
      message: 'Scan completed',
      result,
    });
  } catch (error) {
    updateJob(job, {
      status: 'failed',
      error: error.message,
      message: error.message,
    });
  }
}

async function handleCreateScanJob(req, res, mode) {
  const body = await readBody(req);
  const job = {
    id: randomUUID(),
    mode,
    status: 'queued',
    progress: 0,
    message: 'Queued',
    result: null,
    error: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    clients: new Set(),
  };

  scanJobs.set(job.id, job);
  setTimeout(() => scanJobs.delete(job.id), 1000 * 60 * 30);
  queueMicrotask(() => runScanJob(job, body));

  return json(res, 202, { jobId: job.id, job: publicJob(job) });
}

function handleScanJobEvents(req, res, jobId) {
  const job = scanJobs.get(jobId);
  if (!job) {
    sse(res, 404);
    writeSse(res, 'error', { error: 'Scan job not found' });
    res.end();
    return;
  }

  sse(res);
  job.clients.add(res);
  writeSse(res, 'update', publicJob(job));
  if (job.status === 'completed') {
    writeSse(res, 'complete', publicJob(job));
  } else if (job.status === 'failed') {
    writeSse(res, 'error', publicJob(job));
  }

  const heartbeat = setInterval(() => {
    writeSse(res, 'heartbeat', { now: Date.now() });
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    job.clients.delete(res);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return json(res, 204, {});
    if (req.method === 'GET' && req.url === '/health') return json(res, 200, { ok: true });
    if (req.method === 'GET' && req.url === '/api/network/adapters') return json(res, 200, { adapters: listAdapters() });
    const jobMatch = req.url.match(/^\/api\/scan\/jobs\/([^/]+)\/events$/);
    if (req.method === 'GET' && jobMatch) return handleScanJobEvents(req, res, jobMatch[1]);
    const createJobMatch = req.url.match(/^\/api\/scan\/(discovery|basic|full)\/jobs$/);
    if (req.method === 'POST' && createJobMatch) return await handleCreateScanJob(req, res, createJobMatch[1]);
    if (req.method === 'POST' && req.url === '/api/scan/discovery') return await handleDiscovery(req, res);
    if (req.method === 'POST' && req.url === '/api/scan/basic') return await handleBasicScan(req, res);
    if (req.method === 'POST' && req.url === '/api/scan/full') return await handleFullScan(req, res);
    return json(res, 404, { error: 'Not found' });
  } catch (error) {
    return json(res, 500, { error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Host discovery backend listening on http://localhost:${PORT}`);
});
