import { describe, it, expect, beforeEach, vi } from 'vitest';

var { mockState } = vi.hoisted(() => {
  var mockState = {
    page: {
      blocks: [
        { id: 'b1', type: 'text', content: 'first' },
        { id: 'b2', type: 'text', content: 'second' },
        { id: 'b3', type: 'text', content: 'third' },
      ],
    },
    editMode: true,
    undoStack: [],
    redoStack: [],
    undoTimer: null,
    dragBlockIdx: null,
  };
  return { mockState };
});

vi.mock('../../data/store.js', () => ({ default: mockState }));
vi.mock('../../config/firebase.js', () => ({ ALLOWED_IMAGE_TYPES: [] }));
vi.mock('../../utils/helpers.js', () => ({ $: vi.fn(), $$: vi.fn(), genId: vi.fn(), toast: vi.fn() }));
vi.mock('../../data/firestore.js', () => ({ uploadToStorage: vi.fn() }));
vi.mock('../renderer.js', () => ({ renderBlocks: vi.fn() }));
vi.mock('../blocks.js', () => ({
  collectBlocks: vi.fn(() => JSON.parse(JSON.stringify(mockState.page.blocks))),
  triggerAutoSave: vi.fn(),
  focusBlock: vi.fn(),
  insertBlock: vi.fn(),
  deleteBlock: vi.fn(),
  addBlockBelow: vi.fn(),
  updateNums: vi.fn(),
  setupBlockTracking: vi.fn(),
  copyCode: vi.fn(),
  downloadCode: vi.fn(),
  findBlock: vi.fn(),
  findBlockIndex: vi.fn(),
}));
vi.mock('../media.js', () => ({
  addImageBlock: vi.fn(),
  addPdfBlock: vi.fn(),
  closeImageViewer: vi.fn(),
  viewerNav: vi.fn(),
  openImageViewer: vi.fn(),
}));
vi.mock('../../ui/toolbar.js', () => ({
  showSlash: vi.fn(),
  hideSlash: vi.fn(),
  filterSlash: vi.fn(),
  moveSlashSel: vi.fn(),
  execSlash: vi.fn(),
  showFmtBar: vi.fn(),
  hideFmtBar: vi.fn(),
  showTagPicker: vi.fn(),
  hideTagPicker: vi.fn(),
}));
vi.mock('../../ui/modals.js', () => ({
  openSearch: vi.fn(),
  closeModal: vi.fn(),
  closeAllModals: vi.fn(),
  closeAllPanels: vi.fn(),
  openShortcutHelp: vi.fn(),
}));
vi.mock('../../ui/sidebar.js', () => ({ hideCtx: vi.fn() }));
vi.mock('../history.js', () => ({
  undo: vi.fn(),
  redo: vi.fn(),
  pushUndoImmediate: vi.fn(),
}));

import { reorderBlock } from '../listeners.js';

describe('Block Drag & Drop', () => {
  beforeEach(() => {
    mockState.page.blocks = [
      { id: 'b1', type: 'text', content: 'first' },
      { id: 'b2', type: 'text', content: 'second' },
      { id: 'b3', type: 'text', content: 'third' },
    ];
  });

  it('블록을 아래로 이동 (0→2)', () => {
    reorderBlock(0, 2);
    expect(mockState.page.blocks[0].content).toBe('second');
    expect(mockState.page.blocks[1].content).toBe('third');
    expect(mockState.page.blocks[2].content).toBe('first');
  });

  it('블록을 위로 이동 (2→0)', () => {
    reorderBlock(2, 0);
    expect(mockState.page.blocks[0].content).toBe('third');
    expect(mockState.page.blocks[1].content).toBe('first');
    expect(mockState.page.blocks[2].content).toBe('second');
  });

  it('같은 위치면 변경 없음', () => {
    reorderBlock(1, 1);
    expect(mockState.page.blocks[0].content).toBe('first');
    expect(mockState.page.blocks[1].content).toBe('second');
    expect(mockState.page.blocks[2].content).toBe('third');
  });

  it('범위 밖 인덱스는 무시', () => {
    reorderBlock(0, 10);
    expect(mockState.page.blocks.length).toBe(3);
  });
});
