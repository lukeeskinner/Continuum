// On-screen text extraction — JS port of FNDR's src-tauri/src/ocr/ (which
// uses Apple Vision OCR). We use tesseract.js (pure JS/WASM) so it runs
// uniformly across platforms without native bindings.
//
// OCR runs locally and its output is merged into the descriptor before the
// privacy filter sees it, so PII caught by OCR (but missed by the vision
// model's description) is still blocked/scrubbed before anything leaves the
// device.

let workerPromise = null;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = require("tesseract.js");
      const worker = await createWorker("eng");
      return worker;
    })();
  }
  return workerPromise;
}

// extractText(pngBuffer) -> Promise<string>. Resolves to "" on any failure
// (missing model data, decode error, etc.) so OCR is best-effort and never
// blocks the capture pipeline.
async function extractText(pngBuffer) {
  try {
    const worker = await getWorker();
    const { data } = await worker.recognize(pngBuffer);
    return (data?.text ?? "").trim();
  } catch (err) {
    console.error("[ocr] error:", err);
    return "";
  }
}

async function shutdown() {
  if (!workerPromise) return;
  try {
    const worker = await workerPromise;
    await worker.terminate();
  } catch {
    // ignore
  } finally {
    workerPromise = null;
  }
}

module.exports = { extractText, shutdown };
