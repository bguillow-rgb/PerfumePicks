import { supabase } from "./db.js";

export const SERVER_VERSION = "1.0.2";

let clientInfo: { name?: string; version?: string } = {};

export function setClientInfo(info: { name?: string; version?: string } | undefined): void {
  if (info) clientInfo = info;
}

/**
 * How this stdio process was started, for listing attribution in
 * mcp_call_logs.entry_point. A listing can set MCP_INSTALL_SOURCE in its
 * install config to tag itself explicitly; otherwise we infer the launcher.
 */
export function launcher(): string {
  const tag = (process.env.MCP_INSTALL_SOURCE ?? "").replace(/[^a-z0-9._-]/gi, "").slice(0, 40);
  if (tag) return `stdio:${tag}`;
  const argv = process.argv.join(" ");
  const ua = process.env.npm_config_user_agent ?? "";
  if (/smithery/i.test(argv) || Object.keys(process.env).some((k) => k.startsWith("SMITHERY"))) return "stdio:smithery";
  if (/[\\/]_npx[\\/]/.test(argv) || process.env.npm_command === "exec") return "stdio:npx";
  if (/\bbun\//.test(ua)) return "stdio:bunx";
  if (/\bpnpm\//.test(ua)) return "stdio:pnpm";
  if (/\byarn\//.test(ua)) return "stdio:yarn";
  return "stdio:node";
}

/** Result size from a tool's JSON text payload: explicit count, else first array, else 1. */
export function countResults(text: string | undefined): number | null {
  try {
    const p = JSON.parse(text ?? "");
    if (!p || typeof p !== "object") return null;
    if (Number.isInteger(p.result_count)) return p.result_count;
    for (const v of Object.values(p)) if (Array.isArray(v)) return v.length;
    return 1;
  } catch {
    return null;
  }
}

export interface CallLogEntry {
  tool_name: string;
  args: unknown;
  success: boolean;
  error?: string;
  duration_ms: number;
  result_count?: number | null;
}

/**
 * Fire-and-forget usage logging to the write-only mcp_call_logs drop box
 * (RLS: anon may INSERT, nobody may read without the service role). Measures
 * the "AI calls (MCP)" channel. Failures never affect the tool response.
 */
export function logCall(entry: CallLogEntry): void {
  let args: unknown = null;
  try {
    const s = JSON.stringify(entry.args);
    args = s && s.length > 2000 ? { truncated: true, chars: s.length } : entry.args;
  } catch {
    /* unserializable args stay null */
  }
  supabase
    .from("mcp_call_logs")
    .insert({
      tool_name: entry.tool_name,
      args,
      client_name: clientInfo.name ?? null,
      client_version: clientInfo.version ?? null,
      server_version: SERVER_VERSION,
      success: entry.success,
      error: entry.error?.slice(0, 500) ?? null,
      duration_ms: Math.round(entry.duration_ms),
      result_count: entry.success && Number.isInteger(entry.result_count) ? entry.result_count : null,
      entry_point: launcher(),
    })
    .then(({ error }) => {
      if (error) console.error(`call-log write failed: ${error.message}`);
    });
}
