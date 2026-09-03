export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Papa from 'papaparse';
import { PDFParse, PasswordException, InvalidPDFException } from 'pdf-parse';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const ALLOWED_TYPES = ['application/pdf', 'text/csv'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB — mirrors the client-side limit
const PDF_PARSE_TIMEOUT_MS = 20_000;
const GEMINI_MAX_RETRIES = 2; // Gemini returns transient 503s under load; worth a couple retries
const DOCUMENT_TEXT_LIMIT = 50_000; // generous headroom under gemini-3.6-flash's context window

// Quota (429) is tracked per model, so a model that's out of quota still leaves
// other models usable. Tried in order; first one that succeeds wins.
const GEMINI_MODELS = ['gemini-3.6-flash', 'gemini-flash-lite-latest'];

function withTimeout(promise, ms, message) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Retries transient overload (503) with backoff. 429 is a quota exhaustion that
// won't clear in seconds, so it's left to the caller to fall back to another model.
async function generateWithRetry(model, prompt) {
    for (let attempt = 0; ; attempt++) {
        try {
            return await model.generateContent(prompt);
        } catch (err) {
            if (err?.status !== 503 || attempt === GEMINI_MAX_RETRIES) throw err;
            await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
        }
    }
}

// Walks GEMINI_MODELS in order, falling through to the next one on quota
// exhaustion (429) or persistent overload (503) so a busy/rate-limited model
// doesn't take the whole request down with it.
async function generateContentWithFallback(prompt) {
    let lastErr;
    for (let i = 0; i < GEMINI_MODELS.length; i++) {
        const modelName = GEMINI_MODELS[i];
        try {
            return await generateWithRetry(genAI.getGenerativeModel({ model: modelName }), prompt);
        } catch (err) {
            lastErr = err;
            const canFallBack = (err?.status === 429 || err?.status === 503) && i < GEMINI_MODELS.length - 1;
            if (!canFallBack) throw err;
            console.warn(`Gemini model "${modelName}" unavailable (${err.status}), falling back to "${GEMINI_MODELS[i + 1]}"`);
        }
    }
    throw lastErr;
}

async function extractPdfText(buffer) {
    const parser = new PDFParse({ data: buffer });
    try {
        // pageJoiner: '' — pdf-parse otherwise injects a "-- page N of M --" footer per
        // page by default, which would make a blank/scanned page look non-empty below.
        const parsed = await withTimeout(
            parser.getText({ pageJoiner: '' }),
            PDF_PARSE_TIMEOUT_MS,
            'PDF parsing timed out'
        );
        return parsed.text;
    } finally {
        await parser.destroy().catch(() => {});
    }
}

export async function POST(request) {
    try {
        const formData = await request.formData();
        const file = formData.get('file');

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        if (!ALLOWED_TYPES.includes(file.type)) {
            return NextResponse.json({ error: 'Only PDF and CSV files are supported.' }, { status: 400 });
        }

        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json({ error: 'File size must be under 5MB.' }, { status: 400 });
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        let rawText = '';

        if (file.type === 'application/pdf') {
            try {
                rawText = await extractPdfText(buffer);
            } catch (err) {
                if (err instanceof PasswordException) {
                    return NextResponse.json(
                        { error: 'This PDF is password-protected. Please remove the password and try again.' },
                        { status: 422 }
                    );
                }
                if (err instanceof InvalidPDFException) {
                    return NextResponse.json(
                        { error: 'This file is not a valid PDF, or it may be corrupted.' },
                        { status: 422 }
                    );
                }
                console.error('PDF parse error:', err);
                return NextResponse.json(
                    { error: 'Could not read this PDF. It may be corrupted or use an unsupported format.' },
                    { status: 422 }
                );
            }
        } else {
            rawText = buffer.toString('utf-8');
        }

        if (!rawText || rawText.trim().length === 0) {
            return NextResponse.json(
                {
                    error: 'No readable text found in this file. Scanned or photographed PDFs have no selectable text layer, so text extraction (not OCR) can\'t read them.',
                },
                { status: 422 }
            );
        }

        // Truncate to stay comfortably within Gemini's context window
        const truncated = rawText.slice(0, DOCUMENT_TEXT_LIMIT);

        const prompt = `
You are a data extraction engine. Analyze the following document text and extract all structured data from it.

First, determine what type of data this is:
- "table": data that has multiple records with the same fields (rows and columns)
- "keyvalue": data that has a single record with named fields (like an invoice, form, or profile)
- "mixed": has both a key-value section AND a table section

Return ONLY a valid JSON object. No markdown, no code fences, raw JSON only.

If type is "table":
{
  "type": "table",
  "summary": "one sentence describing what this data is about",
  "columns": [{ "name": "column name", "type": "string|number|date|boolean" }],
  "rows": [{ "column name": "value" }]
}

If type is "keyvalue":
{
  "type": "keyvalue",
  "summary": "one sentence describing what this data is about",
  "fields": [{ "key": "field name", "value": "field value", "type": "string|number|date|boolean" }]
}

If type is "mixed":
{
  "type": "mixed",
  "summary": "one sentence describing what this data is about",
  "fields": [{ "key": "field name", "value": "field value", "type": "string|number|date|boolean" }],
  "columns": [{ "name": "column name", "type": "string|number|date|boolean" }],
  "rows": [{ "column name": "value" }]
}

Rules:
- Infer column/field names from context if not explicitly present
- Infer types from values
- Every row must have a value for every column (use null if missing)
- Choose the type that best represents the data

Document text:
${truncated}
`;

        let result;
        try {
            result = await generateContentWithFallback(prompt);
        } catch (err) {
            console.error('Gemini error:', err);
            if (err?.status === 503 || err?.status === 429) {
                return NextResponse.json(
                    { error: 'The AI service is busy right now. Please try again in a moment.' },
                    { status: 503 }
                );
            }
            return NextResponse.json(
                { error: 'Failed to analyze the document. Please try again.' },
                { status: 500 }
            );
        }

        const text = result.response.text().trim();

        let extracted;
        try {
            extracted = JSON.parse(text);
        } catch {
            // Try to extract JSON if Gemini adds any extra text
            const match = text.match(/\{[\s\S]*\}/);
            try {
                extracted = match ? JSON.parse(match[0]) : null;
            } catch {
                extracted = null;
            }
            if (!extracted) {
                return NextResponse.json(
                    { error: 'Failed to parse Gemini response. Try a different file.' },
                    { status: 422 }
                );
            }
        }

        return NextResponse.json(extracted);
    } catch (err) {
        console.error('Extract error:', err);
        return NextResponse.json(
            { error: 'Something went wrong. Please try again.' },
            { status: 500 }
        );
    }
}
