// src/editor/__tests__/blocks.test.js — hasChanges 단위 테스트

import { describe, it, expect, beforeEach, vi } from 'vitest';

var { mockState } = vi.hoisted(() => {
  var mockState = {
    editMode: false,
    editBackup: null,
    page: { blocks: [] },
    db: { pages: [], settings: { wsName: 'Test' }, recent: [], users: [] },
    user: { id: 'testuser' },
    _mockCollectedBlocks: [],
  };
  return { mockState };
});

vi.mock('../../data/store.js', () => ({ default: mockState }));
vi.mock('../../data/firestore.js', () => ({
  saveDB: vi.fn(),
  logDeleteAction: vi.fn(),
  USE_NEW_STRUCTURE: false,
  batchDeletePages: vi.fn(),
}));
vi.mock('../../config/firebase.js', () => ({
  MAX_VER: 50,
}));
vi.mock('../../auth/auth.js', () => ({
  isSuper: vi.fn(() => false),
}));
vi.mock('../renderer.js', () => ({
  renderBlocks: vi.fn(),
}));
vi.mock('../blocks.js', () => ({
  getPages: vi.fn(() => []),
  getPage: vi.fn((id) => mockState.db.pages.find((p) => p.id === id) || null),
  getPath: vi.fn(() => []),
  collectBlocks: vi.fn(() => mockState._mockCollectedBlocks || []),
  triggerAutoSave: vi.fn(),
}));
vi.mock('../../ui/modals.js', () => ({
  openModal: vi.fn(),
  closeModal: vi.fn(),
  closeAllPanels: vi.fn(),
}));

import { hasChanges } from '../../ui/sidebar.js';

// DOM 요소 설정
function setupDOM() {
  document.body.innerHTML =
    '<input id="pageTitle" value="\ud14c\uc2a4\ud2b8 \ud398\uc774\uc9c0" readonly />' +
    '<span id="pageIcon">\ud83d\udcc4</span>' +
    '<div id="editor"></div>' +
    '<div id="breadcrumb"></div>' +
    '<div id="pageMeta"></div>' +
    '<div id="pageTags"></div>' +
    '<div id="editBtn" style="display:inline-flex"></div>' +
    '<div id="deletePageBtn" style="display:inline-flex"></div>' +
    '<div id="saveBtn" style="display:none"></div>' +
    '<div id="cancelBtn" style="display:none"></div>' +
    '<div id="editorWrap"></div>' +
    '<div id="versionList"></div>' +
    '<div id="commentList"></div>' +
    '<div id="pageTree"></div>' +
    '<div id="ctxMenu"></div>' +
    '<div id="slashMenu"></div>' +
    '<div id="fmtBar"></div>' +
    '<div id="tagPicker"></div>';
}

describe('hasChanges', () => {
  beforeEach(() => {
    setupDOM();
    mockState.editMode = true;
    mockState.editBackup = {
      title: '\ud14c\uc2a4\ud2b8 \ud398\uc774\uc9c0',
      icon: '\ud83d\udcc4',
      blocks: [{ id: 'b1', type: 'text', content: '\uc6d0\ubcf8 \ub0b4\uc6a9' }],
    };
    mockState._mockCollectedBlocks = [{ id: 'b1', type: 'text', content: '\uc6d0\ubcf8 \ub0b4\uc6a9' }];
  });

  it('content \ubcc0\uacbd\uc744 \uac10\uc9c0\ud55c\ub2e4', () => {
    mockState._mockCollectedBlocks = [{ id: 'b1', type: 'text', content: '\ubcc0\uacbd\ub41c \ub0b4\uc6a9' }];
    expect(hasChanges()).toBe(true);
  });

  it('type \ubcc0\uacbd\uc744 \uac10\uc9c0\ud55c\ub2e4', () => {
    mockState._mockCollectedBlocks = [{ id: 'b1', type: 'h1', content: '\uc6d0\ubcf8 \ub0b4\uc6a9' }];
    expect(hasChanges()).toBe(true);
  });

  it('checked \ubcc0\uacbd\uc744 \uac10\uc9c0\ud55c\ub2e4', () => {
    mockState.editBackup.blocks = [{ id: 'b1', type: 'todo', content: '\ud560\uc77c', checked: false }];
    mockState._mockCollectedBlocks = [{ id: 'b1', type: 'todo', content: '\ud560\uc77c', checked: true }];
    expect(hasChanges()).toBe(true);
  });

  it('rows (\ud14c\uc774\ube14) \ubcc0\uacbd\uc744 \uac10\uc9c0\ud55c\ub2e4', () => {
    mockState.editBackup.blocks = [{ id: 'b1', type: 'table', content: '', rows: [['A', 'B'], ['C', 'D']] }];
    mockState._mockCollectedBlocks = [{ id: 'b1', type: 'table', content: '', rows: [['A', 'B'], ['C', 'X']] }];
    expect(hasChanges()).toBe(true);
  });

  it('\ube14\ub85d \uc218 \ubcc0\uacbd\uc744 \uac10\uc9c0\ud55c\ub2e4', () => {
    mockState._mockCollectedBlocks = [
      { id: 'b1', type: 'text', content: '\uc6d0\ubcf8 \ub0b4\uc6a9' },
      { id: 'b2', type: 'text', content: '\ucd94\uac00 \ube14\ub85d' },
    ];
    expect(hasChanges()).toBe(true);
  });

  it('\ubcc0\uacbd \uc5c6\uc73c\uba74 false \ubc18\ud658', () => {
    expect(hasChanges()).toBe(false);
  });

  it('editBackup\uc774 \uc5c6\uc73c\uba74 false \ubc18\ud658', () => {
    mockState.editBackup = null;
    expect(hasChanges()).toBe(false);
  });

  it('editMode\uac00 false\uc774\uba74 false \ubc18\ud658', () => {
    mockState.editMode = false;
    expect(hasChanges()).toBe(false);
  });

  it('\ud0c0\uc774\ud2c0 \ubcc0\uacbd\uc744 \uac10\uc9c0\ud55c\ub2e4', () => {
    document.getElementById('pageTitle').value = '\ubcc0\uacbd\ub41c \ud0c0\uc774\ud2c0';
    expect(hasChanges()).toBe(true);
  });

  it('\uc544\uc774\ucf58 \ubcc0\uacbd\uc744 \uac10\uc9c0\ud55c\ub2e4', () => {
    document.getElementById('pageIcon').textContent = '\ud83c\udfaf';
    expect(hasChanges()).toBe(true);
  });
});
