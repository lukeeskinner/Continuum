// Minimal, dependency-free OpenTelemetry tracing for Arize Phoenix.
//
// Phoenix ingests OTLP/HTTP. Rather than pull the full OTel SDK into the Deno
// edge runtime, we emit a single OTLP/JSON span per traced operation with
// latency + custom attributes (token counts, node counts, confidence, etc.).
// Tracing is a complete no-op when PHOENIX_OTLP_ENDPOINT is unset.
import { ENV } from "./env.ts";

type AttrValue = string | number | boolean;

export interface Span {
  setAttr(key: string, value: AttrValue): void;
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

function toAttrList(attrs: Record<string, AttrValue>) {
  return Object.entries(attrs).map(([key, v]) => {
    const value =
      typeof v === "number"
        ? Number.isInteger(v) ? { intValue: v } : { doubleValue: v }
        : typeof v === "boolean"
        ? { boolValue: v }
        : { stringValue: String(v) };
    return { key, value };
  });
}

async function exportSpan(
  name: string,
  startMs: number,
  endMs: number,
  attrs: Record<string, AttrValue>,
  ok: boolean,
): Promise<void> {
  const endpoint = ENV.PHOENIX_OTLP_ENDPOINT();
  if (!endpoint) return; // tracing disabled

  const startNano = (BigInt(startMs) * 1_000_000n).toString();
  const endNano = (BigInt(endMs) * 1_000_000n).toString();
  const payload = {
    resourceSpans: [{
      resource: {
        attributes: toAttrList({ "service.name": "continuum-edge" }),
      },
      scopeSpans: [{
        scope: { name: "continuum" },
        spans: [{
          traceId: randomHex(16),
          spanId: randomHex(8),
          name,
          kind: 1, // SERVER
          startTimeUnixNano: startNano,
          endTimeUnixNano: endNano,
          attributes: toAttrList(attrs),
          status: { code: ok ? 1 : 2 }, // OK / ERROR
        }],
      }],
    }],
  };

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const apiKey = ENV.PHOENIX_API_KEY();
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  try {
    await fetch(`${endpoint.replace(/\/$/, "")}/v1/traces`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error("phoenix trace export failed (non-fatal):", err);
  }
}

// Imperative span: record a single span given a start time and attributes.
// Useful in handlers with many early returns where wrapping is awkward.
// Fire-and-forget; never throws.
export function recordSpan(
  name: string,
  startMs: number,
  attrs: Record<string, AttrValue>,
  ok = true,
): void {
  void exportSpan(name, startMs, Date.now(), { ...attrs, latency_ms: Date.now() - startMs }, ok);
}

// Wrap an async operation in a span. Latency is recorded automatically; use the
// provided span to attach custom attributes. Never throws on export failure.
export async function traced<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  const start = Date.now();
  const attrs: Record<string, AttrValue> = {};
  const span: Span = { setAttr: (k, v) => (attrs[k] = v) };
  let ok = true;
  try {
    return await fn(span);
  } catch (err) {
    ok = false;
    attrs["error"] = String(err);
    throw err;
  } finally {
    attrs["latency_ms"] = Date.now() - start;
    // Fire-and-forget; do not block the response on the exporter.
    void exportSpan(name, start, Date.now(), attrs, ok);
  }
}
