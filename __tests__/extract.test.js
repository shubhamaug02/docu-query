import { describe, it, expect } from '@jest/globals';

// Utility: the same JSON extraction logic used in the API route
function parseGeminiResponse(text) {
    text = text.trim();
    try {
        return JSON.parse(text);
    } catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) return JSON.parse(match[0]);
        return null;
    }
}

describe('Gemini response parser', () => {
    it('parses clean JSON', () => {
        const input = '{"type":"table","columns":[],"rows":[],"summary":"test"}';
        expect(parseGeminiResponse(input)).toEqual({
            type: 'table', columns: [], rows: [], summary: 'test'
        });
    });

    it('extracts JSON when Gemini adds extra text', () => {
        const input = 'Here is the result:\n{"type":"keyvalue","fields":[],"summary":"test"}';
        const result = parseGeminiResponse(input);
        expect(result.type).toBe('keyvalue');
    });

    it('returns null for unparseable response', () => {
        expect(parseGeminiResponse('sorry I cannot help')).toBeNull();
    });

    it('handles keyvalue type correctly', () => {
        const input = JSON.stringify({
            type: 'keyvalue',
            summary: 'Invoice',
            fields: [{ key: 'Total', value: '100', type: 'number' }]
        });
        const result = parseGeminiResponse(input);
        expect(result.type).toBe('keyvalue');
        expect(result.fields[0].key).toBe('Total');
    });

    it('handles mixed type with both fields and rows', () => {
        const input = JSON.stringify({
            type: 'mixed',
            summary: 'Invoice with line items',
            fields: [{ key: 'Invoice #', value: '123', type: 'string' }],
            columns: [{ name: 'Item', type: 'string' }],
            rows: [{ Item: 'Widget' }]
        });
        const result = parseGeminiResponse(input);
        expect(result.type).toBe('mixed');
        expect(result.fields).toHaveLength(1);
        expect(result.rows).toHaveLength(1);
    });
});