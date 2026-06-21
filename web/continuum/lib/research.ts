// Server-only web-research engine for /api/research.
// Creates a Browserbase session, drives it with Playwright (CDP) to read the
// right source for a query, then uses Claude to summarize. Findings are
// embedded with OpenAI when available, otherwise a placeholder vector so they
// can still be added to the graph.
import { chromium } from "playwright-core";
import { serverEnv } from "./env";

export interface Finding {
  title: string;
  url: string;
  text: string;
}

export type ResearchSource = "github-issues" | "github-repos" | "web";

const BUG_RE =
  /\b(bug|error|exception|traceback|stack ?trace|crash|fails?|failing|broken|undefined|null pointer|segfault|panic|throw|cannot|can'?t|doesn'?t work|not working|regression|503|500|429|timeout)\b/i;

const CLAUDE_MODEL = "claude-sonnet-4-6";
const EMBED_DIM = 1536; // matches semantic_nodes.embedding VECTOR(1536)

export function isBugQuery(q: string): boolean {
  return BUG_RE.test(q);
}

// Browser + summarizer are required; embeddings (OpenAI) are optional.
export function researchConfigured(): boolean {
  return Boolean(serverEnv.browserbaseApiKey && serverEnv.browserbaseProjectId && serverEnv.anthropicApiKey);
}

export function chooseSource(q: string): ResearchSource {
  if (isBugQuery(q)) return "github-issues";
  if (/\b(repo|library|package|sdk|framework|implementation|example|how to)\b/i.test(q)) {
    return "github-repos";
  }
  return "web";
}

function searchUrl(q: string, source: ResearchSource): string {
  const e = encodeURIComponent(q);
  if (source === "github-issues") return `https://github.com/search?q=${e}&type=issues`;
  if (source === "github-repos") return `https://github.com/search?q=${e}&type=repositories`;
  return `https://duckduckgo.com/html/?q=${e}`;
}

// Start a Browserbase session and return its CDP connect URL.
async function createSession(): Promise<string> {
  const res = await fetch("https://api.browserbase.com/v1/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-BB-API-Key": serverEnv.browserbaseApiKey },
    body: JSON.stringify({ projectId: serverEnv.browserbaseProjectId }),
  });
  if (!res.ok) throw new Error(`browserbase session failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  const connectUrl = json.connectUrl ?? json.connectionUrl;
  if (!connectUrl) throw new Error("browserbase session missing connectUrl");
  return connectUrl;
}

async function resultLinks(
  page: import("playwright-core").Page,
  source: ResearchSource,
  max = 3,
): Promise<string[]> {
  const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => (a as HTMLAnchorElement).href));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of hrefs) {
    let href = raw;
    if (source === "web") {
      const m = href.match(/[?&]uddg=([^&]+)/);
      if (m) href = decodeURIComponent(m[1]);
      if (/duckduckgo\.com/.test(href) || !/^https?:\/\//.test(href)) continue;
    } else {
      const ok = source === "github-issues"
        ? /github\.com\/[^/]+\/[^/]+\/(issues|pull)\/\d+/.test(href)
        : /^https:\/\/github\.com\/[^/]+\/[^/]+\/?$/.test(href);
      if (!ok) continue;
    }
    if (seen.has(href)) continue;
    seen.add(href);
    out.push(href);
    if (out.length >= max) break;
  }
  return out;
}

export async function browse(query: string, source: ResearchSource): Promise<Finding[]> {
  const connectUrl = await createSession();
  const browser = await chromium.connectOverCDP(connectUrl);
  try {
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(searchUrl(query, source), { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(1500);

    let links = await resultLinks(page, source);
    // Reliability: if a GitHub search returns nothing, fall back to the web.
    if (links.length === 0 && source !== "web") {
      await page.goto(searchUrl(query, "web"), { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForTimeout(1500);
      links = await resultLinks(page, "web");
    }
    const findings: Finding[] = [];
    for (const url of links) {
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await page.waitForTimeout(800);
        const title = (await page.title()) || new URL(url).hostname;
        const text = await page.evaluate(() => document.body?.innerText ?? "");
        findings.push({ title: title.slice(0, 200), url, text: text.replace(/\s+/g, " ").trim().slice(0, 4000) });
      } catch {
        /* skip a page that won't load */
      }
    }
    return findings;
  } finally {
    await browser.close().catch(() => {});
  }
}

// ---- embeddings (OpenAI if configured, else deterministic placeholder) ----
function placeholderEmbedding(seedText: string): number[] {
  let s = 0;
  for (let i = 0; i < seedText.length; i++) s = (s * 31 + seedText.charCodeAt(i)) | 0;
  let x = Math.abs(s) || 1;
  const rng = () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  const v = Array.from({ length: EMBED_DIM }, rng);
  const norm = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
  return v.map((n) => n / norm);
}

export async function embed(text: string): Promise<number[]> {
  if (!serverEnv.openaiApiKey) return placeholderEmbedding(text);
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serverEnv.openaiApiKey}` },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text.slice(0, 8000) }),
  });
  if (!res.ok) return placeholderEmbedding(text); // fall back rather than fail the insert
  const json = await res.json();
  return (json.data?.[0]?.embedding as number[]) ?? placeholderEmbedding(text);
}

// ---- summary (Claude) ----
export async function summarize(query: string, findings: Finding[]): Promise<string> {
  const context = findings
    .map((f, i) => `[${i + 1}] ${f.title} (${f.url})\n${f.text.slice(0, 1500)}`)
    .join("\n\n");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": serverEnv.anthropicApiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 700,
      system: [
        {
          type: "text",
          text:
            "You are Continuum's web-research agent. Using ONLY the provided sources, answer the question concisely (3-5 sentences). Cite sources inline as [1], [2]. If the sources don't answer it, say so plainly.",
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: `Question: ${query}\n\nSources:\n${context}` }],
    }),
  });
  if (!res.ok) throw new Error(`summarize failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.content?.[0]?.text?.trim() ?? "No answer.";
}
