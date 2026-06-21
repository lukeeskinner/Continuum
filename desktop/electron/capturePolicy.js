// Capture pipeline policy — pure, dependency-free decision logic so it can be
// unit-tested without Electron. main.js wires Electron (powerMonitor,
// nativeImage, desktopCapturer) to these helpers.
//
// Adapted from FNDR's capture design (adaptive FPS via idle detection,
// perceptual-hash dedup with A→B→A loop detection, semantic dedup window),
// scaled down for an Electron + cloud-vision pipeline where each analysis is a
// paid Claude call we want to avoid whenever the screen hasn't meaningfully
// changed.

// ── Perceptual hashing ──────────────────────────────────────────────────────

// Convert a BGRA pixel buffer (Electron nativeImage.toBitmap()) to luminance.
function bgraToGray(buffer) {
  const gray = new Uint8Array(Math.floor(buffer.length / 4));
  for (let i = 0, j = 0; j < gray.length; i += 4, j++) {
    const b = buffer[i];
    const g = buffer[i + 1];
    const r = buffer[i + 2];
    gray[j] = (0.299 * r + 0.587 * g + 0.114 * b) | 0;
  }
  return gray;
}

// Average hash: one bit per pixel, set when the pixel is brighter than the mean.
// Returns a BigInt (use on an 8×8 downscale → 64-bit hash).
function averageHash(gray) {
  if (!gray.length) return 0n;
  let sum = 0;
  for (let i = 0; i < gray.length; i++) sum += gray[i];
  const mean = sum / gray.length;
  let hash = 0n;
  for (let i = 0; i < gray.length; i++) {
    hash = (hash << 1n) | (gray[i] >= mean ? 1n : 0n);
  }
  return hash;
}

function popcount(x) {
  let count = 0n;
  let v = x < 0n ? -x : x;
  while (v > 0n) {
    count += v & 1n;
    v >>= 1n;
  }
  return Number(count);
}

function hammingDistance(a, b) {
  return popcount(a ^ b);
}

// ── Frame deduplication ─────────────────────────────────────────────────────

// Skips visually-unchanged frames. Compares against the previous frame and a
// short ring buffer so brief A→B→A flips (e.g. a blinking cursor toggling the
// layout) don't each count as new context.
class FrameDeduper {
  constructor({ threshold = 6, historySize = 8 } = {}) {
    this.threshold = threshold;
    this.historySize = historySize;
    this.last = null;
    this.recent = [];
  }

  isDuplicate(hash) {
    if (typeof hash !== "bigint") return false;
    let dup = false;
    if (this.last !== null && hammingDistance(hash, this.last) <= this.threshold) {
      dup = true;
    } else {
      const tight = Math.max(1, this.threshold - 1);
      dup = this.recent.some((h) => hammingDistance(hash, h) <= tight);
    }
    this.last = hash;
    this.recent.push(hash);
    if (this.recent.length > this.historySize) this.recent.shift();
    return dup;
  }

  reset() {
    this.last = null;
    this.recent = [];
  }
}

// ── Adaptive sampling ───────────────────────────────────────────────────────

// Delay until the next capture, based on how long the user has been idle.
// Active → base interval. Idle → linearly stretched toward the slow interval.
// Deep idle → just a light poll to notice when the user comes back.
function captureDelayMs(idleSeconds, config) {
  const base = config.captureIntervalMs;
  const slow = config.idleIntervalMs;
  const pauseAt = config.idlePauseSeconds;
  const deepAt = config.deepIdleSeconds;

  if (idleSeconds >= deepAt) return config.deepIdlePollMs;
  if (idleSeconds <= pauseAt) return base;

  const t = (idleSeconds - pauseAt) / Math.max(1, deepAt - pauseAt);
  return Math.round(base + (slow - base) * t);
}

function isDeepIdle(idleSeconds, config) {
  return idleSeconds >= config.deepIdleSeconds;
}

// Exponential backoff added on consecutive pipeline errors (vision/sync).
function backoffDelayMs(baseDelay, consecutiveErrors, config) {
  if (consecutiveErrors <= 0) return baseDelay;
  const factor = 2 ** Math.min(consecutiveErrors, 5);
  return Math.min(baseDelay * factor, config.maxBackoffMs);
}

// ── Semantic deduplication ──────────────────────────────────────────────────

// A stable key for "the same context": focused app + the model's topic/concept.
function descriptorKey(descriptor = {}, front = null) {
  const app = (front && front.bundleId) || descriptor.app || "";
  const parts = [app, descriptor.topic || "", descriptor.concept || ""];
  return parts.join("|").toLowerCase().trim();
}

// Drops repeated identical descriptors within a window, but lets one through
// every `forceMs` so the graph still gets a periodic heartbeat for long-lived
// contexts.
class SemanticDeduper {
  constructor({ windowMs = 60000, forceMs = 120000 } = {}) {
    this.windowMs = windowMs;
    this.forceMs = forceMs;
    this.seen = new Map(); // key -> { firstSeen, lastSeen }
  }

  shouldSkip(key, now = Date.now()) {
    if (!key) return false;
    this._evict(now);
    const rec = this.seen.get(key);
    if (!rec) {
      this.seen.set(key, { firstSeen: now, lastSeen: now });
      return false;
    }
    if (now - rec.firstSeen >= this.forceMs) {
      rec.firstSeen = now;
      rec.lastSeen = now;
      return false; // forced refresh
    }
    if (now - rec.lastSeen <= this.windowMs) {
      rec.lastSeen = now;
      return true; // recent duplicate
    }
    rec.firstSeen = now;
    rec.lastSeen = now;
    return false; // stale, treat as fresh
  }

  _evict(now) {
    const ttl = Math.max(this.windowMs, this.forceMs);
    for (const [k, r] of this.seen) {
      if (now - r.lastSeen > ttl) this.seen.delete(k);
    }
  }

  reset() {
    this.seen.clear();
  }
}

module.exports = {
  bgraToGray,
  averageHash,
  hammingDistance,
  FrameDeduper,
  captureDelayMs,
  isDeepIdle,
  backoffDelayMs,
  descriptorKey,
  SemanticDeduper,
};
