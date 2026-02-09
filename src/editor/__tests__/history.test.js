import { describe, it, expect, beforeEach, vi } from 'vitest';

var { mockState } = vi.hoisted(() => {
  var mockState = {
    page: { blocks: [{ id: 'b1', type: 'text', content: 'hello' }] },
    editMode: true,
    undoStack: [],
    redoStack: [],
    undoTimer: null,
    autoSaveTimer: null,
    currentInsertIdx: null,
  };
  return { mockState };
});

vi.mock('../../data/store.js', () => ({ default: mockState }));

function mockCollectBlocks() {
  return JSON.parse(JSON.stringify(mockState.page.blocks));
}

vi.mock('../renderer.js', () => ({ renderBlocks: vi.fn() }));
vi.mock('../blocks.js', () => ({
  collectBlocks: vi.fn(() => mockCollectBlocks()),
  triggerAutoSave: vi.fn(),
  focusBlock: vi.fn(),
}));

import { pushUndo, undo, redo, clearHistory } from '../history.js';

describe('History (Undo/Redo)', () => {
  beforeEach(() => {
    mockState.page = { blocks: [{ id: 'b1', type: 'text', content: 'hello' }] };
    mockState.undoStack = [];
    mockState.redoStack = [];
    mockState.editMode = true;
  });

  it('pushUndo는 현재 상태를 undoStack에 저장', () => {
    pushUndo();
    expect(mockState.undoStack.length).toBe(1);
    expect(mockState.undoStack[0][0].content).toBe('hello');
  });

  it('pushUndo 시 redoStack 클리어', () => {
    mockState.redoStack = [[]];
    pushUndo();
    expect(mockState.redoStack.length).toBe(0);
  });

  it('undoStack 최대 50개 유지', () => {
    for (var i = 0; i < 55; i++) {
      mockState.page.blocks = [{ id: 'b' + i, type: 'text', content: 'v' + i }];
      pushUndo();
    }
    expect(mockState.undoStack.length).toBe(50);
  });

  it('undo는 이전 상태로 복원', () => {
    pushUndo();
    mockState.page.blocks = [{ id: 'b1', type: 'text', content: 'changed' }];
    undo();
    expect(mockState.page.blocks[0].content).toBe('hello');
  });

  it('undo 시 현재 상태가 redoStack에 저장', () => {
    pushUndo();
    mockState.page.blocks = [{ id: 'b1', type: 'text', content: 'changed' }];
    undo();
    expect(mockState.redoStack.length).toBe(1);
  });

  it('빈 undoStack에서 undo 호출해도 에러 없음', () => {
    expect(() => undo()).not.toThrow();
  });

  it('redo는 undo된 상태를 복원', () => {
    pushUndo();
    mockState.page.blocks = [{ id: 'b1', type: 'text', content: 'changed' }];
    undo();
    redo();
    expect(mockState.page.blocks[0].content).toBe('changed');
  });

  it('clearHistory는 양쪽 스택 모두 비움', () => {
    pushUndo();
    pushUndo();
    clearHistory();
    expect(mockState.undoStack.length).toBe(0);
    expect(mockState.redoStack.length).toBe(0);
  });

  it('editMode가 false면 pushUndo 무시', () => {
    mockState.editMode = false;
    pushUndo();
    expect(mockState.undoStack.length).toBe(0);
  });

  it('page가 null이면 undo 무시', () => {
    mockState.page = null;
    expect(() => undo()).not.toThrow();
  });
});
