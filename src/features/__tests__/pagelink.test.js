import { describe, it, expect, beforeEach, vi } from 'vitest';

var { mockState } = vi.hoisted(() => {
  var mockState = {
    page: { id: 'p2', blocks: [{ id: 'b2', type: 'text', content: '' }] },
    db: {
      pages: [
        { id: 'p1', title: '현재 페이지', icon: '📄', deleted: false, blocks: [{ id: 'b1', type: 'text', content: '<a class="page-link" data-page-id="p2">📄 대상 페이지</a>' }] },
        { id: 'p2', title: '대상 페이지', icon: '📝', deleted: false, blocks: [{ id: 'b2', type: 'text', content: 'hello' }] },
        { id: 'p3', title: '삭제된 페이지', icon: '📄', deleted: true, blocks: [] },
      ],
    },
    editMode: true,
    slashMenuState: { open: false, idx: 0 },
  };
  return { mockState };
});

vi.mock('../../data/store.js', () => ({ default: mockState }));
vi.mock('../../editor/blocks.js', () => ({
  focusBlock: vi.fn(),
  triggerAutoSave: vi.fn(),
}));
vi.mock('../../editor/renderer.js', () => ({ renderBlocks: vi.fn() }));
vi.mock('../../ui/modals.js', () => ({
  openModal: vi.fn(),
  closeModal: vi.fn(),
}));
vi.mock('../../utils/helpers.js', () => ({
  $: vi.fn(() => ({ value: '', innerHTML: '' })),
  esc: vi.fn((s) => s || ''),
}));

import { getBacklinks, searchPages, insertPageLink } from '../pagelink.js';

describe('Page Link', () => {
  beforeEach(() => {
    mockState.page = { id: 'p2', blocks: [{ id: 'b2', type: 'text', content: '' }] };
    mockState.slashMenuState = { idx: 0 };
  });

  it('searchPages는 삭제되지 않은 페이지만 반환', () => {
    var results = searchPages('');
    expect(results.length).toBe(2);
  });

  it('searchPages는 제목으로 필터', () => {
    var results = searchPages('대상');
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('p2');
  });

  it('getBacklinks는 현재 페이지를 참조하는 페이지 목록 반환', () => {
    var backlinks = getBacklinks('p2');
    expect(backlinks.length).toBe(1);
    expect(backlinks[0].id).toBe('p1');
  });

  it('참조가 없으면 빈 배열 반환', () => {
    var backlinks = getBacklinks('p1');
    expect(backlinks.length).toBe(0);
  });

  it('insertPageLink는 블록에 링크 삽입', () => {
    insertPageLink('p1', '현재 페이지');
    expect(mockState.page.blocks[0].content).toContain('page-link');
    expect(mockState.page.blocks[0].content).toContain('data-page-id="p1"');
  });
});
