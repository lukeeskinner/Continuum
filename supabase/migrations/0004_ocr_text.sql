-- 0004_ocr_text — store locally-extracted OCR text alongside each
-- observation, so the embedding/search layer can use on-screen text in
-- addition to the vision model's app/topic/concept summary.
alter table public.semantic_nodes
  add column if not exists ocr_text text;
