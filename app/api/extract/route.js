export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Papa from 'papaparse';
import pdf from 'pdf-parse/lib/pdf-parse.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function POST(request) {
    try {
        const formData = await request.formData();
        const file = formData.get('file');

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        let rawText = '';

        if (file.type === 'application/pdf') {
            const parsed = await pdf(buffer);
            rawText = parsed.text;
        } else if (file.type === 'text/csv') {
            rawText = buffer.toString('utf-8');
        } else {
            return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
        }

        if (!rawText || rawText.trim().length === 0) {
            return NextResponse.json({ error: 'Could not extract text from file' }, { status: 422 });
        }

        // Truncate to avoid Gemini token limits
        const truncated = rawText.slice(0, 8000);

        const model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });

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

        const result = await model.generateContent(prompt);
        const text = result.response.text().trim();

        let extracted;
        try {
            extracted = JSON.parse(text);
        } catch {
            // Try to extract JSON if Gemini adds any extra text
            const match = text.match(/\{[\s\S]*\}/);
            if (match) {
                extracted = JSON.parse(match[0]);
            } else {
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