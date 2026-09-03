## Problem framing

"Unstructured documents" is vague, so I scoped it: documents that contain structured data but aren't in a clean, machine-readable format. The goal is letting a non-technical user query that data without writing SQL or code. I left out plain narrative text (articles, essays) since there's no real tabular output to pull from those.

## Why Next.js instead of React + Express

Single deployment on Vercel, no CORS to manage. API routes give you a backend without running a separate server, which saves real time on a 5-day build. Tradeoff: I had to learn a new framework, but the concepts are shallow for what this needed.

## Why Gemini Flash instead of OpenAI

Free tier, no credit card needed. For a take-home project the cost difference doesn't matter, what matters is not hitting a paywall mid-development. Gemini Flash is fast and handles structured JSON output reliably. (Started on 1.5 Flash; Google has since retired that line, so the app now runs on gemini-3.6-flash — see below for how it stays usable when that hits its rate limit.)

## Why fall back to a lighter model on rate limits

Gemini's free tier caps requests per model per day (20/day for gemini-3.6-flash as of writing) — tight enough to hit during normal development, not just heavy real usage. The quota is tracked per model rather than per project or API key, so a second, lighter model has its own untouched quota. When the primary model returns a 429 (quota exhausted), the request automatically retries against gemini-flash-lite-latest instead of failing outright. A 503 (transient overload, not quota) gets a couple of quick backoff retries on the same model first, since that kind of failure can genuinely clear in seconds — retrying a 429 the same way wouldn't, since that quota doesn't reset for hours.

Tradeoff: the fallback model is smaller, so extraction quality on complex or dense documents may be slightly less sharp than the primary model. That's an acceptable cost — a slightly weaker extraction the user can still see and correct beats a hard failure they can't do anything about.

## Why PDF + CSV only

These are the two most common formats that hold structured data. Word docs and Excel files add a lot of parsing complexity for not much gain. Scoping to two formats let me do them well instead of doing every format poorly.

## The hard sub-problem: schema inference

A document comes in with no guaranteed structure. The real problem is figuring out what columns exist, what types they are, and whether the data is even tabular. A naive approach just dumps the text. I used Gemini to infer the schema: column names, types, and whether the data is a table, key-value pairs, or a mix. Most people would skip this and just render raw text.

## Why three render modes (table / keyvalue / mixed)

A CSV of employee records and an invoice aren't the same kind of data. Rendering an invoice as a table doesn't make sense, it's one record with many named fields. Detecting the data type and rendering it accordingly is a product decision as much as a technical one. Mixed mode handles real documents like invoices that have both header metadata and line items.

## Editable column names

Gemini infers column names from context, but it can get them wrong or pick awkward ones. Letting the user rename columns inline means the extracted data is actually usable, not just a dump. It's the "show your work" moment: the system is upfront about what it inferred and lets the user fix it.

## 5MB file limit

Gemini has token limits, so large PDFs would either fail or get silently truncated. I cut text at 50,000 characters in the API (raised from an initial 8,000 once the newer model's much larger context window made that ceiling unnecessarily tight) and capped uploads at 5MB on the frontend. That's a tradeoff I'm documenting rather than hiding.

## What I cut and why

- Auth/user accounts: out of scope for a demo, adds complexity with no evaluation value
- Multi-file upload: one file at a time keeps the UX simple and the scope honest
- Persistent storage: in-memory is fine for a demo, a database just adds ops overhead
- Scanned PDF support: pdfjs can't pull text from image-based PDFs. Doing this properly needs OCR (Tesseract, etc.), which is a big addition. Documenting it as a known limitation instead.
- Complex query language: simple search across all columns covers 80% of use cases

## Above and beyond

- Multi-type detection: Detecting keyvalue vs table vs mixed and rendering each differently was a deliberate product call that meant changing both the Gemini prompt and the frontend renderer.

- Schema transparency: showing the inferred schema explicitly and letting
  users correct it before working with the data. The system doesn't pretend
  to be perfect, it shows its work and lets the user fix it.
