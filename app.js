// Firebase 설정
const firebaseConfig = {
  apiKey: "AIzaSyBqHTIoLGKnCnR8n8jFGS3a4LGhIJe5xQI",
  authDomain: "aciddocument.firebaseapp.com",
  projectId: "aciddocument",
  storageBucket: "aciddocument.firebasestorage.app",
  messagingSenderId: "834603817632",
  appId: "1:834603817632:web:5bd935f6805e05582307c5"
};

// Firebase 초기화
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const firestore = firebase.firestore();
const storage = firebase.storage();

// 전역 변수
let currentUser = null;
let userData = null;
let pages = [];
let page = null;
let settings = { wsName: 'AcidDocument', theme: 'dark', notice: '' };
let recentIds = [];
let editMode = false;
let editBackup = null;
let slashSt = { open: false, idx: null };
let autoT = null;
let isComp = false;
let dragPageId = null;
let deleteTargetId = null;
let currentEditBlockId = null;
let editingCommentId = null;
let isLoginMode = true;

const MAX_VER = 10;
const ICONS = ['📄','📝','📋','📁','📚','📖','📌','💡','⭐','🔥','✨','🚀','🎨','💻','📊','🎯','👋','❤️','🏠','📱','🔧','⚙️','🎁','💎','🌟','📈','🔒','💬','📮','🗂️','📑','🔖','🎵','🎬','📷','🌍','⚡','🔔','✅','❌','⚠️','💰','🎓','🏆','🌈','☀️','🌙'];
const COLORS = ['#f85149','#ff7b72','#ffa657','#d29922','#3fb950','#56d364','#58a6ff','#79b8ff','#a371f7','#bc8cff','#f0f6fc','#8b949e','#6e7681','#30363d'];
const SLASH = [
  {s:'기본',i:[{t:'text',c:'T',n:'텍스트',d:'일반 텍스트'},{t:'h1',c:'H1',n:'제목 1',d:'큰 제목'},{t:'h2',c:'H2',n:'제목 2',d:'중간 제목'},{t:'h3',c:'H3',n:'제목 3',d:'작은 제목'}]},
  {s:'리스트',i:[{t:'bullet',c:'•',n:'글머리 기호',d:'목록'},{t:'number',c:'1.',n:'번호 목록',d:'순서'},{t:'todo',c:'☑',n:'할 일',d:'체크리스트'},{t:'toggle',c:'▶',n:'토글',d:'접기/펼치기'}]},
  {s:'미디어',i:[{t:'image',c:'🖼',n:'이미지',d:'URL/업로드'},{t:'video',c:'🎬',n:'동영상',d:'YouTube'},{t:'pdf',c:'📄',n:'PDF',d:'PDF 뷰어'},{t:'file',c:'📎',n:'파일',d:'파일 링크'}]},
  {s:'테이블/코드',i:[{t:'table',c:'▦',n:'표',d:'테이블'},{t:'code',c:'</>',n:'코드',d:'코드 블록'}]},
  {s:'레이아웃',i:[{t:'col2',c:'▐▌',n:'2열',d:'2컬럼'},{t:'col3',c:'▐▐▌',n:'3열',d:'3컬럼'}]},
  {s:'기타',i:[{t:'quote',c:'"',n:'인용',d:'인용문'},{t:'callout',c:'💡',n:'콜아웃',d:'강조'},{t:'divider',c:'—',n:'구분선',d:'구분'},{t:'toc',c:'📑',n:'목차',d:'자동 목차'}]}
];
const TEMPLATES = [
  {id:'meeting',name:'회의록',icon:'📋',blocks:[
    {type:'h1',content:'📋 회의록'},
    {type:'table',rows:[['항목','내용'],['📅 회의 일시',''],['📍 회의 장소',''],['👥 참여 대상',''],['📌 회의 주제',''],['🎤 발언자','']]},
    {type:'h2',content:'📝 회의 내용'},{type:'text',content:''},
    {type:'h2',content:'✅ 회의 결론'},{type:'bullet',content:''},
    {type:'h2',content:'📌 Action Items'},{type:'todo',content:'',checked:false},
    {type:'h2',content:'📎 비고'},{type:'text',content:''}
  ]},
  {id:'note',name:'노트',icon:'📝',blocks:[{type:'h1',content:''},{type:'text',content:''}]},
  {id:'project',name:'프로젝트',icon:'🚀',blocks:[
    {type:'h1',content:'프로젝트명'},
    {type:'callout',content:'프로젝트 개요',calloutType:'info'},
    {type:'h2',content:'목표'},{type:'bullet',content:''},
    {type:'h2',content:'일정'},
    {type:'table',rows:[['단계','시작일','종료일','담당자'],['기획','','',''],['개발','','',''],['테스트','','','']]}
  ]}
];

// 유틸리티
function $(id) { return document.getElementById(id); }
function $$(s) { return document.querySelectorAll(s); }
function genId() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 8); }
function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
function fmtD(t) { return new Date(t).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' }); }
function fmtDT(t) { return new Date(t).toLocaleString('ko-KR'); }

function toast(m, t) {
  t = t || 'ok';
  const w = $('toastWrap'), e = document.createElement('div');
  e.className = 'toast ' + t;
  const ic = { ok: '✅', err: '❌', warn: '⚠️' };
  e.innerHTML = '<span style="font-size:18px">' + (ic[t] || '💬') + '</span><span style="font-size:14px">' + esc(m) + '</span>';
  w.appendChild(e);
  setTimeout(() => { e.style.opacity = '0'; setTimeout(() => e.remove(), 200); }, 3000);
}

function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  settings.theme = t;
  localStorage.setItem('ad_theme', t);
}

function toggleTheme() {
  setTheme(settings.theme === 'dark' ? 'light' : 'dark');
}

// 로그인 탭 전환
function showLoginTab(tab) {
  isLoginMode = tab === 'login';
  $('tabLogin').classList.toggle('active', isLoginMode);
  $('tabRegister').classList.toggle('active', !isLoginMode);
  $('loginBtn').textContent = isLoginMode ? '로그인' : '회원가입';
}

// Firebase Auth
$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('loginEmail').value.trim();
  const pw = $('loginPw').value;
  
  $('loginError').style.display = 'none';
  $('loginBtn').disabled = true;
  $('loginBtn').textContent = '처리 중...';
  
  try {
    if (isLoginMode) {
      await auth.signInWithEmailAndPassword(email, pw);
    } else {
      await auth.createUserWithEmailAndPassword(email, pw);
      await firestore.collection('users').doc(auth.currentUser.uid).set({
        email: email,
        nickname: '',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      await createWelcomePage();
    }
  } catch (err) {
    let msg = '오류가 발생했습니다.';
    switch (err.code) {
      case 'auth/invalid-email': msg = '잘못된 이메일 형식입니다.'; break;
      case 'auth/user-disabled': msg = '비활성화된 계정입니다.'; break;
      case 'auth/user-not-found': msg = '존재하지 않는 계정입니다.'; break;
      case 'auth/wrong-password': msg = '비밀번호가 틀렸습니다.'; break;
      case 'auth/email-already-in-use': msg = '이미 사용 중인 이메일입니다.'; break;
      case 'auth/weak-password': msg = '비밀번호는 6자 이상이어야 합니다.'; break;
      case 'auth/invalid-credential': msg = '이메일 또는 비밀번호가 틀렸습니다.'; break;
    }
    $('loginError').textContent = msg;
    $('loginError').style.display = 'block';
    $('loginBtn').disabled = false;
    $('loginBtn').textContent = isLoginMode ? '로그인' : '회원가입';
  }
});

async function createWelcomePage() {
  const uid = auth.currentUser.uid;
  const pageData = {
    id: genId(),
    title: '시작하기',
    icon: '👋',
    parentId: null,
    blocks: [
      { id: genId(), type: 'h1', content: 'AcidDocument에 오신 것을 환영합니다!' },
      { id: genId(), type: 'text', content: '실시간 협업 문서 관리 시스템입니다.' },
      { id: genId(), type: 'callout', content: '<b>💡 사용법:</b> 빈 줄에서 <code>/</code>를 입력하여 다양한 블록을 추가하세요.', calloutType: 'info' }
    ],
    tags: ['가이드'],
    author: auth.currentUser.email,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    versions: [],
    comments: [],
    favorite: true,
    deleted: false
  };
  await firestore.collection('users').doc(uid).collection('pages').doc(pageData.id).set(pageData);
}

function logout() {
  auth.signOut();
}

// Auth 상태 감시
auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    await loadUserData();
    $('loadingOverlay').classList.add('hidden');
    $('loginScreen').classList.add('hidden');
    $('appWrap').style.display = 'flex';
    initApp();
  } else {
    currentUser = null;
    userData = null;
    pages = [];
    $('loadingOverlay').classList.add('hidden');
    $('loginScreen').classList.remove('hidden');
    $('appWrap').style.display = 'none';
  }
});

// Firestore 데이터 로드
async function loadUserData() {
  const uid = currentUser.uid;
  
  const userDoc = await firestore.collection('users').doc(uid).get();
  if (userDoc.exists) {
    userData = userDoc.data();
  } else {
    userData = { email: currentUser.email, nickname: '' };
    await firestore.collection('users').doc(uid).set(userData);
  }
  
  const settingsDoc = await firestore.collection('users').doc(uid).collection('settings').doc('main').get();
  if (settingsDoc.exists) {
    settings = { ...settings, ...settingsDoc.data() };
  }
  
  // 로컬 테마 설정 적용
  const savedTheme = localStorage.getItem('ad_theme');
  if (savedTheme) settings.theme = savedTheme;
  
  await loadPages();
}

async function loadPages() {
  const uid = currentUser.uid;
  const snapshot = await firestore.collection('users').doc(uid).collection('pages').get();
  pages = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.createdAt && data.createdAt.toDate) data.createdAt = data.createdAt.toDate().getTime();
    if (data.updatedAt && data.updatedAt.toDate) data.updatedAt = data.updatedAt.toDate().getTime();
    pages.push(data);
  });
}

async function saveSettings() {
  if (!currentUser) return;
  await firestore.collection('users').doc(currentUser.uid).collection('settings').doc('main').set(settings);
}

async function savePage(p) {
  if (!currentUser || !p) return;
  const data = { ...p, updatedAt: Date.now() };
  await firestore.collection('users').doc(currentUser.uid).collection('pages').doc(p.id).set(data);
}

async function deletePermanently(id) {
  if (!currentUser) return;
  await firestore.collection('users').doc(currentUser.uid).collection('pages').doc(id).delete();
  pages = pages.filter(p => p.id !== id);
}

// 파일 업로드 (Firebase Storage)
async function uploadFile(file) {
  const uid = currentUser.uid;
  const fileName = Date.now() + '_' + file.name;
  const ref = storage.ref().child(`users/${uid}/files/${fileName}`);
  await ref.put(file);
  return await ref.getDownloadURL();
}

// 앱 초기화
function initApp() {
  $('userName').textContent = userData.nickname || currentUser.email.split('@')[0];
  $('userAvatar').textContent = (userData.nickname || currentUser.email).slice(0, 2).toUpperCase();
  $('userAvatar').className = 'user-avatar admin';
  $('userRole').textContent = '사용자';
  $('wsName').textContent = settings.wsName;
  setTheme(settings.theme);
  updateNoticeBar();
  renderTree();
  
  const pgs = getPages(null);
  if (pgs.length > 0) {
    loadPage(pgs[0].id);
  } else {
    createPage();
  }
  
  setupListeners();
  setupTrashDrop();
}

// 페이지 관리
function getPages(pid) {
  return pages.filter(p => p.parentId === pid && !p.deleted);
}

function getPage(id) {
  return pages.find(p => p.id === id);
}

function getPath(id) {
  const path = [];
  let p = getPage(id);
  while (p) {
    path.unshift(p);
    p = p.parentId ? getPage(p.parentId) : null;
  }
  return path;
}

async function createPage(pid, tplId) {
  let tpl = null;
  if (tplId) tpl = TEMPLATES.find(t => t.id === tplId);
  
  const blks = tpl ? JSON.parse(JSON.stringify(tpl.blocks)) : [{ id: genId(), type: 'text', content: '' }];
  blks.forEach(b => b.id = genId());
  
  const np = {
    id: genId(),
    title: tpl ? tpl.name : '새 페이지',
    icon: tpl ? tpl.icon : '📄',
    parentId: pid || null,
    blocks: blks,
    tags: [],
    author: currentUser.email,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    versions: [],
    comments: [],
    favorite: false,
    deleted: false
  };
  
  pages.push(np);
  await savePage(np);
  renderTree();
  loadPage(np.id);
  closeModal('templatesModal');
  toast('페이지 생성됨');
  
  setTimeout(() => {
    toggleEdit();
    $('pageTitle').focus();
    $('pageTitle').select();
  }, 100);
}

function loadPage(id) {
  const p = getPage(id);
  if (!p) return;
  
  if (editMode && hasChanges()) {
    if (confirm('작성한 내용을 저장하시겠습니까?')) saveDoc();
  }
  
  editMode = false;
  editBackup = null;
  page = p;
  
  $('pageIcon').textContent = p.icon;
  $('pageTitle').value = p.title;
  $('pageTitle').setAttribute('readonly', 'readonly');
  $('editBtn').style.display = 'inline-flex';
  $('deletePageBtn').style.display = 'inline-flex';
  $('saveBtn').style.display = 'none';
  $('cancelBtn').style.display = 'none';
  
  renderMeta();
  renderTags();
  renderBlocks();
  renderBC();
  renderTree();
  renderVer();
  renderCmt();
  
  recentIds = recentIds.filter(x => x !== id);
  recentIds.unshift(id);
  if (recentIds.length > 30) recentIds.pop();
  
  closeMobile();
  $('editorWrap').scrollTop = 0;
}

function saveCurrent() {
  if (!page) return;
  const p = getPage(page.id);
  if (!p) return;
  p.title = $('pageTitle').value || '제목 없음';
  p.icon = $('pageIcon').textContent;
  p.blocks = collectBlocks();
  p.updatedAt = Date.now();
}

async function saveDoc() {
  if (!page) return;
  const p = getPage(page.id);
  if (!p) return;
  
  p.title = $('pageTitle').value || '제목 없음';
  p.icon = $('pageIcon').textContent;
  p.blocks = collectBlocks();
  p.updatedAt = Date.now();
  
  p.versions.push({
    id: p.versions.length + 1,
    date: Date.now(),
    author: currentUser.email,
    blocks: JSON.parse(JSON.stringify(p.blocks))
  });
  if (p.versions.length > MAX_VER) p.versions.shift();
  
  await savePage(p);
  page = p;
  renderMeta();
  renderTree();
  renderVer();
  toast('저장됨');
}

function toggleEdit() {
  if (!editMode) {
    editMode = true;
    editBackup = {
      title: $('pageTitle').value,
      icon: $('pageIcon').textContent,
      blocks: JSON.parse(JSON.stringify(page.blocks))
    };
    $('editor').classList.remove('view-mode');
    $('editor').classList.add('edit-mode');
    $('pageTitle').removeAttribute('readonly');
    $('editBtn').style.display = 'none';
    $('deletePageBtn').style.display = 'none';
    $('saveBtn').style.display = 'inline-flex';
    $('cancelBtn').style.display = 'inline-flex';
    renderBlocks();
    toast('편집 모드');
  }
}

async function saveAndExit() {
  await saveDoc();
  exitEditMode();
  toast('저장 완료');
}

function cancelEdit() {
  if (!editBackup) return;
  if (hasChanges()) {
    if (confirm('작성한 내용을 저장하시겠습니까?')) {
      saveAndExit();
      return;
    }
  }
  $('pageTitle').value = editBackup.title;
  $('pageIcon').textContent = editBackup.icon;
  page.blocks = editBackup.blocks;
  exitEditMode();
  renderBlocks();
  toast('취소됨');
}

function hasChanges() {
  if (!editBackup || !editMode) return false;
  if ($('pageTitle').value !== editBackup.title) return true;
  if ($('pageIcon').textContent !== editBackup.icon) return true;
  const current = collectBlocks();
  if (current.length !== editBackup.blocks.length) return true;
  for (let i = 0; i < current.length; i++) {
    if (current[i].content !== editBackup.blocks[i].content) return true;
  }
  return false;
}

function exitEditMode() {
  editMode = false;
  editBackup = null;
  $('editor').classList.remove('edit-mode');
  $('editor').classList.add('view-mode');
  $('pageTitle').setAttribute('readonly', 'readonly');
  $('editBtn').style.display = 'inline-flex';
  $('deletePageBtn').style.display = 'inline-flex';
  $('saveBtn').style.display = 'none';
  $('cancelBtn').style.display = 'none';
  renderBlocks();
}

function deleteCurrentPage() {
  if (page) deletePage(page.id);
}

function triggerAS() {
  if (!editMode) return;
  clearTimeout(autoT);
  autoT = setTimeout(saveCurrent, 1500);
}

function onTitleChange() {
  triggerAS();
}

function deletePage(id) {
  deleteTargetId = id;
  const p = getPage(id);
  $('deleteConfirmText').textContent = '"' + p.title + '" 페이지를 삭제하시겠습니까?';
  openModal('deleteConfirmModal');
}

async function confirmDelete() {
  const id = deleteTargetId;
  closeModal('deleteConfirmModal');
  const p = getPage(id);
  if (!p) return;
  p.deleted = true;
  p.deletedAt = Date.now();
  await savePage(p);
  if (page && page.id === id) {
    const pgs = getPages(null);
    pgs.length > 0 ? loadPage(pgs[0].id) : createPage();
  }
  renderTree();
  toast('휴지통으로 이동');
}

async function restorePage(id) {
  const p = getPage(id);
  if (p) {
    p.deleted = false;
    delete p.deletedAt;
    await savePage(p);
    showTrash();
    renderTree();
    toast('복원됨');
  }
}

async function permanentDelete(id) {
  if (!confirm('영구 삭제하시겠습니까?')) return;
  await deletePermanently(id);
  showTrash();
  toast('삭제됨');
}

async function emptyTrash() {
  if (!confirm('휴지통을 비우시겠습니까?')) return;
  const deleted = pages.filter(p => p.deleted);
  for (const p of deleted) {
    await deletePermanently(p.id);
  }
  showTrash();
  toast('휴지통 비움');
}

async function duplicatePage(id) {
  const o = getPage(id);
  if (!o) return;
  const c = JSON.parse(JSON.stringify(o));
  c.id = genId();
  c.title += ' (복사)';
  c.createdAt = c.updatedAt = Date.now();
  c.author = currentUser.email;
  c.versions = [];
  c.comments = [];
  c.blocks.forEach(b => b.id = genId());
  pages.push(c);
  await savePage(c);
  renderTree();
  loadPage(c.id);
  toast('복제됨');
}

async function toggleFavorite(id) {
  const p = getPage(id);
  if (p) {
    p.favorite = !p.favorite;
    await savePage(p);
    renderTree();
    toast(p.favorite ? '즐겨찾기 추가' : '즐겨찾기 해제');
  }
}

async function movePage(id, newParentId) {
  if (id === newParentId) return;
  const p = getPage(id);
  if (!p) return;
  let check = newParentId ? getPage(newParentId) : null;
  while (check) {
    if (check.id === id) return;
    check = check.parentId ? getPage(check.parentId) : null;
  }
  p.parentId = newParentId;
  await savePage(p);
  renderTree();
  toast('이동됨');
}

// 렌더링 함수들
function renderBC() {
  const path = getPath(page.id);
  let html = '<span>' + esc(settings.wsName) + '</span>';
  path.forEach(p => html += ' / <span>' + p.icon + ' ' + esc(p.title) + '</span>');
  $('breadcrumb').innerHTML = html;
}

function renderMeta() {
  const authorName = userData?.nickname || page.author;
  $('pageMeta').innerHTML = '<span>✍️ ' + esc(authorName) + '</span><span>📅 ' + fmtD(page.updatedAt) + '</span><span>v' + (page.versions.length + 1) + '</span>';
}

function renderTags() {
  let html = '';
  page.tags.forEach(t => html += '<span class="tag" onclick="removeTag(\'' + esc(t) + '\')">' + esc(t) + ' ×</span>');
  html += '<span class="tag tag-add" onclick="openTagModal()">+ 태그</span>';
  $('pageTags').innerHTML = html;
}

function openTagModal() {
  $('tagInput').value = '';
  openModal('tagModal');
  setTimeout(() => $('tagInput').focus(), 100);
}

async function submitTag() {
  const t = $('tagInput').value.trim();
  if (!t) { toast('태그를 입력하세요', 'err'); return; }
  if (page.tags.includes(t)) { toast('이미 존재하는 태그', 'err'); return; }
  page.tags.push(t);
  await savePage(page);
  renderTags();
  closeModal('tagModal');
  toast('태그 추가');
}

async function quickTag(t) {
  if (page.tags.includes(t)) { toast('이미 존재하는 태그', 'err'); return; }
  page.tags.push(t);
  await savePage(page);
  renderTags();
  closeModal('tagModal');
  toast('태그 추가');
}

async function removeTag(t) {
  page.tags = page.tags.filter(x => x !== t);
  await savePage(page);
  renderTags();
}

// 트리 렌더링
function renderTree() {
  $('pageTree').innerHTML = '';
  renderTreeLv(null, $('pageTree'));
}

function renderTreeLv(pid, con) {
  const pgs = getPages(pid);
  pgs.forEach(p => {
    const hasCh = getPages(p.id).length > 0;
    const isAct = page && page.id === p.id;
    const item = document.createElement('div');
    item.className = 'tree-item';
    item.innerHTML = `<div class="tree-row${isAct ? ' active' : ''}" data-id="${p.id}" draggable="true"><span class="tree-toggle${hasCh ? '' : ' hide'}">▶</span><span>${p.icon}</span><span class="tree-name">${esc(p.title)}</span><span class="tree-fav${p.favorite ? ' on' : ''}">★</span></div><div class="tree-children closed"></div>`;
    con.appendChild(item);
    
    const row = item.querySelector('.tree-row');
    const tog = item.querySelector('.tree-toggle');
    const ch = item.querySelector('.tree-children');
    
    row.addEventListener('click', e => { if (!e.target.classList.contains('tree-toggle')) loadPage(p.id); });
    row.addEventListener('contextmenu', e => { e.preventDefault(); showPageCtx(e, p.id); });
    row.addEventListener('dragstart', e => { dragPageId = p.id; row.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    row.addEventListener('dragend', () => { dragPageId = null; row.classList.remove('dragging'); });
    row.addEventListener('dragover', e => { e.preventDefault(); if (dragPageId && dragPageId !== p.id) row.classList.add('drag-over'); });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
    row.addEventListener('drop', e => { e.preventDefault(); row.classList.remove('drag-over'); if (dragPageId && dragPageId !== p.id) movePage(dragPageId, p.id); });
    
    if (hasCh) {
      tog.addEventListener('click', e => {
        e.stopPropagation();
        tog.classList.toggle('open');
        ch.classList.toggle('closed');
        if (!ch.classList.contains('closed') && ch.children.length === 0) renderTreeLv(p.id, ch);
      });
    }
  });
}

function setupTrashDrop() {
  const trash = $('trashDrop');
  trash.addEventListener('dragover', e => { e.preventDefault(); if (dragPageId) trash.classList.add('drag-over'); });
  trash.addEventListener('dragleave', () => trash.classList.remove('drag-over'));
  trash.addEventListener('drop', e => { e.preventDefault(); trash.classList.remove('drag-over'); if (dragPageId) { deletePage(dragPageId); dragPageId = null; } });
}

// 공지사항
function updateNoticeBar() {
  if (settings.notice) {
    $('noticeText').textContent = settings.notice;
    $('noticeBar').classList.add('show');
  } else {
    $('noticeBar').classList.remove('show');
  }
}

function closeNoticeBar() {
  $('noticeBar').classList.remove('show');
}

function showNotice() {
  if (settings.notice) {
    $('noticeBody').textContent = settings.notice;
    openModal('noticeModal');
  } else {
    toast('공지사항 없음', 'warn');
  }
}

async function saveNotice() {
  settings.notice = $('noticeContent').value;
  await saveSettings();
  updateNoticeBar();
  toast('공지 저장');
}

async function clearNotice() {
  settings.notice = '';
  $('noticeContent').value = '';
  await saveSettings();
  updateNoticeBar();
  toast('공지 삭제');
}

// 모달/UI
function openModal(id) { $(id).classList.add('open'); }
function closeModal(id) { $(id).classList.remove('open'); }
function closeAllModals() { $$('.modal-bg').forEach(m => m.classList.remove('open')); }
function openVersions() { closeAllPanels(); $('versionPanel').classList.add('open'); }
function openComments() { closeAllPanels(); $('commentPanel').classList.add('open'); }
function closePanel(id) { $(id).classList.remove('open'); }
function closeAllPanels() { $$('.panel').forEach(p => p.classList.remove('open')); }
function toggleMobile() { $('sidebar').classList.toggle('open'); $('mobOverlay').classList.toggle('open'); }
function closeMobile() { $('sidebar').classList.remove('open'); $('mobOverlay').classList.remove('open'); }

// 검색
function openSearch() {
  openModal('searchModal');
  $('searchInput').value = '';
  $('searchInput').focus();
  doSearch('');
}

function doSearch(q) {
  q = q.toLowerCase().trim();
  const res = $('searchResults');
  if (!q) {
    res.innerHTML = '<div style="padding:40px;text-align:center;color:var(--t4)"><div style="font-size:40px;margin-bottom:12px">🔍</div>검색어를 입력하세요</div>';
    return;
  }
  const found = pages.filter(p => {
    if (p.deleted) return false;
    if (p.title.toLowerCase().includes(q)) return true;
    return p.blocks.some(b => (b.content || '').toLowerCase().includes(q));
  });
  if (found.length === 0) {
    res.innerHTML = '<div style="padding:40px;text-align:center;color:var(--t4)"><div style="font-size:40px;margin-bottom:12px">📭</div>결과 없음</div>';
    return;
  }
  let html = '';
  found.forEach(f => {
    html += `<div class="search-item" onclick="loadPage('${f.id}');closeModal('searchModal')"><span style="font-size:22px">${f.icon}</span><div><div style="font-weight:500">${esc(f.title)}</div><div style="font-size:13px;color:var(--t4)">${fmtD(f.updatedAt)}</div></div></div>`;
  });
  res.innerHTML = html;
}

// 설정
function openSettings() {
  openModal('settingsModal');
  $('setUserEmail').value = currentUser.email;
  $('setNickname').value = userData.nickname || '';
  $('setWsName').value = settings.wsName;
  $('noticeContent').value = settings.notice || '';
  showSettingsTab('profile', document.querySelector('.tab-btn.on'));
}

function showSettingsTab(tab, btn) {
  $$('.tab-btn').forEach(b => b.classList.remove('on'));
  $$('.tab-panel').forEach(p => p.classList.remove('on'));
  btn.classList.add('on');
  $('tab' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('on');
}

async function saveNickname() {
  const nick = $('setNickname').value.trim();
  userData.nickname = nick;
  await firestore.collection('users').doc(currentUser.uid).update({ nickname: nick });
  $('userName').textContent = nick || currentUser.email.split('@')[0];
  $('userAvatar').textContent = (nick || currentUser.email).slice(0, 2).toUpperCase();
  renderMeta();
  toast('닉네임 저장');
}

async function changePassword() {
  const newPw = $('setPwNew').value;
  if (!newPw || newPw.length < 6) {
    toast('비밀번호는 6자 이상이어야 합니다', 'err');
    return;
  }
  try {
    await currentUser.updatePassword(newPw);
    $('setPwCur').value = '';
    $('setPwNew').value = '';
    toast('비밀번호 변경됨');
  } catch (err) {
    if (err.code === 'auth/requires-recent-login') {
      toast('재로그인이 필요합니다', 'err');
    } else {
      toast('변경 실패', 'err');
    }
  }
}

async function saveWorkspace() {
  settings.wsName = $('setWsName').value || 'AcidDocument';
  await saveSettings();
  $('wsName').textContent = settings.wsName;
  renderBC();
  toast('저장됨');
}

// 휴지통/최근/즐겨찾기/템플릿
function showTrash() {
  const del = pages.filter(p => p.deleted);
  let html = '';
  if (del.length === 0) {
    html = '<div style="text-align:center;color:var(--t4);padding:30px">휴지통이 비어있습니다</div>';
  } else {
    del.forEach(p => {
      html += `<div class="nav-item" style="justify-content:space-between"><div style="display:flex;align-items:center;gap:10px"><span>${p.icon}</span><span>${esc(p.title)}</span></div><div style="display:flex;gap:6px"><button class="btn btn-sm btn-s" onclick="restorePage('${p.id}')">복원</button><button class="btn btn-sm btn-d" onclick="permanentDelete('${p.id}')">삭제</button></div></div>`;
    });
  }
  $('trashList').innerHTML = html;
  $('trashFoot').style.display = del.length > 0 ? 'flex' : 'none';
  openModal('trashModal');
}

function showRecent() {
  let html = '';
  if (recentIds.length === 0) {
    html = '<div style="text-align:center;color:var(--t4);padding:30px">최근 문서 없음</div>';
  } else {
    recentIds.slice(0, 15).forEach(id => {
      const p = getPage(id);
      if (p && !p.deleted) {
        html += `<div class="nav-item" onclick="loadPage('${p.id}');closeModal('recentModal')"><span class="nav-icon">${p.icon}</span><span class="nav-text">${esc(p.title)}</span></div>`;
      }
    });
  }
  $('recentList').innerHTML = html;
  openModal('recentModal');
}

function showFavorites() {
  const favs = pages.filter(p => p.favorite && !p.deleted);
  let html = '';
  if (favs.length === 0) {
    html = '<div style="text-align:center;color:var(--t4);padding:30px">즐겨찾기 없음</div>';
  } else {
    favs.forEach(p => {
      html += `<div class="nav-item" onclick="loadPage('${p.id}');closeModal('favoritesModal')"><span class="nav-icon">${p.icon}</span><span class="nav-text">${esc(p.title)}</span></div>`;
    });
  }
  $('favoritesList').innerHTML = html;
  openModal('favoritesModal');
}

function showTemplates() {
  let html = '';
  TEMPLATES.forEach(t => {
    html += `<div class="nav-item" onclick="createPage(null,'${t.id}')"><span class="nav-icon">${t.icon}</span><span class="nav-text">${esc(t.name)}</span></div>`;
  });
  html += '<div class="nav-item" onclick="createPage()"><span class="nav-icon">📄</span><span class="nav-text">빈 페이지</span></div>';
  $('templatesList').innerHTML = html;
  openModal('templatesModal');
}

// 아이콘 선택
function openIconPicker() {
  let html = '';
  ICONS.forEach(ic => html += `<div class="icon-item" onclick="selectIcon('${ic}')">${ic}</div>`);
  $('iconGrid').innerHTML = html;
  openModal('iconModal');
}

async function selectIcon(ic) {
  page.icon = ic;
  $('pageIcon').textContent = ic;
  await savePage(page);
  renderTree();
  closeModal('iconModal');
}

// 내보내기
function openExport() { openModal('exportModal'); }

function exportDoc(fmt) {
  const title = page.title;
  let content = '';
  page.blocks.forEach(b => {
    const txt = (b.content || '').replace(/<[^>]*>/g, '');
    if (txt) content += txt + '\n\n';
  });
  
  let blob, fn;
  if (fmt === 'md') {
    blob = new Blob(['# ' + title + '\n\n' + content], { type: 'text/markdown' });
    fn = title + '.md';
  } else if (fmt === 'html') {
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${esc(title)}</title><style>body{font-family:sans-serif;max-width:800px;margin:40px auto;padding:20px;line-height:1.6}</style></head><body><h1>${esc(title)}</h1><div>${$('editor').innerHTML}</div></body></html>`;
    blob = new Blob([html], { type: 'text/html' });
    fn = title + '.html';
  } else if (fmt === 'pdf') {
    exportPdf();
    return;
  } else {
    blob = new Blob([title + '\n\n' + content], { type: 'text/plain' });
    fn = title + '.txt';
  }
  
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fn;
  a.click();
  URL.revokeObjectURL(url);
  closeModal('exportModal');
  toast('내보내기 완료');
}

function exportPdf() {
  const title = page.title;
  const printWin = window.open('', '_blank');
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${esc(title)}</title><style>@media print{@page{margin:20mm}body{font-family:-apple-system,BlinkMacSystemFont,"Pretendard",sans-serif;line-height:1.8;color:#333}h1{font-size:28px;margin-bottom:20px}}</style></head><body><h1>${esc(title)}</h1>${$('editor').innerHTML}<script>window.onload=function(){window.print();window.onafterprint=function(){window.close()}}<\/script></body></html>`;
  printWin.document.write(html);
  printWin.document.close();
  closeModal('exportModal');
  toast('PDF 인쇄 창 열림');
}

// 버전/댓글
function renderVer() {
  const list = page.versions.slice().reverse();
  let html = '';
  if (list.length === 0) {
    $('versionList').innerHTML = '<div style="text-align:center;color:var(--t4);padding:30px">버전 기록 없음</div>';
    return;
  }
  list.forEach((v, i) => {
    const isCur = i === 0;
    html += `<div class="ver-item${isCur ? ' current' : ''}" onclick="${isCur ? '' : 'restoreVer(' + v.id + ')'}"><div><div style="font-weight:500">${fmtDT(v.date)}${isCur ? ' <span class="badge badge-p">현재</span>' : ''}</div><div style="font-size:13px;color:var(--t4)">${esc(v.author)}</div></div>${isCur ? '' : '<button class="btn btn-sm btn-s" onclick="event.stopPropagation();deleteVer(' + v.id + ')">삭제</button>'}</div>`;
  });
  $('versionList').innerHTML = html;
}

async function restoreVer(vid) {
  const v = page.versions.find(v => v.id === vid);
  if (!v || !v.blocks || !confirm('이 버전으로 복원?')) return;
  page.blocks = JSON.parse(JSON.stringify(v.blocks));
  renderBlocks();
  await saveDoc();
  closePanel('versionPanel');
  toast('복원됨');
}

async function deleteVer(vid) {
  if (!confirm('버전 삭제?')) return;
  page.versions = page.versions.filter(v => v.id !== vid);
  await savePage(page);
  renderVer();
  toast('삭제됨');
}

function renderCmt() {
  const list = page.comments;
  let html = '';
  if (list.length === 0) {
    $('commentList').innerHTML = '<div style="text-align:center;color:var(--t4);padding:30px">댓글 없음</div>';
    return;
  }
  list.forEach(c => {
    html += `<div class="cmt-item"><div class="cmt-head"><div class="cmt-avatar">${c.author.slice(-2).toUpperCase()}</div><div style="flex:1"><div style="font-weight:500;font-size:14px">${esc(c.author)}</div><div style="font-size:12px;color:var(--t4)">${fmtDT(c.date)}</div></div><div style="display:flex;gap:4px"><button class="btn btn-sm btn-g" onclick="editComment('${c.id}')">✏️</button><button class="btn btn-sm btn-g" style="color:var(--err)" onclick="deleteComment('${c.id}')">🗑️</button></div></div><div style="font-size:14px;color:var(--t2);margin-top:8px">${esc(c.text)}</div></div>`;
  });
  $('commentList').innerHTML = html;
}

async function addComment() {
  const txt = $('commentInput').value.trim();
  if (!txt) { toast('댓글 입력', 'err'); return; }
  page.comments.push({ id: genId(), author: userData.nickname || currentUser.email, date: Date.now(), text: txt });
  await savePage(page);
  $('commentInput').value = '';
  renderCmt();
  toast('댓글 작성');
}

function editComment(id) {
  const c = page.comments.find(c => c.id === id);
  if (c) {
    editingCommentId = id;
    $('editCommentInput').value = c.text;
    openModal('editCommentModal');
  }
}

async function submitEditComment() {
  if (!editingCommentId) return;
  const txt = $('editCommentInput').value.trim();
  if (!txt) { toast('내용을 입력하세요', 'err'); return; }
  const c = page.comments.find(c => c.id === editingCommentId);
  if (c) {
    c.text = txt;
    c.date = Date.now();
  }
  await savePage(page);
  renderCmt();
  closeModal('editCommentModal');
  editingCommentId = null;
  toast('댓글 수정됨');
}

async function deleteComment(id) {
  if (!confirm('댓글을 삭제하시겠습니까?')) return;
  page.comments = page.comments.filter(c => c.id !== id);
  await savePage(page);
  renderCmt();
  toast('댓글 삭제됨');
}

// 페이지 컨텍스트 메뉴
function showPageCtx(e, id) {
  const m = $('ctxMenu');
  m.innerHTML = `
    <div class="ctx-item" onclick="loadPage('${id}');hideCtx()"><span class="ctx-icon">📄</span>열기</div>
    <div class="ctx-item" onclick="createPage('${id}');hideCtx()"><span class="ctx-icon">➕</span>하위 페이지</div>
    <div class="ctx-divider"></div>
    <div class="ctx-item" onclick="toggleFavorite('${id}');hideCtx()"><span class="ctx-icon">⭐</span>즐겨찾기</div>
    <div class="ctx-item" onclick="duplicatePage('${id}');hideCtx()"><span class="ctx-icon">📋</span>복제</div>
    <div class="ctx-divider"></div>
    <div class="ctx-item danger" onclick="deletePage('${id}');hideCtx()"><span class="ctx-icon">🗑️</span>삭제</div>
  `;
  showCtxAt(e.pageX, e.pageY);
}

function showCtxAt(x, y) {
  const m = $('ctxMenu');
  m.style.left = Math.min(x, window.innerWidth - 180) + 'px';
  m.style.top = Math.min(y, window.innerHeight - 200) + 'px';
  m.classList.add('open');
}

function hideCtx() { $('ctxMenu').classList.remove('open'); }

// 전역 함수 노출
window.toggleTheme = toggleTheme;
window.showLoginTab = showLoginTab;
window.logout = logout;
window.toggleMobile = toggleMobile;
window.closeMobile = closeMobile;
window.createPage = createPage;
window.loadPage = loadPage;
window.saveDoc = saveDoc;
window.toggleEdit = toggleEdit;
window.saveAndExit = saveAndExit;
window.cancelEdit = cancelEdit;
window.deleteCurrentPage = deleteCurrentPage;
window.deletePage = deletePage;
window.confirmDelete = confirmDelete;
window.restorePage = restorePage;
window.permanentDelete = permanentDelete;
window.emptyTrash = emptyTrash;
window.duplicatePage = duplicatePage;
window.toggleFavorite = toggleFavorite;
window.openTagModal = openTagModal;
window.submitTag = submitTag;
window.quickTag = quickTag;
window.removeTag = removeTag;
window.onTitleChange = onTitleChange;
window.openVersions = openVersions;
window.openComments = openComments;
window.closePanel = closePanel;
window.openModal = openModal;
window.closeModal = closeModal;
window.openSearch = openSearch;
window.doSearch = doSearch;
window.openSettings = openSettings;
window.showSettingsTab = showSettingsTab;
window.saveNickname = saveNickname;
window.changePassword = changePassword;
window.saveWorkspace = saveWorkspace;
window.saveNotice = saveNotice;
window.clearNotice = clearNotice;
window.showNotice = showNotice;
window.closeNoticeBar = closeNoticeBar;
window.showTrash = showTrash;
window.showRecent = showRecent;
window.showFavorites = showFavorites;
window.showTemplates = showTemplates;
window.openIconPicker = openIconPicker;
window.selectIcon = selectIcon;
window.openExport = openExport;
window.exportDoc = exportDoc;
window.exportPdf = exportPdf;
window.addComment = addComment;
window.editComment = editComment;
window.submitEditComment = submitEditComment;
window.deleteComment = deleteComment;
window.restoreVer = restoreVer;
window.deleteVer = deleteVer;
window.hideCtx = hideCtx;
