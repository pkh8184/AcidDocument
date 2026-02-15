import { describe, it, expect, beforeEach, vi } from 'vitest';

var { mockState } = vi.hoisted(function() {
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
        rowColors: {},
        cellStyles: {},
      }],
    },
    editMode: true,
  };
  return { mockState: mockState };
});

vi.mock('../../data/store.js', function() { return { default: mockState }; });
vi.mock('../renderer.js', function() { return { renderBlocks: vi.fn() }; });
vi.mock('../blocks.js', function() {
  return {
    triggerAutoSave: vi.fn(),
    findBlock: vi.fn(function(id) {
      for(var i=0;i<mockState.page.blocks.length;i++){
        if(mockState.page.blocks[i].id===id) return mockState.page.blocks[i];
      }
      return null;
    }),
  };
});
vi.mock('../../ui/modals.js', function() { return { openModal: vi.fn(), closeModal: vi.fn() }; });
vi.mock('../../utils/helpers.js', function() {
  return {
    $: vi.fn(function() { return null; }),
    toast: vi.fn(),
  };
});
vi.mock('../../config/firebase.js', function() { return { COLORS: [] }; });
vi.mock('../history.js', function() { return { pushUndoImmediate: vi.fn() }; });

import { sortTable } from '../table.js';

describe('Table Sort', function() {
  beforeEach(function() {
    mockState.page.blocks[0].rows = [
      ['이름', '점수', '등급'],
      ['김', '90', 'A'],
      ['이', '70', 'C'],
      ['박', '80', 'B'],
    ];
    mockState.page.blocks[0].rowColors = {};
    mockState.page.blocks[0].cellStyles = {};
  });

  it('열 기준 오름차순 정렬 (텍스트)', function() {
    sortTable('tbl1', 0, 'asc');
    var rows = mockState.page.blocks[0].rows;
    expect(rows[0][0]).toBe('이름');
    expect(rows[1][0]).toBe('김');
    expect(rows[2][0]).toBe('박');
    expect(rows[3][0]).toBe('이');
  });

  it('열 기준 내림차순 정렬', function() {
    sortTable('tbl1', 0, 'desc');
    var rows = mockState.page.blocks[0].rows;
    expect(rows[1][0]).toBe('이');
    expect(rows[2][0]).toBe('박');
    expect(rows[3][0]).toBe('김');
  });

  it('숫자 열 정렬', function() {
    sortTable('tbl1', 1, 'asc');
    var rows = mockState.page.blocks[0].rows;
    expect(rows[1][1]).toBe('70');
    expect(rows[2][1]).toBe('80');
    expect(rows[3][1]).toBe('90');
  });

  it('헤더 행은 항상 첫번째 유지', function() {
    sortTable('tbl1', 0, 'asc');
    expect(mockState.page.blocks[0].rows[0][0]).toBe('이름');
  });

  it('정렬 시 rowColors 키가 재매핑됨', function() {
    // 김=row1 빨간색 → 점수 오름차순: 이(70), 박(80), 김(90) → 김=row3
    mockState.page.blocks[0].rowColors = {1: '#ff0000'};
    sortTable('tbl1', 1, 'asc');
    expect(mockState.page.blocks[0].rowColors[3]).toBe('#ff0000');
    expect(mockState.page.blocks[0].rowColors[1]).toBeUndefined();
  });

  it('정렬 시 cellStyles 키가 재매핑됨', function() {
    // 김=row1,col0 초록색 → 점수 오름차순: 이(70), 박(80), 김(90) → 김=row3
    mockState.page.blocks[0].cellStyles = {'1-0': {bg: '#00ff00'}};
    sortTable('tbl1', 1, 'asc');
    expect(mockState.page.blocks[0].cellStyles['3-0']).toEqual({bg: '#00ff00'});
    expect(mockState.page.blocks[0].cellStyles['1-0']).toBeUndefined();
  });

  it('정렬 시 헤더 rowColors 유지', function() {
    mockState.page.blocks[0].rowColors = {0: '#0000ff'};
    sortTable('tbl1', 0, 'asc');
    expect(mockState.page.blocks[0].rowColors[0]).toBe('#0000ff');
  });
});
