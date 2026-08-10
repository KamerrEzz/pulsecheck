const MAX_LENGTH = 200;

/**
 * Sanitizes and delimits user data before it's injected into a prompt.
 * User data is never inserted raw — it's escaped and wrapped in an
 * explicit XML delimiter so the model can distinguish data from instructions.
 */
function sanitizeAndDelimit(text, delimiter) {
    if (!text) return `<${delimiter}></${delimiter}>`;

    const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');

    const truncated = escaped.length > MAX_LENGTH
        ? truncateSmartly(escaped)
        : escaped;

    return `<${delimiter}>${truncated}</${delimiter}>`;
}

/**
 * Keeps protocol + domain for URLs (dropping the path) instead of a blind
 * cut, so a truncated URL still reads as a URL in the prompt.
 */
function truncateSmartly(str) {
    const urlMatch = str.match(/^https?:\/\/[^/]+/);
    if (urlMatch) {
        const base = urlMatch[0];
        return base.length > MAX_LENGTH
            ? base.slice(0, MAX_LENGTH) + '…'
            : base + (str.length > base.length ? '…' : '');
    }
    return str.slice(0, MAX_LENGTH) + '…';
}

function sanitizeServiceData(service) {
    return {
        name: service.name,
        url: service.url,
        nameSanitized: sanitizeAndDelimit(service.name, 'service-name'),
        urlSanitized: sanitizeAndDelimit(service.url, 'service-url'),
        nameLength: service.name ? service.name.length : 0,
        urlLength: service.url ? service.url.length : 0,
    };
}

module.exports = { sanitizeAndDelimit, sanitizeServiceData };
