// src/data/__tests__/firestore.test.js — firestoreCall + batchDeletePages 단위 테스트

import { describe, it, expect, beforeEach, vi } from 'vitest';

// --- mock 설정 (vi.hoisted로 호이스팅 보장) ---
var { mockBatch, mockFirestore, mockToast } = vi.hoisted(() => {
  var mockBatch = {
    delete: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
  };
  var mockFirestore = {
    collection: vi.fn().mockReturnThis(),
    doc: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue({ exists: true, data: () => ({}) }),
    set: vi.fn().mockResolvedValue(undefined),
    batch: vi.fn(() => mockBatch),
  };
  var mockToast = vi.fn();
  return { mockBatch, mockFirestore, mockToast };
});

vi.mock('../../config/firebase.js', () => ({
  firestore: mockFirestore,
  MAX_FILE_SIZE: 10 * 1024 * 1024,
  CLOUDINARY_CLOUD_NAME: 'testcloud',
  CLOUDINARY_UPLOAD_PRESET: 'testpreset',
}));

vi.mock('../../utils/helpers.js', () => ({
  $: vi.fn(),
  genId: vi.fn(() => 'test-id'),
  toast: (...args) => mockToast(...args),
  formatBytes: vi.fn((b) => b + ' Bytes'),
}));

vi.mock('../store.js', () => ({
  default: {
    db: {
      users: [],
      pages: [],
      templates: [],
      settings: { wsName: 'Test', theme: 'dark', notice: '' },
      storageUsage: 0,
      session: null,
      recent: [],
    },
    user: { id: 'admin8184', nickname: 'admin' },
  },
}));

// 모듈 import (mock 적용 후)
import { firestoreCall, batchDeletePages, uploadToStorage, validateUploadFile } from '../firestore.js';

// --- 테스트 ---

describe('firestoreCall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('성공 시 operation 결과를 반환한다', async () => {
    var result = await firestoreCall(
      () => Promise.resolve('ok'),
      'test error'
    );
    expect(result).toBe('ok');
  });

  it('실패 시 에러를 console.error로 출력한다', async () => {
    var consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    var err = new Error('fail');

    await expect(
      firestoreCall(() => Promise.reject(err), '테스트 에러')
    ).rejects.toThrow('fail');

    expect(consoleSpy).toHaveBeenCalledWith('테스트 에러', err);
    consoleSpy.mockRestore();
  });

  it('실패 시 toast 에러를 표시한다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      firestoreCall(() => Promise.reject(new Error('fail')), '테스트 에러')
    ).rejects.toThrow();

    expect(mockToast).toHaveBeenCalledWith('테스트 에러', 'err');
    console.error.mockRestore();
  });

  it('실패 시 원래 에러를 re-throw한다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    var err = new Error('원본 에러');

    await expect(
      firestoreCall(() => Promise.reject(err), '래핑 메시지')
    ).rejects.toBe(err);

    console.error.mockRestore();
  });

  it('동기 함수도 처리한다', async () => {
    var result = await firestoreCall(() => 'sync result', 'error');
    expect(result).toBe('sync result');
  });
});

describe('batchDeletePages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBatch.delete.mockClear();
    mockBatch.commit.mockResolvedValue(undefined);
  });

  it('빈 배열이면 아무것도 하지 않는다', async () => {
    await batchDeletePages([]);
    expect(mockFirestore.batch).not.toHaveBeenCalled();
  });

  it('페이지 ID 목록으로 batch delete를 실행한다', async () => {
    await batchDeletePages(['page1', 'page2', 'page3']);

    expect(mockFirestore.batch).toHaveBeenCalledTimes(1);
    expect(mockBatch.delete).toHaveBeenCalledTimes(3);
    expect(mockBatch.commit).toHaveBeenCalledTimes(1);
  });

  it('500개 초과 시 여러 batch로 분할한다', async () => {
    var ids = [];
    for (var i = 0; i < 502; i++) {
      ids.push('page' + i);
    }

    await batchDeletePages(ids);

    // 502개 -> 2개 batch (500 + 2)
    expect(mockFirestore.batch).toHaveBeenCalledTimes(2);
    expect(mockBatch.commit).toHaveBeenCalledTimes(2);
    expect(mockBatch.delete).toHaveBeenCalledTimes(502);
  });

  it('batch commit 실패 시 에러를 throw한다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockBatch.commit.mockRejectedValueOnce(new Error('batch fail'));

    await expect(batchDeletePages(['page1'])).rejects.toThrow('batch fail');

    console.error.mockRestore();
  });
});

describe('validateUploadFile', () => {
  it('허용 타입과 정확히 일치하면 null을 반환한다', () => {
    var file = { type: 'image/png', name: 'a.png', size: 1000 };
    expect(validateUploadFile(file, ['image/png', 'image/jpeg'], 10 * 1024 * 1024)).toBeNull();
  });
  it('허용되지 않은 타입이면 에러 메시지를 반환한다', () => {
    var file = { type: 'application/x-msdownload', name: 'a.exe', size: 1000 };
    expect(validateUploadFile(file, ['image/png'], 10 * 1024 * 1024)).toContain('허용되지 않는');
  });
  it('substring 매칭으로 우회되지 않는다', () => {
    var file = { type: 'application/png-fake', name: 'a.dat', size: 1000 };
    expect(validateUploadFile(file, ['image/png'], 10 * 1024 * 1024)).not.toBeNull();
  });
  it('MIME이 비어있으면 확장자로 폴백한다', () => {
    var file = { type: '', name: 'photo.PNG', size: 1000 };
    expect(validateUploadFile(file, ['image/png'], 10 * 1024 * 1024)).toBeNull();
  });
  it('MIME이 비어있고 확장자도 허용 목록 밖이면 거부한다', () => {
    var file = { type: '', name: 'photo.exe', size: 1000 };
    expect(validateUploadFile(file, ['image/png'], 10 * 1024 * 1024)).not.toBeNull();
  });
  it('파일 크기가 maxSize를 초과하면 에러를 반환한다', () => {
    var file = { type: 'image/png', name: 'a.png', size: 20 * 1024 * 1024 };
    expect(validateUploadFile(file, ['image/png'], 10 * 1024 * 1024)).toContain('너무 큽니다');
  });
  it('allowedTypes가 없으면 타입 검사를 건너뛴다', () => {
    var file = { type: 'application/zip', name: 'a.zip', size: 1000 };
    expect(validateUploadFile(file, null, 10 * 1024 * 1024)).toBeNull();
  });
});

describe('uploadToStorage', () => {
  it('허용되지 않은 타입이면 reject한다', async () => {
    var file = { type: 'application/x-msdownload', name: 'a.exe', size: 100 };
    await expect(uploadToStorage(file, 'images', ['image/png'])).rejects.toThrow('허용되지 않는');
  });
  it('크기 초과면 reject한다', async () => {
    var file = { type: 'image/png', name: 'a.png', size: 20 * 1024 * 1024 };
    await expect(uploadToStorage(file, 'images', ['image/png'])).rejects.toThrow('너무 큽니다');
  });
  it('Cloudinary 성공 응답 시 secure_url을 반환한다', async () => {
    var fakeXHR = {
      open: vi.fn(), upload: {}, status: 0, responseText: '',
      send: function () {
        this.status = 200;
        this.responseText = JSON.stringify({ secure_url: 'https://res.cloudinary.com/x.png' });
        this.onload();
      },
    };
    vi.stubGlobal('XMLHttpRequest', function () { return fakeXHR; });
    var file = { type: 'image/png', name: 'a.png', size: 100 };
    var result = await uploadToStorage(file, 'images', ['image/png']);
    expect(result.url).toBe('https://res.cloudinary.com/x.png');
    vi.unstubAllGlobals();
  });
  it('네트워크 오류 시 reject한다', async () => {
    var fakeXHR = {
      open: vi.fn(), upload: {}, status: 0, responseText: '',
      send: function () { this.onerror(); },
    };
    vi.stubGlobal('XMLHttpRequest', function () { return fakeXHR; });
    var file = { type: 'image/png', name: 'a.png', size: 100 };
    await expect(uploadToStorage(file, 'images', ['image/png'])).rejects.toThrow();
    vi.unstubAllGlobals();
  });
});
