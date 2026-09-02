## Problem framing

"Unstructured documents" is vague, so I scoped it: documents that contain structured data but aren't in a clean, machine-readable format. The goal is letting a non-technical user query that data without writing SQL or code. I left out plain narrative text (articles, essays) since there's no real tabular output to pull from those.

## Why Next.js instead of React + Express

Single deployment on Vercel, no CORS to manage. API routes give you a backend without running a separate server, which saves real time on a 5-day build. Tradeoff: I had to learn a new framework, but the concepts are shallow for what this needed.

## Why Gemini Flash instead of OpenAI

Free tier, no credit card needed. For a take-home project the cost difference doesn't matter, what matters is not hitting a paywall mid-development. Gemini 1.5 Flash is fast and handles structured JSON output reliably.

## Why PDF + CSV only

These are the two most common formats that hold structured data. Word docs and Excel files add a lot of parsing complexity for not much gain. Scoping to two formats let me do them well instead of doing every format poorly.

## The hard sub-problem: schema inference

A document comes in with no guaranteed structure. The real problem is figuring out what columns exist, what types they are, and whether the data is even tabular. A naive approach just dumps the text. I used Gemini to infer the schema: column names, types, and whether the data is a table, key-value pairs, or a mix. Most people would skip this and just render raw text.

## Why three render modes (table / keyvalue / mixed)

A CSV of employee records and an invoice aren't the same kind of data. Rendering an invoice as a table doesn't make sense, it's one record with many named fields. Detecting the data type and rendering it accordingly is a product decision as much as a technical one. Mixed mode handles real documents like invoices that have both header metadata and line items.

## Editable column names

Gemini infers column names from context, but it can get them wrong or pick awkward ones. Letting the user rename columns inline means the extracted data is actually usable, not just a dump. It's the "show your work" moment: the system is upfront about what it inferred and lets the user fix it.

## 5MB file limit

Gemini has token limits, so large PDFs would either fail or get silently truncated. I cut text at 8000 characters in the API and capped uploads at 5MB on the frontend. That's a tradeoff I'm documenting rather than hiding.

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
