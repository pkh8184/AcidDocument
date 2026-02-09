import { describe, it, expect, beforeEach, vi } from 'vitest';

var { mockState } = vi.hoisted(() => {
  var mockState = {
    page: {
      blocks: [{
        id: 'tbl1',
        type: 'table',
        rows: [
          ['이름', '점수', '등급'],
          ['김', '90', 'A'],
          ['이', '70', 'C'],
          ['박', '80', 'B'],
        ],
        sortCol: null,
        sortDir: null,
        filterCol: null,
        filterQuery: '',
      }],
    },
    editMode: true,
  };
  return { mockState };
});

vi.mock('../../data/store.js', () => ({ default: mockState }));
vi.mock('../renderer.js', () => ({ renderBlocks: vi.fn() }));
vi.mock('../blocks.js', () => ({
  triggerAutoSave: vi.fn(),
}));
vi.mock('../../ui/modals.js', () => ({ openModal: vi.fn(), closeModal: vi.fn() }));
vi.mock('../../utils/helpers.js', () => ({
  $: vi.fn(() => null),
  toast: vi.fn(),
}));

import { sortTable, filterTableRows } from '../table.js';

describe('Table Sort', () => {
  beforeEach(() => {
    mockState.page.blocks[0].rows = [
      ['이름', '점수', '등급'],
      ['김', '90', 'A'],
      ['이', '70', 'C'],
      ['박', '80', 'B'],
    ];
  });

  it('열 기준 오름차순 정렬 (텍스트)', () => {
    sortTable('tbl1', 0, 'asc');
    var rows = mockState.page.blocks[0].rows;
    expect(rows[0][0]).toBe('이름'); // 헤더 유지
    expect(rows[1][0]).toBe('김');
    expect(rows[2][0]).toBe('박');
    expect(rows[3][0]).toBe('이');
  });

  it('열 기준 내림차순 정렬', () => {
    sortTable('tbl1', 0, 'desc');
    var rows = mockState.page.blocks[0].rows;
    expect(rows[1][0]).toBe('이');
    expect(rows[2][0]).toBe('박');
    expect(rows[3][0]).toBe('김');
  });

  it('숫자 열 정렬', () => {
    sortTable('tbl1', 1, 'asc');
    var rows = mockState.page.blocks[0].rows;
    expect(rows[1][1]).toBe('70');
    expect(rows[2][1]).toBe('80');
    expect(rows[3][1]).toBe('90');
  });

  it('헤더 행은 항상 첫번째 유지', () => {
    sortTable('tbl1', 0, 'asc');
    expect(mockState.page.blocks[0].rows[0][0]).toBe('이름');
  });
});

describe('Table Filter', () => {
  beforeEach(() => {
    mockState.page.blocks[0].rows = [
      ['이름', '점수', '등급'],
      ['김', '90', 'A'],
      ['이', '70', 'C'],
      ['박', '80', 'B'],
    ];
  });

  it('필터링 결과 반환 (표시할 행 인덱스)', () => {
    var visible = filterTableRows('tbl1', 2, 'A');
    expect(visible).toEqual([0, 1]); // 헤더 + 김
  });

  it('빈 쿼리는 모든 행 반환', () => {
    var visible = filterTableRows('tbl1', 0, '');
    expect(visible.length).toBe(4);
  });

  it('매칭 없으면 헤더만 반환', () => {
    var visible = filterTableRows('tbl1', 0, 'zzz');
    expect(visible).toEqual([0]);
  });
});
