const { sanitizeAndDelimit, sanitizeServiceData } = require('../../src/services/ai/sanitize');

describe('sanitizeAndDelimit', () => {
    it('wraps text in the given XML delimiter', () => {
        expect(sanitizeAndDelimit('My API', 'service-name')).toBe('<service-name>My API</service-name>');
    });

    it('returns an empty delimited block for falsy input', () => {
        expect(sanitizeAndDelimit('', 'service-name')).toBe('<service-name></service-name>');
        expect(sanitizeAndDelimit(null, 'service-name')).toBe('<service-name></service-name>');
        expect(sanitizeAndDelimit(undefined, 'service-name')).toBe('<service-name></service-name>');
    });

    it('escapes XML/HTML special characters', () => {
        const result = sanitizeAndDelimit('<script>alert("xss")</script>', 'service-url');
        expect(result).not.toContain('<script>');
        expect(result).toContain('&lt;script&gt;');
        expect(result).toContain('&quot;xss&quot;');
    });

    it('escapes SQL injection style payloads without altering meaning', () => {
        const result = sanitizeAndDelimit('My API"; DROP TABLE services; --', 'service-name');
        expect(result).toContain('&quot;');
        expect(result).not.toContain('DROP TABLE services; --"');
    });

    it('truncates long text to 200 chars with an ellipsis', () => {
        const longText = 'a'.repeat(300);
        const result = sanitizeAndDelimit(longText, 'service-name');
        const inner = result.replace('<service-name>', '').replace('</service-name>', '');
        expect(inner.length).toBeLessThanOrEqual(201);
        expect(inner.endsWith('…')).toBe(true);
    });

    it('truncates a long URL keeping protocol + domain', () => {
        const longUrl = 'https://example.com/' + 'a'.repeat(300);
        const result = sanitizeAndDelimit(longUrl, 'service-url');
        expect(result).toContain('https://example.com');
        expect(result.length).toBeLessThan(longUrl.length + 20);
    });

    it('does not truncate short text', () => {
        expect(sanitizeAndDelimit('short', 'service-name')).toBe('<service-name>short</service-name>');
    });
});

describe('sanitizeServiceData', () => {
    it('returns raw and sanitized fields with lengths', () => {
        const result = sanitizeServiceData({ name: 'My API', url: 'https://api.example.com' });
        expect(result.name).toBe('My API');
        expect(result.url).toBe('https://api.example.com');
        expect(result.nameSanitized).toBe('<service-name>My API</service-name>');
        expect(result.urlSanitized).toBe('<service-url>https://api.example.com</service-url>');
        expect(result.nameLength).toBe(6);
        expect(result.urlLength).toBe('https://api.example.com'.length);
    });

    it('handles missing name/url gracefully', () => {
        const result = sanitizeServiceData({ name: '', url: '' });
        expect(result.nameLength).toBe(0);
        expect(result.urlLength).toBe(0);
    });
});
