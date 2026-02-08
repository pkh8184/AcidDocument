// src/utils/__tests__/sanitize.test.js — sanitizeHTML / sanitizeURL 단위 테스트

import { describe, it, expect } from 'vitest';
import { sanitizeHTML, sanitizeURL } from '../sanitize.js';

// ─── sanitizeHTML ─────────────────────────────────────────
describe('sanitizeHTML', () => {
  // XSS 차단
  it('script 태그를 제거한다', () => {
    expect(sanitizeHTML('<script>alert(1)</script>')).toBe('');
  });

  it('onerror 등 이벤트 핸들러를 제거한다', () => {
    expect(sanitizeHTML('<img onerror="alert(1)">')).not.toContain('onerror');
  });

  it('onclick 이벤트 핸들러를 제거한다', () => {
    expect(sanitizeHTML('<div onclick="alert(1)">text</div>')).not.toContain('onclick');
  });

  it('javascript: URL을 제거한다', () => {
    expect(sanitizeHTML('<a href="javascript:alert(1)">link</a>')).not.toContain('javascript');
  });

  it('iframe 태그를 제거한다', () => {
    expect(sanitizeHTML('<iframe src="evil.com"></iframe>')).toBe('');
  });

  it('style 태그를 제거한다', () => {
    expect(sanitizeHTML('<style>body{display:none}</style>')).toBe('');
  });

  // 허용된 태그 유지
  it('b 태그를 유지한다', () => {
    expect(sanitizeHTML('<b>bold</b>')).toBe('<b>bold</b>');
  });

  it('i 태그를 유지한다', () => {
    expect(sanitizeHTML('<i>italic</i>')).toBe('<i>italic</i>');
  });

  it('u 태그를 유지한다', () => {
    expect(sanitizeHTML('<u>underline</u>')).toBe('<u>underline</u>');
  });

  it('s 태그를 유지한다', () => {
    expect(sanitizeHTML('<s>strike</s>')).toBe('<s>strike</s>');
  });

  it('a 태그와 href 속성을 유지한다', () => {
    const result = sanitizeHTML('<a href="https://example.com">link</a>');
    expect(result).toContain('<a');
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('link</a>');
  });

  it('br 태그를 유지한다', () => {
    const result = sanitizeHTML('line1<br>line2');
    expect(result).toContain('<br>');
  });

  it('span 태그를 유지한다', () => {
    expect(sanitizeHTML('<span>text</span>')).toBe('<span>text</span>');
  });

  it('code 태그를 유지한다', () => {
    expect(sanitizeHTML('<code>code</code>')).toBe('<code>code</code>');
  });

  it('mark 태그를 유지한다', () => {
    expect(sanitizeHTML('<mark>highlight</mark>')).toBe('<mark>highlight</mark>');
  });

  it('sub/sup 태그를 유지한다', () => {
    expect(sanitizeHTML('<sub>sub</sub>')).toBe('<sub>sub</sub>');
    expect(sanitizeHTML('<sup>sup</sup>')).toBe('<sup>sup</sup>');
  });

  // 허용된 속성
  it('class 속성을 유지한다', () => {
    const result = sanitizeHTML('<span class="highlight">text</span>');
    expect(result).toContain('class="highlight"');
  });

  it('style 속성을 유지한다', () => {
    const result = sanitizeHTML('<span style="color:red">text</span>');
    expect(result).toContain('style="color:red"');
  });

  it('data-tag-color 속성을 유지한다', () => {
    const result = sanitizeHTML('<span data-tag-color="#ff0000">tag</span>');
    expect(result).toContain('data-tag-color');
  });

  it('target, rel 속성을 유지한다', () => {
    const result = sanitizeHTML('<a href="https://ex.com" target="_blank" rel="noopener">link</a>');
    expect(result).toContain('target="_blank"');
    expect(result).toContain('rel="noopener"');
  });

  // 비허용 data 속성 차단
  it('data-tag-color 외의 data-* 속성을 제거한다', () => {
    const result = sanitizeHTML('<span data-evil="payload">text</span>');
    expect(result).not.toContain('data-evil');
  });

  // 비허용 태그 제거
  it('div 태그를 제거한다 (내용은 유지)', () => {
    const result = sanitizeHTML('<div>content</div>');
    expect(result).not.toContain('<div');
    expect(result).toContain('content');
  });

  it('form 태그를 제거한다', () => {
    expect(sanitizeHTML('<form action="evil.com"><input></form>')).not.toContain('<form');
  });

  // edge cases
  it('빈 문자열을 처리한다', () => {
    expect(sanitizeHTML('')).toBe('');
  });

  it('일반 텍스트를 그대로 반환한다', () => {
    expect(sanitizeHTML('hello world')).toBe('hello world');
  });

  it('중첩된 허용 태그를 유지한다', () => {
    expect(sanitizeHTML('<b><i>bold italic</i></b>')).toBe('<b><i>bold italic</i></b>');
  });

  it('혼합된 XSS와 허용 태그를 올바르게 처리한다', () => {
    const result = sanitizeHTML('<b>safe</b><script>alert(1)</script><i>ok</i>');
    expect(result).toContain('<b>safe</b>');
    expect(result).toContain('<i>ok</i>');
    expect(result).not.toContain('<script');
  });
});

// ─── sanitizeURL ──────────────────────────────────────────
describe('sanitizeURL', () => {
  it('http URL을 허용한다', () => {
    expect(sanitizeURL('http://example.com')).toBe('http://example.com');
  });

  it('https URL을 허용한다', () => {
    expect(sanitizeURL('https://example.com')).toBe('https://example.com');
  });

  it('data: URL을 허용한다', () => {
    expect(sanitizeURL('data:image/png;base64,abc')).toBe('data:image/png;base64,abc');
  });

  it('javascript: URL을 차단한다', () => {
    expect(sanitizeURL('javascript:alert(1)')).toBe('');
  });

  it('vbscript: URL을 차단한다', () => {
    expect(sanitizeURL('vbscript:msgbox(1)')).toBe('');
  });

  it('ftp: URL을 차단한다', () => {
    expect(sanitizeURL('ftp://files.com/secret')).toBe('');
  });

  it('잘못된 URL은 빈 문자열을 반환한다', () => {
    expect(sanitizeURL('not a url')).toBe('');
  });

  it('빈 문자열은 빈 문자열을 반환한다', () => {
    expect(sanitizeURL('')).toBe('');
  });

  it('쿼리 파라미터가 포함된 URL을 허용한다', () => {
    expect(sanitizeURL('https://example.com/page?q=test&lang=ko')).toBe('https://example.com/page?q=test&lang=ko');
  });

  it('해시가 포함된 URL을 허용한다', () => {
    expect(sanitizeURL('https://example.com/page#section')).toBe('https://example.com/page#section');
  });
});
