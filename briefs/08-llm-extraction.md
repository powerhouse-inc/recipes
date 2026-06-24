# Recipe brief: llm-extraction

**One-liner:** A server-side mutation that turns unstructured input (pasted text or an
uploaded PDF) into structured document operations via Claude, returning extracted
fields with confidence scores for human review before commit.

## Why this recipe

AI-enrichment in the write path is already in production — `contributor-billing` /
`op-hub` extract structured invoice data from PDFs with Claude (uploaded in base64
chunks through GraphQL) and auto-classify expense line items into budget tags — but
the pattern is undocumented. It also carries an important architectural rule worth
teaching: the LLM lives in the subgraph/script layer, never in a reducer, and its
output enters the event log as plain operation inputs, keeping replay deterministic.

## What it demonstrates

- A subgraph mutation calling Claude and mapping the response to typed action inputs.
- Chunked base64 upload through GraphQL for payloads that exceed request limits, with
  server-side reassembly.
- Structured output (tool use / JSON schema) with per-field confidence and warnings.
- The determinism rule: extraction is a side-channel; the document only ever sees
  ordinary operations carrying the extracted values.
- Secrets handled via env + a manifest-style config table in the README.

## Reference packages

Cache root: `~/projects/powerhouse/powerhouse/.cache/registry-audit/extracted/`

- **`@powerhousedao__contributor-billing`**
  - `dist/subgraphs/invoice-addon/customResolvers.d.ts` — verified:
    `Invoice_uploadInvoicePdfChunk` mutation receives base64 chunks, reassembles, and
    returns extracted invoice fields with confidence metadata.
  - `dist/scripts/invoice/pdfToClaudeAI.js` — the Claude call (verified: `anthropic`,
    `claude-haiku` model usage); also `pdfToDocumentAi.js` for the Google Document AI
    variant — useful contrast.
  - `dist/scripts/invoice/autoTagging.js` — second use case: classify a line item
    description/amount into budget tags, applied via `setLineItemTag` ops.
- **`op-hub`**
  - `dist/browser/invoice-addon-CisGYHkM.js` — `claudeClassifyExpense` (raw fetch to
    the Anthropic API) and the same chunked-PDF mutation, bundled.
  - `dist/powerhouse.manifest.json` — `CLAUDE_API_KEY` declared as a typed `secret`
    config entry with description; the model for documenting required keys.
  - `dist/browser/pdfjs-DEEIyb9E.js` / `unpdf` dependency — client-side PDF text
    extraction before upload (an alternative that shrinks payloads).

## Suggested shape

Standalone package `@powerhousedao/example-llm-extraction`.

- Document model: a minimal "receipt" — `{ vendor, date, currency, lineItems:
  { description, amount, tag? }[] }` with `setReceiptDetails`, `addLineItem`,
  `setLineItemTag` operations.
- `extract.ts` — `extractReceipt(text): Promise<{ fields, confidence, warnings }>`
  using `@anthropic-ai/sdk` with tool-use/structured output (define the JSON schema for
  the receipt). Default to the current fast model tier (Haiku 4.5 is what the wild
  packages use; check `claude-api` docs for the latest id at build time).
- `chunks.ts` — chunked upload reassembly: `acceptChunk(uploadId, index, total,
  data)` buffering until complete (in-memory map is fine for the recipe; note TTL
  cleanup).
- Mutation/handler — accept text or completed upload → extract → EITHER dispatch ops
  directly (auto mode) OR return proposed actions for the caller to confirm (review
  mode). Implement both behind a flag; review mode is the better default and pairs
  with the `ai-suggestions` brief.
- `demo.ts` — run extraction on 2–3 fixture receipts (plain text to keep PDF parsing
  out of scope; mention `unpdf` for the PDF variant), print fields + confidence, then
  the resulting document state.
- Tests with an injected fake Anthropic client (deterministic responses) so CI is
  offline; one optional live test gated on `ANTHROPIC_API_KEY`.

## Implementation notes & pitfalls

- **Never call the LLM from a reducer.** Reducers must replay deterministically;
  extraction output flows in as action *inputs*. State this rule first in the README —
  it's the architectural point of the recipe.
- Chunking exists because GraphQL bodies hit size limits around multi-MB PDFs; carry
  `uploadId/index/total`, validate completeness, and clean up abandoned uploads.
- Treat the model as untrusted input: validate extracted fields (zod) before building
  actions; surface low-confidence fields instead of silently committing them.
- Pin the model id in one constant; record it (and prompt version) in the dispatched
  action input for provenance.
- API key via env only; document with an op-hub-style config table. Mind prompt
  injection if extracted text can carry instructions — keep the system prompt strict
  and the output schema closed.

## Related recipes in this repo

- First AI recipe — no sibling yet; cross-link the `ai-suggestions` brief (09) as the
  human-in-the-loop continuation.
- `audit-trail` — provenance story for recording who/what produced an operation.
