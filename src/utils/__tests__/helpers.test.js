// src/utils/__tests__/helpers.test.js — 유틸리티 함수 단위 테스트

import { describe, it, expect, beforeEach, vi } from 'vitest';

// helpers.js가 import하는 외부 모듈을 mock하여 Firebase 의존성을 차단
vi.mock('../../data/store.js', () => ({
  default: {
    db: { settings: { theme: 'light' } },
  },
}));
vi.mock('../../data/firestore.js', () => ({
  saveDB: vi.fn(),
}));

import {
  genId,
  esc,
  fmtD,
  fmtDT,
  formatBytes,
  highlightText,
  getLoginState,
  saveLoginState,
} from '../helpers.js';

// ─── genId ────────────────────────────────────────────────
describe('genId', () => {
  it('8자리 이상 문자열을 반환한다', () => {
    const id = genId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThanOrEqual(8);
  });

  it('호출마다 고유한 값을 생성한다', () => {
    const ids = new Set(Array.from({ length: 100 }, () => genId()));
    expect(ids.size).toBe(100);
  });

  it('영문 소문자·숫자로만 구성된다', () => {
    const id = genId();
    expect(id).toMatch(/^[a-z0-9]+$/);
  });
});

// ─── esc ──────────────────────────────────────────────────
describe('esc', () => {
  it('HTML 특수문자를 이스케이프한다', () => {
    expect(esc('<script>alert("xss")</script>')).not.toContain('<script>');
    expect(esc('&')).toBe('&amp;');
    expect(esc('<')).toBe('&lt;');
    expect(esc('>')).toBe('&gt;');
  });

  it('null/undefined 입력을 안전하게 처리한다', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });

  it('일반 문자열은 그대로 반환한다', () => {
    expect(esc('hello')).toBe('hello');
  });

  it('빈 문자열을 처리한다', () => {
    expect(esc('')).toBe('');
  });
});

// ─── fmtD ─────────────────────────────────────────────────
describe('fmtD', () => {
  // 고정 타임스탬프: 2025-01-15T00:00:00.000Z
  const ts = new Date(2025, 0, 15).getTime();

  it('문자열을 반환한다', () => {
    const result = fmtD(ts);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('연도를 포함한다', () => {
    expect(fmtD(ts)).toContain('2025');
  });

  it('월·일 정보를 포함한다', () => {
    const result = fmtD(ts);
    // "1월" 또는 "Jan" 등 로케일에 따른 월, "15" 일
    expect(result).toContain('15');
  });
});

// ─── fmtDT ────────────────────────────────────────────────
describe('fmtDT', () => {
  // 고정 타임스탬프: 2025-06-20T14:30:00 (로컬)
  const ts = new Date(2025, 5, 20, 14, 30, 0).getTime();

  it('문자열을 반환한다', () => {
    const result = fmtDT(ts);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('연도를 포함한다', () => {
    expect(fmtDT(ts)).toContain('2025');
  });

  it('날짜와 시간 정보를 모두 포함한다', () => {
    const result = fmtDT(ts);
    expect(result).toContain('20');
    // 시간 부분 — "14" 또는 "2" (12h) 또는 "오후" 등
    expect(result.length).toBeGreaterThan(fmtD(ts).length);
  });
});

// ─── formatBytes ──────────────────────────────────────────
describe('formatBytes', () => {
  it('0 바이트를 처리한다', () => {
    expect(formatBytes(0)).toBe('0 Bytes');
  });

  it('바이트 단위를 올바르게 표시한다', () => {
    expect(formatBytes(500)).toBe('500 Bytes');
    expect(formatBytes(1)).toBe('1 Bytes');
  });

  it('KB 단위를 올바르게 표시한다', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('MB 단위를 올바르게 표시한다', () => {
    expect(formatBytes(1048576)).toBe('1 MB');
    expect(formatBytes(1572864)).toBe('1.5 MB');
  });

  it('GB 단위를 올바르게 표시한다', () => {
    expect(formatBytes(1073741824)).toBe('1 GB');
  });

  it('소수점 2자리까지 표시한다', () => {
    // 1024 + 100 = 1124 bytes = 1.10 KB -> parseFloat -> "1.1 KB"
    expect(formatBytes(1124)).toBe('1.1 KB');
  });
});

// ─── highlightText ────────────────────────────────────────
describe('highlightText', () => {
  it('쿼리 없이 호출하면 이스케이프된 텍스트를 반환한다', () => {
    expect(highlightText('hello', '')).toBe('hello');
    expect(highlightText('hello', null)).toBe('hello');
    expect(highlightText('hello', undefined)).toBe('hello');
  });

  it('매칭되는 텍스트를 하이라이트 span으로 감싼다', () => {
    const result = highlightText('hello world', 'world');
    expect(result).toContain('<span class="search-hl">world</span>');
    expect(result).toContain('hello');
  });

  it('대소문자 무시하여 매칭한다', () => {
    const result = highlightText('Hello World', 'hello');
    expect(result).toContain('<span class="search-hl">Hello</span>');
  });

  it('정규식 특수문자를 안전하게 처리한다', () => {
    const result = highlightText('price is $100.00', '$100');
    expect(result).toContain('<span class="search-hl">$100</span>');
  });

  it('HTML이 포함된 텍스트를 먼저 이스케이프한다', () => {
    const result = highlightText('<b>bold</b>', 'bold');
    expect(result).not.toContain('<b>');
    expect(result).toContain('&lt;b&gt;');
    expect(result).toContain('<span class="search-hl">bold</span>');
  });

  it('여러 매칭을 모두 하이라이트한다', () => {
    const result = highlightText('abc abc abc', 'abc');
    const count = (result.match(/search-hl/g) || []).length;
    expect(count).toBe(3);
  });
});

// ─── getLoginState / saveLoginState ───────────────────────
describe('getLoginState / saveLoginState', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('저장된 상태가 없으면 기본값을 반환한다', () => {
    const state = getLoginState();
    expect(state).toEqual({ attempts: 0, lockUntil: 0, blocked: false });
  });

  it('상태를 저장하고 다시 불러올 수 있다', () => {
    const data = { attempts: 3, lockUntil: 1234567890, blocked: true };
    saveLoginState(data);
    const loaded = getLoginState();
    expect(loaded).toEqual(data);
  });

  it('잘못된 JSON이 저장되어 있으면 기본값을 반환한다', () => {
    localStorage.setItem('ad_login_state', 'not-valid-json');
    const state = getLoginState();
    expect(state).toEqual({ attempts: 0, lockUntil: 0, blocked: false });
  });

  it('여러 번 덮어쓰기해도 최신 값을 반환한다', () => {
    saveLoginState({ attempts: 1, lockUntil: 0, blocked: false });
    saveLoginState({ attempts: 5, lockUntil: 9999, blocked: true });
    const loaded = getLoginState();
    expect(loaded.attempts).toBe(5);
    expect(loaded.blocked).toBe(true);
  });
});
