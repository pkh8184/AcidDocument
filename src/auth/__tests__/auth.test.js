import { describe, it, expect, beforeEach, vi } from 'vitest';

var { mockState } = vi.hoisted(function() {
  var mockState = {
    user: { id: 'testuser', pw: '1234', role: 'admin', active: true, nickname: 'Test' },
    db: { users: [], settings: { wsName: 'Test' }, pages: [] },
    page: { id: 'p1', blocks: [{ id: 'b1', type: 'text', content: 'hello' }] },
    editMode: true,
    editBackup: { blocks: [] },
    slashMenuState: { open: true, idx: 2 },
    autoSaveTimer: 999,
    isComposing: true,
    dragPageId: 'dp1',
    deleteTargetId: 'dt1',
    currentEditBlockId: 'eb1',
    currentInsertIdx: 3,
    currentSlideIdx: 1,
    panelType: 'comments',
    savedSelection: {},
    editingCommentId: 'ec1',
    renamePageId: 'rp1',
    currentCalIdx: 2,
    selectedEventColor: '#ff0000',
    colWidthTableId: 'cw1',
    currentTagElement: {},
    lastSearchQuery: 'test',
    viewerImages: ['img1.jpg', 'img2.jpg'],
    viewerIndex: 1,
    slideIntervals: { s1: 101, s2: 102 },
    undoStack: [{ blocks: [] }],
    redoStack: [{ blocks: [] }],
    undoTimer: 888,
    dragBlockIdx: 5,
    loginInProgress: true,
    appInitialized: true,
    loggingOut: false,
    lockTimerInterval: 777
  };
  return { mockState: mockState };
});

vi.mock('../../data/store.js', function() { return { default: mockState }; });
vi.mock('../../config/firebase.js', function() {
  return {
    SUPER: 'superadmin',
    auth: {
      signOut: vi.fn(function() { return Promise.resolve(); }),
      currentUser: null
    },
    firestore: { collection: vi.fn() }
  };
});
vi.mock('../../utils/helpers.js', function() {
  return {
    $: vi.fn(function(id) {
      return {
        classList: { add: vi.fn(), remove: vi.fn() },
        style: {},
        value: '',
        textContent: ''
      };
    }),
    toast: vi.fn(),
    getLoginState: vi.fn(function() { return { attempts: 0, lockUntil: 0, blocked: false }; }),
    saveLoginState: vi.fn()
  };
});
vi.mock('../../data/firestore.js', function() {
  return {
    saveDB: vi.fn(),
    logLoginAttempt: vi.fn(),
    getLoginLockState: vi.fn(),
    updateLoginLockState: vi.fn(),
    clearLoginLockState: vi.fn()
  };
});
vi.mock('../../main.js', function() { return { initApp: vi.fn() }; });
vi.mock('../../ui/modals.js', function() {
  return {
    openModal: vi.fn(),
    closeModal: vi.fn(),
    closeAllModals: vi.fn(),
    closeAllPanels: vi.fn()
  };
});

describe('resetAppState', function() {
  beforeEach(function() {
    mockState.editMode = true;
    mockState.editBackup = { blocks: [] };
    mockState.autoSaveTimer = 999;
    mockState.undoTimer = 888;
    mockState.lockTimerInterval = 777;
    mockState.undoStack = [{ blocks: [] }];
    mockState.redoStack = [{ blocks: [] }];
    mockState.viewerImages = ['img1.jpg'];
    mockState.viewerIndex = 1;
    mockState.slideIntervals = { s1: 101 };
    mockState.slashMenuState = { open: true, idx: 2 };
    mockState.editingCommentId = 'ec1';
    mockState.panelType = 'comments';
    mockState.currentEditBlockId = 'eb1';
    mockState.renamePageId = 'rp1';
    mockState.currentCalIdx = 2;
    mockState.colWidthTableId = 'cw1';
    mockState.deleteTargetId = 'dt1';
    mockState.currentInsertIdx = 3;
    mockState.currentSlideIdx = 1;
    mockState.dragBlockIdx = 5;
    mockState.dragPageId = 'dp1';
    mockState.savedSelection = {};
    mockState.currentTagElement = {};
    mockState.lastSearchQuery = 'test';
    mockState.selectedEventColor = '#ff0000';
    mockState.loginInProgress = true;
    mockState.isComposing = true;
    mockState.appInitialized = true;
    mockState.loggingOut = false;
  });

  it('타이머가 모두 정리되어야 함', async function() {
    var clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    var clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

    var { resetAppState } = await import('../../auth/auth.js');
    resetAppState();

    expect(clearTimeoutSpy).toHaveBeenCalledWith(999);
    expect(clearTimeoutSpy).toHaveBeenCalledWith(888);
    expect(clearIntervalSpy).toHaveBeenCalledWith(777);
    expect(clearIntervalSpy).toHaveBeenCalledWith(101);

    clearTimeoutSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });

  it('에디터 상태가 초기화되어야 함', async function() {
    var { resetAppState } = await import('../../auth/auth.js');
    resetAppState();

    expect(mockState.editMode).toBe(false);
    expect(mockState.editBackup).toBeNull();
    expect(mockState.undoStack).toEqual([]);
    expect(mockState.redoStack).toEqual([]);
    expect(mockState.isComposing).toBe(false);
  });

  it('뷰어/슬라이드 상태가 초기화되어야 함', async function() {
    var { resetAppState } = await import('../../auth/auth.js');
    resetAppState();

    expect(mockState.viewerImages).toEqual([]);
    expect(mockState.viewerIndex).toBe(0);
    expect(mockState.slideIntervals).toEqual({});
    expect(mockState.currentSlideIdx).toBeNull();
  });

  it('컨텍스트 상태가 초기화되어야 함', async function() {
    var { resetAppState } = await import('../../auth/auth.js');
    resetAppState();

    expect(mockState.slashMenuState).toEqual({ open: false, idx: null });
    expect(mockState.editingCommentId).toBeNull();
    expect(mockState.panelType).toBeNull();
    expect(mockState.currentEditBlockId).toBeNull();
    expect(mockState.renamePageId).toBeNull();
    expect(mockState.currentCalIdx).toBeNull();
    expect(mockState.colWidthTableId).toBeNull();
    expect(mockState.deleteTargetId).toBeNull();
    expect(mockState.currentInsertIdx).toBeNull();
    expect(mockState.dragBlockIdx).toBeNull();
    expect(mockState.dragPageId).toBeNull();
    expect(mockState.savedSelection).toBeNull();
    expect(mockState.currentTagElement).toBeNull();
    expect(mockState.lastSearchQuery).toBe('');
    expect(mockState.selectedEventColor).toBe('#3b82f6');
    expect(mockState.loginInProgress).toBe(false);
    expect(mockState.appInitialized).toBe(false);
  });

  it('state.db는 유지되어야 함', async function() {
    mockState.db = { users: [{ id: 'u1' }], settings: { wsName: 'WS' }, pages: [] };
    var { resetAppState } = await import('../../auth/auth.js');
    resetAppState();

    expect(mockState.db).not.toBeNull();
    expect(mockState.db.users.length).toBe(1);
  });
});

describe('logout', function() {
  it('logout 호출 시 resetAppState가 실행되어야 함', async function() {
    mockState.user = { id: 'testuser' };
    mockState.page = { id: 'p1' };
    mockState.appInitialized = true;
    mockState.editMode = true;
    mockState.undoStack = [{ blocks: [] }];

    var { logout } = await import('../../auth/auth.js');
    logout();

    expect(mockState.user).toBeNull();
    expect(mockState.page).toBeNull();
    expect(mockState.editMode).toBe(false);
    expect(mockState.undoStack).toEqual([]);
    expect(mockState.appInitialized).toBe(false);
  });
});

describe('showLockTimer', function() {
  it('이전 interval을 정리하고 새로 생성해야 함', async function() {
    var clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    var setIntervalSpy = vi.spyOn(globalThis, 'setInterval').mockReturnValue(42);

    mockState.lockTimerInterval = 123;

    var { showLockTimer } = await import('../../auth/auth.js');
    showLockTimer(Date.now() + 60000);

    expect(clearIntervalSpy).toHaveBeenCalledWith(123);
    expect(mockState.lockTimerInterval).toBe(42);

    clearIntervalSpy.mockRestore();
    setIntervalSpy.mockRestore();
  });
});
