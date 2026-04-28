import type { McpRegistryEntry, SecurityLevel } from "./registry.js";

export interface SandboxCheck {
  id: string;
  label: string;
  pass: boolean;
  severity: "info" | "warning" | "critical";
  detail?: string;
}

export interface SandboxResult {
  ok: boolean;
  score: number;
  target: SecurityLevel;
  checks: SandboxCheck[];
}

const NEXT_LEVEL: Record<SecurityLevel, SecurityLevel> = {
  S4: "S3",
  S3: "S2",
  S2: "S1",
  S1: "S1",
};

const SCORE_THRESHOLD: Record<SecurityLevel, number> = {
  S1: 90,
  S2: 85,
  S3: 70,
  S4: 0,
};

const TRUSTED_OFFICIAL_SOURCE_PATTERNS = [
  /^\.\/plugins\//,
  /^https:\/\/github\.com\/modelcontextprotocol\//,
  /^https:\/\/github\.com\/anthropics\//,
  /^https:\/\/github\.com\/microsoft\/playwright-mcp\b/,
];

const DANGEROUS_COMMAND_PATTERNS = [
  /\brm\s+-rf\b/i,
  /\bsudo\b/i,
  /\bchmod\s+777\b/i,
  /\bcurl\b.*\|\s*(sh|bash)\b/i,
  /\bwget\b.*\|\s*(sh|bash)\b/i,
  />\s*\/dev\/(sd|nvme|disk)/i,
];

function capabilityCount(entry: McpRegistryEntry): number {
  return (
    (entry.capabilities?.tools?.length ?? 0) +
    (entry.capabilities?.prompts?.length ?? 0) +
    (entry.capabilities?.resources?.length ?? 0)
  );
}

function add(checks: SandboxCheck[], check: SandboxCheck): void {
  checks.push(check);
}

function isTrustedOfficialSource(source: string): boolean {
  return TRUSTED_OFFICIAL_SOURCE_PATTERNS.some((pattern) => pattern.test(source));
}

function staticChecks(entry: McpRegistryEntry, target: SecurityLevel): SandboxCheck[] {
  const checks: SandboxCheck[] = [];
  const install = entry.install;
  const command = install?.command ?? "";
  const pluginSource = install?.pluginSource ?? "";
  const proxyUrl = install?.proxyUrl ?? "";
  const caps = capabilityCount(entry);

  add(checks, {
    id: "metadata",
    label: "Complete metadata: name, summary, description, license, contributor",
    pass: !!entry.name && entry.summary.length >= 5 && entry.description.length >= 10 && !!entry.license && !!entry.contributor,
    severity: "warning",
  });
  add(checks, {
    id: "version",
    label: "Version is declared",
    pass: /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(entry.version),
    severity: "warning",
    detail: entry.version,
  });
  add(checks, {
    id: "capabilities",
    label: target === "S2" || target === "S1" ? "Declares 3+ capabilities" : "Declares at least 1 capability",
    pass: target === "S2" || target === "S1" ? caps >= 3 : caps > 0,
    severity: "warning",
    detail: String(caps),
  });
  add(checks, {
    id: "install",
    label: "Install configuration is complete",
    pass:
      !!install?.type &&
      ((install.type === "plugin" && !!pluginSource) ||
        (install.type === "proxy" && !!proxyUrl) ||
        (install.type === "standalone" && (!!command || !!install.cursorConfig || !!install.claudeConfig))),
    severity: "critical",
  });
  add(checks, {
    id: "command-safety",
    label: "No known dangerous shell patterns in install command",
    pass: !command || !DANGEROUS_COMMAND_PATTERNS.some((pattern) => pattern.test(command)),
    severity: "critical",
    detail: command || "no command",
  });
  add(checks, {
    id: "plugin-path",
    label: "Local plugin path stays under ./plugins",
    pass: install?.type !== "plugin" || (pluginSource.startsWith("./plugins/") && !pluginSource.includes("..")),
    severity: "critical",
    detail: pluginSource || "not a plugin",
  });

  if (target === "S2" || target === "S1") {
    add(checks, {
      id: "source-url",
      label: "Source is an HTTPS URL or built-in local source",
      pass: /^https:\/\//.test(entry.source) || entry.source.startsWith("./"),
      severity: "warning",
      detail: entry.source,
    });
  }

  if (target === "S1") {
    add(checks, {
      id: "official-source",
      label: "S1 requires a built-in or trusted official source",
      pass: isTrustedOfficialSource(entry.source),
      severity: "critical",
      detail: entry.source,
    });
    add(checks, {
      id: "verified",
      label: "S1 requires verified=true",
      pass: entry.verified === true,
      severity: "critical",
    });
  }

  return checks;
}

async function networkChecks(entry: McpRegistryEntry, target: SecurityLevel): Promise<SandboxCheck[]> {
  const checks: SandboxCheck[] = [];

  if (entry.install?.type === "proxy" && entry.install.proxyUrl) {
    try {
      const resp = await fetch(entry.install.proxyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "aix-sandbox", version: "1.0.0" } },
        }),
        signal: AbortSignal.timeout(5000),
      });
      add(checks, {
        id: "proxy-handshake",
        label: "Proxy endpoint responds to MCP initialize",
        pass: resp.ok,
        severity: "critical",
        detail: `HTTP ${resp.status}`,
      });
    } catch (err) {
      add(checks, {
        id: "proxy-handshake",
        label: "Proxy endpoint responds to MCP initialize",
        pass: false,
        severity: "critical",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if ((target === "S2" || target === "S1") && /^https?:\/\//.test(entry.source)) {
    try {
      let resp = await fetch(entry.source, { method: "HEAD", signal: AbortSignal.timeout(10000) });
      if (!resp.ok && (resp.status === 403 || resp.status === 405)) {
        resp = await fetch(entry.source, { method: "GET", signal: AbortSignal.timeout(10000) });
      }
      add(checks, {
        id: "source-reachable",
        label: "Source URL is reachable from sandbox",
        pass: resp.ok,
        severity: "warning",
        detail: `HTTP ${resp.status}`,
      });
    } catch (err) {
      const trusted = isTrustedOfficialSource(entry.source);
      add(checks, {
        id: "source-reachable",
        label: trusted ? "Source URL reachability check timed out (trusted source)" : "Source URL is reachable from sandbox",
        pass: trusted,
        severity: "warning",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return checks;
}

export function nextSecurityLevel(current: SecurityLevel): SecurityLevel {
  return NEXT_LEVEL[current];
}

export async function sandboxValidateEntry(entry: McpRegistryEntry, target: SecurityLevel = nextSecurityLevel(entry.securityLevel)): Promise<SandboxResult> {
  const checks = [...staticChecks(entry, target), ...(await networkChecks(entry, target))];
  const criticalFailed = checks.some((check) => check.severity === "critical" && !check.pass);
  const passed = checks.filter((check) => check.pass).length;
  const score = checks.length === 0 ? 0 : Math.round((passed / checks.length) * 100);
  const ok = !criticalFailed && score >= SCORE_THRESHOLD[target];

  return { ok, score, target, checks };
}
