// Frame deduplication — port of FNDR's src-tauri/src/capture/dedupe.rs.
//
// Combines three checks so near-static screens don't trigger repeated
// (expensive) sidecar inference + OCR:
//   1. Exact fingerprint match (identical bytes, e.g. a frozen screen).
//   2. Perceptual-hash distance vs. the immediately previous frame.
//   3. Alternating-pattern detection (A -> B -> A, e.g. a blinking cursor or
//      toggling tooltip) against a short history of recent frames.
//
// Hashing uses Electron's nativeImage to downsample to 8x8 grayscale and
// produce a 64-bit average hash (aHash) — the JS equivalent of img_hash's
// 8x8 perceptual hasher used upstream.

const crypto = require("crypto");

const HASH_SIZE = 8; // 8x8 -> 64-bit hash, matching the upstream hasher.
const HISTORY_LIMIT = 3;
const CONSECUTIVE_RGB_MAX = 24;
const ALTERNATING_RGB_MAX = 20;

function stableBytesFingerprint(buffer) {
  return crypto
    .createHash("sha1")
    .update(Buffer.from([buffer.length & 0xff, (buffer.length >> 8) & 0xff]))
    .update(buffer)
    .digest("hex");
}

// Average hash: resize to 8x8 grayscale, threshold each pixel against the
// mean, pack into a 64-bit BigInt.
function averageHash(nativeImg) {
  const small = nativeImg.resize({ width: HASH_SIZE, height: HASH_SIZE, quality: "good" });
  const bitmap = small.toBitmap(); // BGRA, 4 bytes/px
  const gray = new Array(HASH_SIZE * HASH_SIZE);
  let sum = 0;
  for (let i = 0; i < gray.length; i++) {
    const o = i * 4;
    const g = (bitmap[o] + bitmap[o + 1] + bitmap[o + 2]) / 3;
    gray[i] = g;
    sum += g;
  }
  const mean = sum / gray.length;
  let hash = 0n;
  for (let i = 0; i < gray.length; i++) {
    hash <<= 1n;
    if (gray[i] >= mean) hash |= 1n;
  }
  return hash;
}

function hammingDistance(a, b) {
  let x = a ^ b;
  let count = 0;
  while (x) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}

// Mean RGB across the full-res bitmap (cheap brightness/color fingerprint).
function averageRgb(nativeImg) {
  const bitmap = nativeImg.toBitmap();
  let r = 0, g = 0, b = 0;
  const pixels = bitmap.length / 4;
  for (let i = 0; i < bitmap.length; i += 4) {
    b += bitmap[i];
    g += bitmap[i + 1];
    r += bitmap[i + 2];
  }
  return [r / pixels, g / pixels, b / pixels];
}

function rgbDistance(a, b) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
}

class FrameDeduper {
  constructor() {
    this.lastHash = null;
    this.lastRgb = null;
    this.lastFingerprint = null;
    this.history = []; // [{ hash, rgb }], most recent last, capped at HISTORY_LIMIT
  }

  // Returns true if `nativeImg` (an Electron nativeImage, full PNG frame) is a
  // duplicate of a recent frame and should be dropped.
  isDuplicate(nativeImg, pngBuffer, threshold) {
    const fingerprint = stableBytesFingerprint(pngBuffer);
    if (fingerprint === this.lastFingerprint) return true;

    const hash = averageHash(nativeImg);
    const rgb = averageRgb(nativeImg);

    let duplicate = false;

    if (this.lastHash !== null) {
      const dist = hammingDistance(hash, this.lastHash);
      if (dist < threshold && rgbDistance(rgb, this.lastRgb) <= CONSECUTIVE_RGB_MAX) {
        duplicate = true;
      }
    }

    if (!duplicate) {
      for (const prior of this.history) {
        const dist = hammingDistance(hash, prior.hash);
        if (dist < threshold - 1 && rgbDistance(rgb, prior.rgb) <= ALTERNATING_RGB_MAX) {
          duplicate = true;
          break;
        }
      }
    }

    this._record(fingerprint, hash, rgb);
    return duplicate;
  }

  _record(fingerprint, hash, rgb) {
    this.lastFingerprint = fingerprint;
    this.lastHash = hash;
    this.lastRgb = rgb;
    this.history.push({ hash, rgb });
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
  }
}

module.exports = { FrameDeduper, hammingDistance, averageHash, averageRgb, rgbDistance };
