// src/utils/sanitize.js — DOMPurify 기반 XSS 방어

import DOMPurify from 'dompurify';

export function sanitizeHTML(dirty) {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['b', 'i', 'u', 's', 'a', 'br', 'span', 'code', 'mark', 'sub', 'sup', 'font'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'style', 'data-tag-color', 'color'],
    ALLOW_DATA_ATTR: false,
  });
}

export function sanitizeURL(url) {
  if (!url) return '';
  try {
    var parsed = new URL(url);
    if (!['http:', 'https:', 'data:'].includes(parsed.protocol)) return '';
    return url;
  } catch (e) { return ''; }
}
