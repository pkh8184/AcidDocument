// 테이블 조작
function addTblRow(id) {
  for (var i = 0; i < page.blocks.length; i++) {
    if (page.blocks[i].id === id) {
      var b = page.blocks[i];
      if (!b.rows) return;
      var cols = b.rows[0] ? b.rows[0].length : 3, nr = [];
      for (var j = 0; j < cols; j++) nr.push('');
      b.rows.push(nr);
      renderBlocks();
      triggerAS();
      toast('행 추가');
      return;
    }
  }
}

function addTblCol(id) {
  for (var i = 0; i < page.blocks.length; i++) {
    if (page.blocks[i].id === id) {
      var b = page.blocks[i];
      if (!b.rows) return;
      for (var j = 0; j < b.rows.length; j++) b.rows[j].push('');
      renderBlocks();
      triggerAS();
      toast('열 추가');
      return;
    }
  }
}

function delTblRow(id) {
  for (var i = 0; i < page.blocks.length; i++) {
    if (page.blocks[i].id === id) {
      var b = page.blocks[i];
      if (!b.rows || b.rows.length <= 1) return;
      b.rows.pop();
      renderBlocks();
      triggerAS();
      toast('행 삭제');
      return;
    }
  }
}

function delTblCol(id) {
  for (var i = 0; i < page.blocks.length; i++) {
    if (page.blocks[i].id === id) {
      var b = page.blocks[i];
      if (!b.rows || b.rows[0].length <= 1) return;
      for (var j = 0; j < b.rows.length; j++) b.rows[j].pop();
      renderBlocks();
      triggerAS();
      toast('열 삭제');
      return;
    }
  }
}

function setTblAlign(id, align) {
  if (!align) return;
  for (var i = 0; i < page.blocks.length; i++) {
    if (page.blocks[i].id === id) {
      page.blocks[i].align = align;
      renderBlocks();
      triggerAS();
      return;
    }
  }
}

function deleteTable(id) {
  if (!confirm('표를 삭제하시겠습니까?')) return;
  for (var i = 0; i < page.blocks.length; i++) {
    if (page.blocks[i].id === id) {
      page.blocks.splice(i, 1);
      renderBlocks();
      triggerAS();
      toast('표 삭제됨');
      return;
    }
  }
}

// 서식바
function showFmtBar() {
  var sel = window.getSelection();
  if (!sel.rangeCount || sel.isCollapsed) { hideFmtBar(); return; }
  var rng = sel.getRangeAt(0), rect = rng.getBoundingClientRect();
  if (rect.width < 5) { hideFmtBar(); return; }
  var bar = $('fmtBar');
  bar.style.left = Math.max(10, rect.left + rect.width / 2 - 110) + 'px';
  bar.style.top = Math.max(10, rect.top - 50) + 'px';
  bar.classList.add('open');
}

function hideFmtBar() { $('fmtBar').classList.remove('open'); }

function fmtCmd(cmd) {
  document.execCommand(cmd, false, null);
  triggerAS();
}

function openColorPicker() {
  var html = '';
  for (var i = 0; i < COLORS.length; i++) {
    html += '<div class="color-item" style="background:' + COLORS[i] + '" onclick="applyColor(\'' + COLORS[i] + '\')"></div>';
  }
  $('colorGrid').innerHTML = html;
  openModal('colorModal');
}

function applyColor(c) {
  closeModal('colorModal');
  document.execCommand('foreColor', false, c);
  triggerAS();
}

function copyCode(btn) {
  var wrap = btn.closest('.block-code-wrap');
  var code = wrap.querySelector('.block-content').textContent;
  navigator.clipboard.writeText(code).then(function() { toast('복사됨'); });
}

// 슬래시 메뉴
function showSlash(el) {
  var rect = el.getBoundingClientRect(), menu = $('slashMenu');
  menu.style.left = Math.min(rect.left, window.innerWidth - 320) + 'px';
  menu.style.top = (rect.bottom + 8) + 'px';
  renderSlashMenu('');
  menu.classList.add('open');
}

function hideSlash() {
  $('slashMenu').classList.remove('open');
  slashSt = { open: false, idx: null };
}

function renderSlashMenu(filter) {
  var menu = $('slashMenu'), q = filter.toLowerCase().trim(), html = '', hasItems = false, first = true;
  for (var s = 0; s < SLASH.length; s++) {
    var sec = SLASH[s], filtered = [];
    for (var i = 0; i < sec.i.length; i++) {
      var it = sec.i[i];
      if (!q || it.n.toLowerCase().indexOf(q) !== -1 || it.t.toLowerCase().indexOf(q) !== -1) filtered.push(it);
    }
    if (filtered.length === 0) continue;
    hasItems = true;
    html += '<div class="slash-section">' + sec.s + '</div>';
    for (var j = 0; j < filtered.length; j++) {
      var f = filtered[j];
      html += '<div class="slash-item' + (first ? ' sel' : '') + '" data-type="' + f.t + '"><div class="slash-icon">' + f.c + '</div><div><div style="font-weight:500">' + f.n + '</div><div style="font-size:12px;color:var(--t4)">' + f.d + '</div></div></div>';
      first = false;
    }
  }
  if (!hasItems) html = '<div style="padding:20px;text-align:center;color:var(--t4)">결과 없음</div>';
  menu.innerHTML = html;
  
  var items = menu.querySelectorAll('.slash-item');
  for (var k = 0; k < items.length; k++) {
    (function(it) {
      it.addEventListener('click', function() { execSlash(it.getAttribute('data-type')); });
      it.addEventListener('mouseenter', function() {
        var all = menu.querySelectorAll('.slash-item');
        for (var m = 0; m < all.length; m++) all[m].classList.remove('sel');
        it.classList.add('sel');
      });
    })(items[k]);
  }
}

function filterSlash(q) { renderSlashMenu(q); }

function moveSlashSel(dir) {
  var menu = $('slashMenu'), items = menu.querySelectorAll('.slash-item');
  if (!items.length) return;
  var cur = -1;
  for (var i = 0; i < items.length; i++) { if (items[i].classList.contains('sel')) { cur = i; break; } }
  var n = cur + dir;
  if (n < 0) n = items.length - 1;
  if (n >= items.length) n = 0;
  for (var j = 0; j < items.length; j++) items[j].classList.remove('sel');
  items[n].classList.add('sel');
  items[n].scrollIntoView({ block: 'nearest' });
}

function execSlash(type) {
  var idx = slashSt.idx;
  hideSlash();
  if (idx === null) return;
  
  if (type === 'image') { slashSt.idx = idx; insertImage(); return; }
  if (type === 'video') { slashSt.idx = idx; insertVideo(); return; }
  if (type === 'pdf') { slashSt.idx = idx; insertPdf(); return; }
  if (type === 'file') { slashSt.idx = idx; insertFile(); return; }
  
  var b = page.blocks[idx];
  b.type = type;
  b.content = '';
  
  switch (type) {
    case 'table': b.rows = [['', '', ''], ['', '', '']]; break;
    case 'callout': b.calloutType = 'info'; break;
    case 'number': b.num = 1; break;
    case 'toggle': b.open = false; b.innerContent = ''; break;
    case 'todo': b.checked = false; break;
    case 'col2': b.type = 'columns'; b.columns = ['', '']; break;
    case 'col3': b.type = 'columns'; b.columns = ['', '', '']; break;
  }
  
  if (type === 'toc' || type === 'divider') {
    page.blocks.splice(idx + 1, 0, { id: genId(), type: 'text', content: '' });
  }
  
  renderBlocks();
  setTimeout(function() {
    var focusIdx = (type === 'toc' || type === 'divider') ? idx + 1 : idx;
    var el = $('editor').children[focusIdx];
    if (el) {
      var c = el.querySelector('.block-content') || el.querySelector('.block-col-content');
      if (c) c.focus();
    }
  }, 30);
}

// 미디어 삽입
function insertImage() {
  openModal('imageUploadModal');
  $('imageUrlInput').value = '';
  $('imageFileInput').value = '';
}

async function submitImage() {
  var url = $('imageUrlInput').value.trim();
  var file = $('imageFileInput').files[0];
  
  if (file) {
    try {
      toast('업로드 중...', 'warn');
      var downloadUrl = await uploadFile(file);
      addImageBlock(downloadUrl);
    } catch (err) {
      toast('업로드 실패', 'err');
    }
  } else if (url) {
    addImageBlock(url);
  } else {
    toast('URL 또는 파일을 선택하세요', 'err');
    return;
  }
}

function addImageBlock(src) {
  var b = { id: genId(), type: 'image', src: src, caption: '' };
  if (slashSt.idx !== null) {
    page.blocks[slashSt.idx] = b;
    slashSt.idx = null;
  } else {
    page.blocks.push(b);
  }
  renderBlocks();
  triggerAS();
  closeModal('imageUploadModal');
  toast('이미지 삽입');
}

function insertVideo() {
  openModal('videoUploadModal');
  $('videoUrlInput').value = '';
  $('videoFileInput').value = '';
}

async function submitVideo() {
  var url = $('videoUrlInput').value.trim();
  var file = $('videoFileInput').files[0];
  
  if (file) {
    try {
      toast('업로드 중...', 'warn');
      var downloadUrl = await uploadFile(file);
      addVideoBlock(downloadUrl, file.name);
    } catch (err) {
      toast('업로드 실패', 'err');
    }
  } else if (url) {
    var vid = getYTId(url);
    if (!vid) { toast('유효한 YouTube URL을 입력하세요', 'err'); return; }
    addVideoBlock(url, null);
  } else {
    toast('URL 또는 파일을 선택하세요', 'err');
    return;
  }
}

function addVideoBlock(src, fname) {
  var b = { id: genId(), type: 'video', url: src, isFile: !!fname, fileName: fname || '' };
  if (slashSt.idx !== null) {
    page.blocks[slashSt.idx] = b;
    slashSt.idx = null;
  } else {
    page.blocks.push(b);
  }
  renderBlocks();
  triggerAS();
  closeModal('videoUploadModal');
  toast('동영상 삽입');
}

function insertPdf() {
  openModal('pdfUploadModal');
  $('pdfUrlInput').value = '';
  $('pdfFileInput').value = '';
}

async function submitPdf() {
  var url = $('pdfUrlInput').value.trim();
  var file = $('pdfFileInput').files[0];
  
  if (file) {
    try {
      toast('업로드 중...', 'warn');
      var downloadUrl = await uploadFile(file);
      addPdfBlock(downloadUrl);
    } catch (err) {
      toast('업로드 실패', 'err');
    }
  } else if (url) {
    addPdfBlock(url);
  } else {
    toast('URL 또는 파일을 선택하세요', 'err');
    return;
  }
}

function addPdfBlock(src) {
  var b = { id: genId(), type: 'pdf', src: src };
  if (slashSt.idx !== null) {
    page.blocks[slashSt.idx] = b;
    slashSt.idx = null;
  } else {
    page.blocks.push(b);
  }
  renderBlocks();
  triggerAS();
  closeModal('pdfUploadModal');
  toast('PDF 삽입');
}

function insertFile() {
  openModal('fileUploadModal');
  $('fileFileInput').value = '';
}

async function submitFile() {
  var file = $('fileFileInput').files[0];
  if (!file) { toast('파일을 선택하세요', 'err'); return; }
  
  try {
    toast('업로드 중...', 'warn');
    var downloadUrl = await uploadFile(file);
    var b = { id: genId(), type: 'file', url: downloadUrl, name: file.name };
    if (slashSt.idx !== null) {
      page.blocks[slashSt.idx] = b;
      slashSt.idx = null;
    } else {
      page.blocks.push(b);
    }
    renderBlocks();
    triggerAS();
    closeModal('fileUploadModal');
    toast('파일 삽입');
  } catch (err) {
    toast('업로드 실패', 'err');
  }
}

// 콜아웃/코드 설정
function openCalloutIconPicker(id) {
  currentEditBlockId = id;
  var icons = ['💡', '✅', '⚠️', '❌', '📌', '🔔', '💬', '📝', '🎯', '⭐', '🚀', '💪', '🔥', '❤️', '👍', '📢'];
  var html = '';
  for (var i = 0; i < icons.length; i++) {
    html += '<div class="icon-item" onclick="setCalloutIcon(\'' + icons[i] + '\')">' + icons[i] + '</div>';
  }
  $('calloutIconGrid').innerHTML = html;
  openModal('calloutIconModal');
}

function setCalloutIcon(icon) {
  if (!currentEditBlockId) return;
  for (var i = 0; i < page.blocks.length; i++) {
    if (page.blocks[i].id === currentEditBlockId) {
      page.blocks[i].icon = icon;
      break;
    }
  }
  renderBlocks();
  triggerAS();
  closeModal('calloutIconModal');
  currentEditBlockId = null;
}

function openCodeSetting(id) {
  currentEditBlockId = id;
  for (var i = 0; i < page.blocks.length; i++) {
    if (page.blocks[i].id === id) {
      $('codeLangInput').value = page.blocks[i].lang || '';
      break;
    }
  }
  openModal('codeSettingModal');
}

function submitCodeLang() {
  if (!currentEditBlockId) return;
  var lang = $('codeLangInput').value.trim();
  for (var i = 0; i < page.blocks.length; i++) {
    if (page.blocks[i].id === currentEditBlockId) {
      page.blocks[i].lang = lang;
      break;
    }
  }
  renderBlocks();
  triggerAS();
  closeModal('codeSettingModal');
  currentEditBlockId = null;
  toast('저장됨');
}

// 블록 컨텍스트 메뉴
function showBlockCtx(e, idx) {
  e.stopPropagation();
  var m = $('ctxMenu');
  var html = '';
  html += '<div class="ctx-item" onclick="changeBlockType(' + idx + ',\'text\');hideCtx()"><span class="ctx-icon">T</span>텍스트</div>';
  html += '<div class="ctx-item" onclick="changeBlockType(' + idx + ',\'h1\');hideCtx()"><span class="ctx-icon">H1</span>제목 1</div>';
  html += '<div class="ctx-item" onclick="changeBlockType(' + idx + ',\'h2\');hideCtx()"><span class="ctx-icon">H2</span>제목 2</div>';
  html += '<div class="ctx-item" onclick="changeBlockType(' + idx + ',\'bullet\');hideCtx()"><span class="ctx-icon">•</span>글머리</div>';
  html += '<div class="ctx-item" onclick="changeBlockType(' + idx + ',\'number\');hideCtx()"><span class="ctx-icon">1.</span>번호</div>';
  html += '<div class="ctx-item" onclick="changeBlockType(' + idx + ',\'todo\');hideCtx()"><span class="ctx-icon">☑</span>할일</div>';
  html += '<div class="ctx-item" onclick="changeBlockType(' + idx + ',\'quote\');hideCtx()"><span class="ctx-icon">"</span>인용</div>';
  html += '<div class="ctx-divider"></div>';
  html += '<div class="ctx-item' + (idx === 0 ? ' disabled' : '') + '" onclick="moveBlockUp(' + idx + ');hideCtx()"><span class="ctx-icon">⬆️</span>위로 이동</div>';
  html += '<div class="ctx-item' + (idx >= page.blocks.length - 1 ? ' disabled' : '') + '" onclick="moveBlockDown(' + idx + ');hideCtx()"><span class="ctx-icon">⬇️</span>아래로 이동</div>';
  html += '<div class="ctx-divider"></div>';
  html += '<div class="ctx-item" onclick="dupBlock(' + idx + ');hideCtx()"><span class="ctx-icon">📋</span>복제</div>';
  html += '<div class="ctx-item" onclick="addBlockBelow(' + idx + ');hideCtx()"><span class="ctx-icon">➕</span>아래에 추가</div>';
  html += '<div class="ctx-divider"></div>';
  html += '<div class="ctx-item danger" onclick="deleteBlock(' + idx + ');hideCtx()"><span class="ctx-icon">🗑️</span>삭제</div>';
  m.innerHTML = html;
  showCtxAt(e.pageX, e.pageY);
}

// 이벤트 리스너 설정
function setupListeners() {
  document.addEventListener('click', function(e) {
    if (!$('ctxMenu').contains(e.target)) hideCtx();
    if (!$('slashMenu').contains(e.target) && !e.target.classList.contains('block-content')) hideSlash();
    if (!$('fmtBar').contains(e.target) && !e.target.closest('.block-content') && !e.target.closest('.block-col-content')) hideFmtBar();
  });
  
  document.addEventListener('keydown', function(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); openSearch(); }
    if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); if (editMode) saveAndExit(); }
    if (e.key === 'Escape') { closeAllModals(); closeAllPanels(); hideCtx(); hideSlash(); hideFmtBar(); }
  });
  
  window.addEventListener('resize', function() { if (window.innerWidth > 768) closeMobile(); });
  
  window.addEventListener('beforeunload', function(e) {
    if (editMode && hasChanges()) {
      e.preventDefault();
      e.returnValue = '작성 중인 내용이 저장되지 않았습니다.';
      return e.returnValue;
    }
  });
  
  // 에디터 영역 클릭
  var editorWrap = $('editorWrap');
  editorWrap.addEventListener('click', function(e) {
    if (!editMode) return;
    var editor = $('editor');
    if (e.target === editor || e.target.classList.contains('editor-inner')) {
      e.preventDefault();
      if (page.blocks.length === 0) {
        page.blocks.push({ id: genId(), type: 'text', content: '' });
        renderBlocks();
      }
      focusBlock(page.blocks.length - 1, -1);
    }
  });
  
  // 에디터 드래그앤드롭
  var editor = $('editor');
  editor.addEventListener('dragover', function(e) { e.preventDefault(); if (editMode) editor.classList.add('drag-over'); });
  editor.addEventListener('dragleave', function() { editor.classList.remove('drag-over'); });
  editor.addEventListener('drop', async function(e) {
    e.preventDefault();
    editor.classList.remove('drag-over');
    if (!editMode) return;
    
    var files = e.dataTransfer.files;
    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      try {
        toast('업로드 중...', 'warn');
        var url = await uploadFile(file);
        
        if (file.type.startsWith('image/')) {
          page.blocks.push({ id: genId(), type: 'image', src: url, caption: '' });
        } else if (file.type === 'application/pdf') {
          page.blocks.push({ id: genId(), type: 'pdf', src: url });
        } else {
          page.blocks.push({ id: genId(), type: 'file', url: url, name: file.name });
        }
        renderBlocks();
        triggerAS();
      } catch (err) {
        toast('업로드 실패', 'err');
      }
    }
  });
}

// 전역 함수 노출
window.renderBlocks = renderBlocks;
window.scrollToBlk = scrollToBlk;
window.copyCode = copyCode;
window.addTblRow = addTblRow;
window.addTblCol = addTblCol;
window.delTblRow = delTblRow;
window.delTblCol = delTblCol;
window.setTblAlign = setTblAlign;
window.deleteTable = deleteTable;
window.addBlockBelow = addBlockBelow;
window.showBlockCtx = showBlockCtx;
window.dupBlock = dupBlock;
window.deleteBlock = deleteBlock;
window.moveBlockUp = moveBlockUp;
window.moveBlockDown = moveBlockDown;
window.changeBlockType = changeBlockType;
window.focusBlock = focusBlock;
window.fmtCmd = fmtCmd;
window.openColorPicker = openColorPicker;
window.applyColor = applyColor;
window.insertImage = insertImage;
window.submitImage = submitImage;
window.insertVideo = insertVideo;
window.submitVideo = submitVideo;
window.insertPdf = insertPdf;
window.submitPdf = submitPdf;
window.insertFile = insertFile;
window.submitFile = submitFile;
window.openCalloutIconPicker = openCalloutIconPicker;
window.setCalloutIcon = setCalloutIcon;
window.openCodeSetting = openCodeSetting;
window.submitCodeLang = submitCodeLang;
