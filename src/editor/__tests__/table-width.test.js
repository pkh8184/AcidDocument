// src/editor/__tests__/table-width.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';

var { mockState } = vi.hoisted(function() {
  var mockState = {
    page: { blocks: [{
      id: 'tbl1', type: 'table',
      rows: [['a','b','c'],['1','2','3']],
      colWidths: [40, 30, 30],
    }]},
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
      for (var i=0; i<mockState.page.blocks.length; i++) {
        if (mockState.page.blocks[i].id===id) return mockState.page.blocks[i];
      }
      return null;
    }),
  };
});
vi.mock('../../ui/modals.js', function() { return { openModal: vi.fn() }; });
vi.mock('../../utils/helpers.js', function() {
  return { $: vi.fn(function() { return null; }), toast: vi.fn() };
});
vi.mock('../../config/firebase.js', function() { return { COLORS: [] }; });
vi.mock('../history.js', function() { return { pushUndoImmediate: vi.fn() }; });

import {
  resizeColWithNeighborCompensation,
  setColWidth,
  distributeColsEvenly,
  clearColWidths,
  insertColAt,
  sortTable,
} from '../table.js';

describe('Column Width', function() {
  beforeEach(function() {
    mockState.page.blocks[0].rows = [['a','b','c'],['1','2','3']];
    mockState.page.blocks[0].colWidths = [40, 30, 30];
  });

  describe('resizeColWithNeighborCompensation', function() {
    it('열 0을 +10 증가 → 열 1이 -10 감소', function() {
      resizeColWithNeighborCompensation('tbl1', 0, 50);
      expect(mockState.page.blocks[0].colWidths).toEqual([50, 20, 30]);
    });
    it('열 0 증가 요청이 이웃 최소치(5%) 초과 시 그 다음 열에서 차감', function() {
      mockState.page.blocks[0].colWidths = [40, 10, 50];
      resizeColWithNeighborCompensation('tbl1', 0, 55);
      expect(mockState.page.blocks[0].colWidths).toEqual([55, 5, 40]);
    });
    it('마지막 열 리사이즈 시 왼쪽 이웃 보상', function() {
      resizeColWithNeighborCompensation('tbl1', 2, 40);
      expect(mockState.page.blocks[0].colWidths).toEqual([40, 20, 40]);
    });
    it('합계는 항상 100 유지', function() {
      resizeColWithNeighborCompensation('tbl1', 0, 55);
      var sum = mockState.page.blocks[0].colWidths.reduce(function(a,b){return a+b},0);
      expect(sum).toBe(100);
    });
    it('조작 안 한 열은 값 불변 (이웃 외)', function() {
      resizeColWithNeighborCompensation('tbl1', 0, 45);
      expect(mockState.page.blocks[0].colWidths[2]).toBe(30);
    });
    it('MIN 이하로는 내려가지 않음', function() {
      resizeColWithNeighborCompensation('tbl1', 0, 3);
      expect(mockState.page.blocks[0].colWidths[0]).toBe(5);
    });
  });

  // 아래 5/80 리터럴은 table.js의 MIN_COL_PCT / MAX_COL_PCT 상수와 동기화되어야 함
  describe('setColWidth (패널 입력)', function() {
    it('지정값으로 설정하고 이웃 보상 적용', function() {
      setColWidth('tbl1', 1, 50);
      expect(mockState.page.blocks[0].colWidths[1]).toBe(50);
      var sum = mockState.page.blocks[0].colWidths.reduce(function(a,b){return a+b},0);
      expect(sum).toBe(100);
    });
    it('MAX(80) 초과 요청 시 정확히 80으로 클램프', function() {
      setColWidth('tbl1', 0, 200);
      expect(mockState.page.blocks[0].colWidths[0]).toBe(80);
    });
    it('MIN(5) 미만 요청 시 정확히 5로 클램프', function() {
      setColWidth('tbl1', 0, 1);
      expect(mockState.page.blocks[0].colWidths[0]).toBe(5);
    });
  });

  describe('distributeColsEvenly', function() {
    it('3열을 균등 분배하고 합계 약 100', function() {
      distributeColsEvenly('tbl1');
      var cw = mockState.page.blocks[0].colWidths;
      expect(cw.length).toBe(3);
      var sum = cw.reduce(function(a,b){return a+b},0);
      expect(Math.round(sum)).toBe(100);
      expect(Math.abs(cw[0]-cw[1])).toBeLessThan(0.1);
    });
  });

  describe('clearColWidths', function() {
    it('colWidths 필드를 완전히 제거', function() {
      clearColWidths('tbl1');
      expect(mockState.page.blocks[0].colWidths).toBeUndefined();
    });
  });

  describe('insertColAt — colWidths 평균 계산', function() {
    it('기존 길이 기준으로 평균 계산 (bug fix)', function() {
      insertColAt('tbl1', 0);
      var cw = mockState.page.blocks[0].colWidths;
      expect(cw.length).toBe(4);
      expect(Math.round(cw.reduce(function(a,b){return a+b},0))).toBe(100);
    });
  });

  describe('통합 시나리오', function() {
    it('드래그 → 실제 정렬 → 드래그 반복 시 colWidths 일관성 유지', function() {
      resizeColWithNeighborCompensation('tbl1', 0, 50);
      var before = mockState.page.blocks[0].colWidths.slice();
      sortTable('tbl1', 0, 'asc');
      expect(mockState.page.blocks[0].colWidths).toEqual(before);
      resizeColWithNeighborCompensation('tbl1', 1, 25);
      var sum = mockState.page.blocks[0].colWidths.reduce(function(a,b){return a+b},0);
      expect(Math.round(sum)).toBe(100);
    });
    it('균등 분배 → 자동 맞춤 → 균등 분배 순서 이상 없음', function() {
      distributeColsEvenly('tbl1');
      clearColWidths('tbl1');
      expect(mockState.page.blocks[0].colWidths).toBeUndefined();
      distributeColsEvenly('tbl1');
      expect(mockState.page.blocks[0].colWidths.length).toBe(3);
    });
    it('insertColAt 후 resizeColWithNeighborCompensation 정상 동작', function() {
      insertColAt('tbl1', 0);
      expect(mockState.page.blocks[0].colWidths.length).toBe(4);
      resizeColWithNeighborCompensation('tbl1', 0, 40);
      var sum = mockState.page.blocks[0].colWidths.reduce(function(a,b){return a+b},0);
      expect(Math.round(sum)).toBe(100);
    });
  });
});
