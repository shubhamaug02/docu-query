# DocuQuery

Upload a PDF or CSV and instantly extract structured, queryable data from it.

Live demo: https://docu-query-rho.vercel.app

## What it does

- Uploads a PDF or CSV file
- Extracts structured data using Gemini (gemini-3.6-flash, falling back to a lighter model if the primary one hits its rate limit — see `decisions.md`)
- Detects data type automatically: table, key-value, or mixed
- Renders extracted data in an interactive table or card layout
- Lets you rename columns, change types, filter rows, and download as CSV

## Setup

1. Clone the repo

```bash
   git clone https://github.com/shubhamaug02/docu-query.git
   cd docu-query
```

2. Install dependencies

```bash
   npm install
```

3. Add environment variables — create a `.env.local` file:
   GEMINI_API_KEY=your_gemini_api_key
   Get a free key at https://aistudio.google.com

4. Run the dev server

```bash
   npm run dev
```

Open http://localhost:3000

## Tech stack

- Next.js (App Router)
- Tailwind CSS
- Google Gemini (gemini-3.6-flash, with gemini-flash-lite-latest as a rate-limit fallback)
- pdf-parse
- papaparse

## Known limitations

- Scanned/image-based PDFs are not supported (no OCR)
- Text is truncated at 50,000 characters for large files
- Single file upload only
- Password-protected PDFs aren't supported (no way to supply a password)
- If the primary Gemini model is rate-limited, extraction automatically retries on a lighter fallback model — results may be slightly less accurate in that case
