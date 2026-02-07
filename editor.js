// 블록 렌더링
function renderBlocks() {
  const ed = $('editor');
  ed.innerHTML = '';
  ed.className = 'editor ' + (editMode ? 'edit-mode' : 'view-mode');
  page.blocks.forEach((b, i) => ed.appendChild(createBlockEl(b, i)));
  updateNums();
}

function createBlockEl(b, idx) {
  const div = document.createElement('div');
  div.className = 'block block-' + b.type;
  div.setAttribute('data-id', b.id);
  div.setAttribute('data-idx', idx);
  const ce = editMode ? ' contenteditable="true"' : '';
  let inner = '';
  
  switch (b.type) {
    case 'divider':
      inner = '<hr>';
      if (editMode) inner += '<div class="block-add-below" onclick="addBlockBelow(' + idx + ')">+ 블록 추가</div>';
      break;
    case 'todo':
      if (b.checked) div.classList.add('done');
      inner = '<label class="todo-wrap"><input type="checkbox"' + (b.checked ? ' checked' : '') + (editMode ? '' : ' onclick="return false"') + '><div class="block-content"' + ce + '>' + (b.content || '') + '</div></label>';
      break;
    case 'toggle':
      inner = '<div class="block-toggle-wrap"><div class="block-toggle-head' + (b.open ? ' open' : '') + '"><span class="block-toggle-arrow" data-id="' + b.id + '">▶</span><div class="block-content"' + ce + '>' + (b.content || '') + '</div></div><div class="block-toggle-body' + (b.open ? ' open' : '') + '"><div class="block-content"' + ce + '>' + (b.innerContent || '') + '</div></div></div>';
      break;
    case 'callout':
      var ct = b.calloutType || 'info';
      var cIcon = b.icon || { info: '💡', success: '✅', warning: '⚠️', danger: '❌' }[ct];
      inner = '<div class="block-callout-wrap ' + ct + '"><div class="block-callout-icon"' + (editMode ? ' onclick="openCalloutIconPicker(\'' + b.id + '\')" style="cursor:pointer"' : '') + '>' + cIcon + '</div><div style="flex:1"><div class="block-content"' + ce + '>' + (b.content || '') + '</div></div></div>';
      break;
    case 'code':
      inner = '<div class="block-code-wrap"><div class="block-code-head"><span class="block-code-lang"' + (editMode ? ' onclick="openCodeSetting(\'' + b.id + '\')" style="cursor:pointer"' : '') + '>' + esc(b.lang || 'code') + '</span><button class="btn btn-sm btn-s" onclick="copyCode(this)">복사</button></div><div class="block-content"' + ce + ' style="font-family:monospace;white-space:pre-wrap">' + (b.content || '') + '</div></div>';
      break;
    case 'image':
      inner = '<img src="' + esc(b.src || '') + '" style="max-width:100%;border-radius:var(--rad)" onerror="this.style.display=\'none\'">';
      inner += '<div class="block-image-caption"' + ce + ' style="text-align:center;color:var(--t4);font-size:13px;margin-top:8px">' + (b.caption || '') + '</div>';
      if (editMode) inner += '<div class="block-add-below" onclick="addBlockBelow(' + idx + ')">+ 블록 추가</div>';
      break;
    case 'video':
      if (b.isFile) {
        inner = '<video controls style="width:100%;max-height:500px;border-radius:var(--rad)"><source src="' + esc(b.url) + '"></video>';
      } else {
        var vid = getYTId(b.url);
        inner = vid ? '<iframe src="https://www.youtube.com/embed/' + vid + '" style="width:100%;height:400px;border:none;border-radius:var(--rad)" allowfullscreen></iframe>' : '<div style="color:var(--err);padding:16px">유효하지 않은 URL</div>';
      }
      if (editMode) inner += '<div class="block-add-below" onclick="addBlockBelow(' + idx + ')">+ 블록 추가</div>';
      break;
    case 'pdf':
      inner = '<iframe src="' + esc(b.src || '') + '#toolbar=1" style="width:100%;height:500px;border:1px solid var(--bdr);border-radius:var(--rad)"></iframe>';
      if (editMode) inner += '<div class="block-add-below" onclick="addBlockBelow(' + idx + ')">+ 블록 추가</div>';
      break;
    case 'file':
      inner = '<div class="block-file"><span>📎</span><a href="' + esc(b.url || '') + '" target="_blank">' + esc(b.name || '파일') + '</a></div>';
      if (editMode) inner += '<div class="block-add-below" onclick="addBlockBelow(' + idx + ')">+ 블록 추가</div>';
      break;
    case 'table':
      var rows = b.rows || [['', '', ''], ['', '', '']];
      var tAlign = b.align || 'left';
      inner = '<div class="block-table-wrap"><table style="width:100%;border-collapse:collapse;text-align:' + tAlign + '">';
      for (var r = 0; r < rows.length; r++) {
        inner += '<tr>';
        for (var c = 0; c < rows[r].length; c++) {
          var cs = 'padding:10px;border:1px solid var(--bdr);';
          inner += (r === 0 ? '<th' : '<td') + ce + ' style="' + cs + '">' + (rows[r][c] || '') + (r === 0 ? '</th>' : '</td>');
        }
        inner += '</tr>';
      }
      inner += '</table></div>';
      if (editMode) {
        inner += '<div class="block-table-tools" style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">';
        inner += '<button class="btn btn-sm btn-s" onclick="addTblRow(\'' + b.id + '\')">+행</button>';
        inner += '<button class="btn btn-sm btn-s" onclick="addTblCol(\'' + b.id + '\')">+열</button>';
        inner += '<button class="btn btn-sm btn-s" onclick="delTblRow(\'' + b.id + '\')">-행</button>';
        inner += '<button class="btn btn-sm btn-s" onclick="delTblCol(\'' + b.id + '\')">-열</button>';
        inner += '<select class="btn btn-sm btn-s" onchange="setTblAlign(\'' + b.id + '\',this.value)"><option value="">정렬</option><option value="left">왼쪽</option><option value="center">가운데</option><option value="right">오른쪽</option></select>';
        inner += '<button class="btn btn-sm" style="color:var(--err)" onclick="deleteTable(\'' + b.id + '\')">삭제</button>';
        inner += '</div>';
        inner += '<div class="block-add-below" onclick="addBlockBelow(' + idx + ')">+ 블록 추가</div>';
      }
      break;
    case 'toc':
      inner = '<div class="block-toc-wrap">' + genTOC() + '</div>';
      if (editMode) inner += '<div class="block-add-below" onclick="addBlockBelow(' + idx + ')">+ 블록 추가</div>';
      break;
    case 'columns':
      var cols = b.columns || ['', ''];
      inner = '<div class="block-columns-wrap" style="display:flex;gap:16px">';
      for (var ci = 0; ci < cols.length; ci++) {
        inner += '<div class="block-col" style="flex:1;min-width:0"><div class="block-col-content"' + ce + ' style="min-height:60px;padding:12px;border:1px dashed var(--bdr);border-radius:var(--rad)">' + (cols[ci] || '') + '</div></div>';
      }
      inner += '</div>';
      if (editMode) inner += '<div class="block-add-below" onclick="addBlockBelow(' + idx + ')">+ 블록 추가</div>';
      break;
    case 'quote':
    case 'bullet':
      inner = '<div class="block-content"' + ce + '>' + (b.content || '') + '</div>';
      break;
    case 'number':
      div.setAttribute('data-num', b.num || 1);
      inner = '<div class="block-content"' + ce + '>' + (b.content || '') + '</div>';
      break;
    default:
      inner = '<div class="block-content"' + ce + '>' + (b.content || '') + '</div>';
  }
  
  div.innerHTML = '<div class="block-handle"><button class="btn btn-i" onclick="showBlockCtx(event,' + idx + ')">⋮</button></div>' + inner;
  setupBlockEv(div, b, idx);
  return div;
}

function setupBlockEv(div, b, idx) {
  var cons = div.querySelectorAll('.block-content');
  for (var i = 0; i < cons.length; i++) {
    (function(el) {
      el.addEventListener('dblclick', function() {
        if (!editMode) { toggleEdit(); setTimeout(function() { focusBlock(idx); }, 50); }
      });
      el.addEventListener('input', triggerAS);
      el.addEventListener('keydown', function(e) { handleKey(e, b, idx, el); });
      el.addEventListener('paste', handlePaste);
      el.addEventListener('compositionstart', function() { isComp = true; });
      el.addEventListener('compositionend', function() { isComp = false; });
      el.addEventListener('mouseup', showFmtBar);
      el.addEventListener('click', function() {
        if (editMode && el.getAttribute('contenteditable') === 'true') el.focus();
      });
    })(cons[i]);
  }
  
  // 테이블 셀
  var cells = div.querySelectorAll('th,td');
  for (var j = 0; j < cells.length; j++) {
    (function(cell) {
      cell.addEventListener('input', triggerAS);
      cell.addEventListener('paste', handlePaste);
      cell.addEventListener('click', function() { if (editMode) cell.focus(); });
      cell.addEventListener('dblclick', function() { if (!editMode) { toggleEdit(); setTimeout(function() { cell.focus(); }, 50); } });
    })(cells[j]);
  }
  
  // 컬럼 콘텐츠
  var colCons = div.querySelectorAll('.block-col-content');
  for (var k = 0; k < colCons.length; k++) {
    (function(el) {
      el.addEventListener('dblclick', function() { if (!editMode) { toggleEdit(); setTimeout(function() { el.focus(); }, 50); } });
      el.addEventListener('input', triggerAS);
      el.addEventListener('paste', handlePaste);
      el.addEventListener('mouseup', showFmtBar);
      el.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          var wrap = el.closest('.block');
          if (wrap) {
            var nidx = parseInt(wrap.getAttribute('data-idx')) + 1;
            insertBlock(nidx, { id: genId(), type: 'text', content: '' });
          }
        }
      });
    })(colCons[k]);
  }
  
  // 이미지 캡션
  var caption = div.querySelector('.block-image-caption');
  if (caption) {
    caption.addEventListener('input', triggerAS);
    caption.addEventListener('paste', handlePaste);
    caption.addEventListener('dblclick', function() { if (!editMode) { toggleEdit(); setTimeout(function() { caption.focus(); }, 50); } });
  }
  
  // 할일 체크박스
  if (b.type === 'todo') {
    var cb = div.querySelector('input[type="checkbox"]');
    if (cb) {
      cb.addEventListener('change', function() {
        if (!editMode) return;
        b.checked = cb.checked;
        div.classList.toggle('done', b.checked);
        triggerAS();
      });
      cb.addEventListener('click', function(e) {
        if (!editMode) { e.preventDefault(); toggleEdit(); }
      });
    }
  }
  
  // 토글
  if (b.type === 'toggle') {
    var arrow = div.querySelector('.block-toggle-arrow');
    var head = div.querySelector('.block-toggle-head');
    var body = div.querySelector('.block-toggle-body');
    if (arrow) {
      arrow.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        b.open = !b.open;
        head.classList.toggle('open', b.open);
        body.classList.toggle('open', b.open);
        for (var pi = 0; pi < page.blocks.length; pi++) {
          if (page.blocks[pi].id === b.id) { page.blocks[pi].open = b.open; break; }
        }
      });
    }
  }
}

function handleKey(e, b, idx, el) {
  if (isComp) return;
  var menu = $('slashMenu'), menuOpen = menu.classList.contains('open');
  
  if (menuOpen) {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveSlashSel(1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); moveSlashSel(-1); return; }
    if (e.key === 'Enter') { e.preventDefault(); var sel = menu.querySelector('.slash-item.sel'); if (sel) execSlash(sel.getAttribute('data-type')); return; }
    if (e.key === 'Escape') { e.preventDefault(); hideSlash(); return; }
    if (e.key === 'Backspace') { setTimeout(function() { var txt = el.textContent; if (!txt.startsWith('/')) hideSlash(); else filterSlash(txt.slice(1)); }, 0); return; }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) { setTimeout(function() { var txt = el.textContent; if (txt.startsWith('/')) filterSlash(txt.slice(1)); }, 0); return; }
  }
  
  // Enter - 새 블록 생성
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    page.blocks[idx].content = el.innerHTML;
    var newType = 'text';
    if ((b.type === 'bullet' || b.type === 'number' || b.type === 'todo') && el.textContent.trim() !== '') {
      newType = b.type;
    }
    var newB = { id: genId(), type: newType, content: '' };
    if (newType === 'todo') newB.checked = false;
    insertBlock(idx + 1, newB);
    updateNums();
    return;
  }
  
  // Backspace - 빈 블록 처리
  if (e.key === 'Backspace') {
    var sel = window.getSelection();
    var atStart = sel.anchorOffset === 0 && sel.isCollapsed;
    
    if (el.textContent === '' || el.innerHTML === '<br>') {
      e.preventDefault();
      if (b.type === 'bullet' || b.type === 'number' || b.type === 'todo') {
        page.blocks[idx].type = 'text';
        renderBlocks();
        focusBlock(idx);
      } else if (page.blocks.length > 1) {
        deleteBlock(idx);
      }
      return;
    }
    
    if (atStart && idx > 0) {
      e.preventDefault();
      var prevB = page.blocks[idx - 1];
      if (['text', 'h1', 'h2', 'h3', 'bullet', 'number', 'quote'].indexOf(prevB.type) !== -1) {
        var prevLen = (prevB.content || '').replace(/<[^>]*>/g, '').length;
        prevB.content = (prevB.content || '') + el.innerHTML;
        page.blocks.splice(idx, 1);
        renderBlocks();
        focusBlock(idx - 1, prevLen);
      }
      return;
    }
  }
  
  // Delete - 다음 블록과 병합
  if (e.key === 'Delete') {
    var sel = window.getSelection();
    var atEnd = sel.anchorOffset === el.textContent.length && sel.isCollapsed;
    if (atEnd && idx < page.blocks.length - 1) {
      e.preventDefault();
      var nextB = page.blocks[idx + 1];
      if (['text', 'h1', 'h2', 'h3', 'bullet', 'number', 'quote'].indexOf(nextB.type) !== -1) {
        b.content = el.innerHTML + (nextB.content || '');
        page.blocks.splice(idx + 1, 1);
        renderBlocks();
        focusBlock(idx, el.textContent.length);
      }
      return;
    }
  }
  
  // 방향키로 블록 이동
  if (e.key === 'ArrowUp' && !e.shiftKey) {
    var sel = window.getSelection();
    if (sel.anchorOffset === 0 && idx > 0) {
      e.preventDefault();
      focusBlock(idx - 1, -1);
      return;
    }
  }
  if (e.key === 'ArrowDown' && !e.shiftKey) {
    var sel = window.getSelection();
    if (sel.anchorOffset === el.textContent.length && idx < page.blocks.length - 1) {
      e.preventDefault();
      focusBlock(idx + 1, 0);
      return;
    }
  }
  
  // 슬래시 메뉴
  if (e.key === '/' && el.textContent === '') {
    slashSt = { open: true, idx: idx };
    showSlash(el);
    return;
  }
  
  // 서식 단축키
  if ((e.metaKey || e.ctrlKey) && !e.shiftKey) {
    if (e.key === 'b') { e.preventDefault(); document.execCommand('bold'); return; }
    if (e.key === 'i') { e.preventDefault(); document.execCommand('italic'); return; }
    if (e.key === 'u') { e.preventDefault(); document.execCommand('underline'); return; }
  }
}

function handlePaste(e) {
  e.preventDefault();
  var txt = e.clipboardData.getData('text/plain');
  document.execCommand('insertText', false, txt);
  triggerAS();
}

// 블록 조작
function focusBlock(idx, cursorPos) {
  setTimeout(function() {
    var el = $('editor').children[idx];
    if (!el) return;
    var c = el.querySelector('.block-content');
    if (!c) c = el.querySelector('.block-col-content') || el.querySelector('th') || el.querySelector('td');
    if (!c) return;
    c.focus();
    if (typeof cursorPos === 'number') {
      try {
        var rng = document.createRange();
        var sel = window.getSelection();
        if (cursorPos === -1 || cursorPos >= c.textContent.length) {
          rng.selectNodeContents(c);
          rng.collapse(false);
        } else if (cursorPos === 0) {
          rng.selectNodeContents(c);
          rng.collapse(true);
        } else {
          var node = c.firstChild || c;
          if (node.nodeType === 3) {
            rng.setStart(node, Math.min(cursorPos, node.length));
            rng.collapse(true);
          } else {
            rng.selectNodeContents(c);
            rng.collapse(true);
          }
        }
        sel.removeAllRanges();
        sel.addRange(rng);
      } catch (ex) {}
    }
  }, 30);
}

function insertBlock(idx, b) {
  page.blocks.splice(idx, 0, b);
  renderBlocks();
  focusBlock(idx, 0);
}

function addBlockBelow(idx) {
  insertBlock(idx + 1, { id: genId(), type: 'text', content: '' });
}

function deleteBlock(idx) {
  if (page.blocks.length <= 1) {
    page.blocks[0] = { id: genId(), type: 'text', content: '' };
    renderBlocks();
    focusBlock(0, 0);
    return;
  }
  page.blocks.splice(idx, 1);
  renderBlocks();
  var newIdx = Math.min(idx, page.blocks.length - 1);
  focusBlock(newIdx, -1);
}

function dupBlock(idx) {
  var orig = page.blocks[idx];
  var copy = JSON.parse(JSON.stringify(orig));
  copy.id = genId();
  page.blocks.splice(idx + 1, 0, copy);
  renderBlocks();
  focusBlock(idx + 1, 0);
  toast('블록 복제됨');
}

function moveBlockUp(idx) {
  if (idx <= 0) return;
  var temp = page.blocks[idx];
  page.blocks[idx] = page.blocks[idx - 1];
  page.blocks[idx - 1] = temp;
  renderBlocks();
  focusBlock(idx - 1);
}

function moveBlockDown(idx) {
  if (idx >= page.blocks.length - 1) return;
  var temp = page.blocks[idx];
  page.blocks[idx] = page.blocks[idx + 1];
  page.blocks[idx + 1] = temp;
  renderBlocks();
  focusBlock(idx + 1);
}

function changeBlockType(idx, newType) {
  var b = page.blocks[idx];
  var oldContent = b.content || '';
  b.type = newType;
  b.content = oldContent;
  if (newType === 'todo') b.checked = false;
  if (newType === 'toggle') { b.open = false; b.innerContent = ''; }
  renderBlocks();
  updateNums();
  focusBlock(idx, -1);
}

function collectBlocks() {
  var blks = [], chs = $('editor').children;
  for (var i = 0; i < chs.length; i++) {
    var el = chs[i], id = el.getAttribute('data-id'), orig = null;
    for (var j = 0; j < page.blocks.length; j++) { if (page.blocks[j].id === id) { orig = page.blocks[j]; break; } }
    if (!orig) continue;
    var b = JSON.parse(JSON.stringify(orig));
    var con = el.querySelector('.block-content');
    if (con) b.content = con.innerHTML;
    if (b.type === 'todo') {
      var cb = el.querySelector('input[type="checkbox"]');
      b.checked = cb ? cb.checked : false;
    }
    if (b.type === 'toggle') {
      var inn = el.querySelector('.block-toggle-body .block-content');
      if (inn) b.innerContent = inn.innerHTML;
      var hd = el.querySelector('.block-toggle-head');
      b.open = hd ? hd.classList.contains('open') : false;
    }
    if (b.type === 'image') {
      var cap = el.querySelector('.block-image-caption');
      if (cap) b.caption = cap.innerHTML;
    }
    if (b.type === 'table') {
      var rows = [], trs = el.querySelectorAll('tr');
      for (var ri = 0; ri < trs.length; ri++) {
        var cls = [], tds = trs[ri].querySelectorAll('th,td');
        for (var ci = 0; ci < tds.length; ci++) cls.push(tds[ci].innerHTML);
        rows.push(cls);
      }
      b.rows = rows;
    }
    if (b.type === 'columns') {
      var cols = [], ces = el.querySelectorAll('.block-col-content');
      for (var coi = 0; coi < ces.length; coi++) cols.push(ces[coi].innerHTML);
      b.columns = cols;
    }
    blks.push(b);
  }
  return blks;
}

function updateNums() {
  var n = 0, chs = $('editor').children;
  for (var i = 0; i < chs.length; i++) {
    if (chs[i].classList.contains('block-number')) { n++; chs[i].setAttribute('data-num', n); }
    else if (!chs[i].classList.contains('block-bullet')) n = 0;
  }
}

function genTOC() {
  var hs = [];
  for (var i = 0; i < page.blocks.length; i++) {
    var b = page.blocks[i];
    if (b.type === 'h1' || b.type === 'h2' || b.type === 'h3') hs.push(b);
  }
  if (hs.length === 0) return '<div class="block-toc-title">📑 목차</div><p style="color:var(--t4)">제목이 없습니다</p>';
  var html = '<div class="block-toc-title">📑 목차</div><ul class="block-toc-list">';
  for (var j = 0; j < hs.length; j++) {
    var h = hs[j], txt = (h.content || '').replace(/<[^>]*>/g, ''), lv = h.type === 'h1' ? 1 : h.type === 'h2' ? 2 : 3;
    html += '<li class="block-toc-item l' + lv + '"><a href="#" onclick="scrollToBlk(\'' + h.id + '\');return false">' + esc(txt) + '</a></li>';
  }
  html += '</ul>';
  return html;
}

function scrollToBlk(id) {
  var el = document.querySelector('[data-id="' + id + '"]');
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.style.background = 'var(--accM)';
    setTimeout(function() { el.style.background = ''; }, 2000);
  }
}

function getYTId(url) {
  if (!url) return null;
  var m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}
