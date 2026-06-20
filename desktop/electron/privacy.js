// Privacy & PII filter. Classifies each visual descriptor and scrubs identity
// details before any data leaves the device.
//
// Returns one of: "BLOCKED" | "LOCAL_ONLY" | "SHARED_ANON".

const BLOCK_PATTERNS = [
  /password/i,
  /bank|chase|wellsfargo|paypal|venmo/i,
  /whatsapp|imessage|messenger|signal/i,
  /credit\s?card|ssn|social security/i,
];

const LOCAL_ONLY_PATTERNS = [
  /salary|compensation|offer letter/i,
  /personal|private/i,
];

function classify(descriptor) {
  const blob = JSON.stringify(descriptor).toLowerCase();
  if (BLOCK_PATTERNS.some((re) => re.test(blob))) return "BLOCKED";
  if (LOCAL_ONLY_PATTERNS.some((re) => re.test(blob))) return "LOCAL_ONLY";
  return "SHARED_ANON";
}

// Strip identity-revealing details from a SHARED_ANON descriptor.
function scrub(descriptor) {
  const clean = { ...descriptor };
  for (const key of Object.keys(clean)) {
    if (typeof clean[key] !== "string") continue;
    clean[key] = clean[key]
      // home directory paths -> ~
      .replace(/\/(Users|home)\/[^/\s]+/g, "~")
      // emails -> <email>
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "<email>")
      // long tokens / hashes -> <token>
      .replace(/\b[A-Za-z0-9_-]{24,}\b/g, "<token>");
  }
  return clean;
}

module.exports = { classify, scrub };
