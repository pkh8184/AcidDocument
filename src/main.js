// src/main.js — Entry point

import state from './data/store.js';
import {$,genId,toast,setTheme,toggleTheme,highlightText} from './utils/helpers.js';
import {initDB,saveDB,loadPages,logClientError} from './data/firestore.js';
import {handleLogin,showLockTimer,resetLoginState,checkServerLockOnInit,skipPwChange,submitPwChange,logout,isSuper,checkFirestoreRole} from './auth/auth.js';
import {auth} from './config/firebase.js';
import {setupListeners} from './editor/listeners.js';
import {renderBlocks} from './editor/renderer.js';
import {
  getPages,getPage,focusBlock,insertBlock,addBlockBelow,deleteBlock,dupBlock,
  moveBlockUp,moveBlockDown,changeBlockType,scrollToBlk,getCurrentIdx,
  dupBlockCurrent,deleteBlockCurrent,addBlockBelowCurrent,
  moveBlockUpCurrent,moveBlockDownCurrent,onTitleChange,initTocNav
} from './editor/blocks.js';
import {
  initTablePanel,closeTablePanel
} from './editor/table.js';
import {
  insertImage,submitImage,insertVideo,submitVideo,insertPdf,submitPdf,
  insertFile,submitFile,insertBookmark,submitBookmark,
  setCalloutIcon,submitCodeLang,
  openImageViewer,closeImageViewer,viewerNav,
  slideNav,slideTo,setSlideAuto,setSlideInterval,
  addSlideImage,submitSlideImage,removeSlideImage,getSlideImages,insertSlide
} from './editor/media.js';
import {changeCalMonth,openCalEventAdd,selectEventColor,addCalEvent,deleteCalRangeEvent} from './editor/calendar.js';
import {updateChartTitle,updateChartData,addChartData,removeChartData} from './editor/chart.js';
import {
  renderBreadcrumb,renderMeta,renderTags,openTagModal,submitTag,quickTag,removeTag,
  openUserTagModal,addUserTag,removeUserTag,
  openRenamePage,submitRenamePage,
  toggleMobile,closeMobile,
  createPage,loadPage,loadPageWithoutPush,saveDoc,toggleEdit,saveAndExit,cancelEdit,
  deleteCurrentPage,deletePage,confirmDelete,restorePage,permanentDelete,emptyTrash,
  duplicatePage,toggleFavorite,movePage,movePageUp,movePageDown,
  renderTree,renderSidebar,
  showPageCtx,hideCtx,
  renderVersions,renderComments,
  showTrash,showRecent,showFavorites,showTemplates
} from './ui/sidebar.js';
import {
  openModal,closeModal,closePanel,closeAllModals,closeAllPanels,
  openSettings,showSettingsTab,saveNickname,createUser,resetPw,togglePwView,
  exportUsers,toggleActive,delUser,changePassword,
  changeUserIdSelf,adminChangeUserId,showChangeIdInput,toggleChangeIdSelf,
  saveWorkspace,
  saveNotice,clearNotice,updateNoticeBar,closeNoticeBar,showNotice,
  openShortcutHelp,openSearch,openIconPicker,selectIcon,
  migrateImages,setImageStorageMode,
  clearIpLog,clearDeleteLog,restoreFromLog,renderUsers,
  loadErrorLogs,clearErrorLogsUI
} from './ui/modals.js';
import {fmtCmd,openColorPicker,applyColor,changeTagColor,removeInlineTag,openEmojiPicker,filterEmoji,insertEmoji,openMentionPicker,insertMention} from './ui/toolbar.js';
import {openVersions,restoreVer,deleteVer} from './features/versions.js';
import {openComments,addComment,editComment,submitEditComment,deleteComment} from './features/comments.js';
import {openExport,exportDoc,exportPdf} from './features/export.js';
import {doSearch} from './features/search.js';
import {openPageLinkPicker,renderPageLinkList,insertPageLink,renderBacklinks} from './features/pagelink.js';
import {undo,redo} from './editor/history.js';
import {logFlow,logFB,logSession,logError} from './auth/loginDebug.js';

// initApp — 로그인 성공 후 앱 초기화
export function initApp(){
  if(state.appInitialized){logFlow('initApp 스킵 — 이미 초기화됨');return}
  // pages가 비어있으면 (initDB에서 인증 전 못 읽은 경우) 먼저 로드
  if(!state.db.pages||state.db.pages.length===0){
    loadPages().then(function(){_doInitApp()}).catch(function(){_doInitApp()});
  }else{
    _doInitApp();
  }
}
function _doInitApp(){
  if(state.appInitialized)return;
  try{
    logFlow('initApp 시작');
    state.appInitialized=true;
    $('loginScreen').classList.add('hidden');
    $('appWrap').style.display='flex';
    $('userName').textContent=state.user.nickname||state.user.id;
    $('userAvatar').textContent=(state.user.nickname||state.user.id).slice(-2).toUpperCase();
    $('userAvatar').className='user-avatar '+(isSuper()?'super':'admin');
    $('userRole').textContent=isSuper()?'최고관리자':'관리자';
    $('wsName').textContent=state.db.settings.wsName;
    setTheme(state.db.settings.theme);
    updateNoticeBar();
    renderTree();
    // 해시 라우팅: URL에서 페이지 ID 읽기
    var hashId=location.hash.slice(1);
    var targetPage=hashId?getPage(hashId):null;
    if(targetPage&&!targetPage.deleted){
      loadPage(targetPage.id);
    }else{
      var pgs=getPages(null);
      if(pgs.length>0)loadPage(pgs[0].id);else createPage()
    }
    // 브라우저 뒤로가기/앞으로가기 지원
    window.addEventListener('popstate',function(){
      var hid=location.hash.slice(1);
      if(hid){var pg=getPage(hid);if(pg&&!pg.deleted)loadPageWithoutPush(hid)}
    });
  }catch(err){
    logError('initApp 실패',{message:err.message,stack:err.stack});
    logClientError('initApp',{message:err.message,code:err.code||''});
    console.error('앱 초기화 실패:',err);
    state.appInitialized=false;
    toast('앱 초기화에 실패했습니다. 새로고침하세요.','err');
  }
}

// init — 앱 시작점 (Firebase Auth onAuthStateChanged 전용)
function init(){
  logSession('init 시작');
  // initDB 시도 — 실패해도 로그인 화면은 표시
  initDB().catch(function(err){
    console.warn('[init] initDB 실패 (인증 세션 없음), 로그인 후 재로드:',err.message);
    logClientError('initDB',{message:err.message,code:err.code||''});
    if(!state.db)state.db={users:[],pages:[],templates:[],settings:{wsName:'AcidDocument',theme:'dark',notice:''},session:null,recent:[]};
  }).then(function(){
    logSession('init — listeners 설정');
    setupListeners();
    // localStorage 캐시 기반 빠른 잠금 체크 (서버 체크는 handleLogin에서 수행)
    if(checkServerLockOnInit())return;

    var sessionHandled=false;
    var authFallbackTimer=null;
    var dbLoaded=!!(state.db&&state.db.users&&state.db.users.length>0);

    // Firebase Auth 사용자 처리 헬퍼
    function handleFirebaseUser(firebaseUser){
      sessionHandled=true;
      logSession('Firebase Auth 세션 복원',{email:firebaseUser.email,uid:firebaseUser.uid,dbLoaded:dbLoaded});

      // DB가 로드되지 않았으면 인증 후 재시도
      var dbReady=dbLoaded?Promise.resolve():initDB().catch(function(e){
        console.error('[init] 인증 후 initDB 재시도 실패:',e.message);
        logClientError('initDB_retry',{message:e.message,code:e.code||''});
        toast('데이터 로드 실패','err');
      });

      dbReady.then(function(){
        var legacyId=firebaseUser.email.replace(/@aciddocument\.local$/,'');

        // 레거시 users 배열에서 사용자 찾기
        var u=null;
        if(state.db&&state.db.users){
          for(var i=0;i<state.db.users.length;i++){
            if(state.db.users[i].id===legacyId&&state.db.users[i].active){u=state.db.users[i];break}
          }
        }

        if(u){
          state.user=u;
        }else{
          // 레거시 배열에 없으면 Firebase Auth 정보로 임시 state.user
          state.user={
            id:legacyId,
            role:'viewer',
            active:true,
            nickname:firebaseUser.displayName||legacyId
          };
        }

        // Firestore에서 역할 확인 (비동기)
        checkFirestoreRole(firebaseUser.uid).then(function(){
          if(state.user.needPw){
            $('loginScreen').classList.add('hidden');
            openModal('pwChangeModal');
          }else{
            initApp();
          }
        });
      });
    }

    // Firebase Auth onAuthStateChanged (세션 관리 유일한 경로)
    auth.onAuthStateChanged(function(firebaseUser){
      logSession('onAuthStateChanged',{user:firebaseUser?firebaseUser.email:'null',sessionHandled:sessionHandled,loggingOut:state.loggingOut,loginInProgress:state.loginInProgress});
      if(sessionHandled)return;
      if(state.loggingOut)return;
      // handleLogin이 진행 중이면 무시 (handleLogin이 직접 initApp 호출)
      if(state.loginInProgress){logSession('loginInProgress — onAuthStateChanged 무시');sessionHandled=true;return;}

      if(firebaseUser){
        // Firebase Auth로 로그인된 사용자
        if(authFallbackTimer){clearTimeout(authFallbackTimer);authFallbackTimer=null;}
        handleFirebaseUser(firebaseUser);
      }else{
        // null 수신 — Auth 상태가 아직 로딩 중일 수 있음 (IndexedDB 비동기)
        // 500ms 대기 후에도 Firebase Auth 세션 없으면 로그인 화면 유지
        logSession('세션 없음 — 500ms 대기 후 로그인 화면 유지');
        if(!authFallbackTimer){
          authFallbackTimer=setTimeout(function(){
            if(sessionHandled)return;
            sessionHandled=true;
            logSession('세션 타임아웃 — 로그인 화면 표시');
            // localStorage 폴백 제거 — Firebase Auth만 세션 관리
            // 기존 localStorage 데이터 정리
            localStorage.removeItem('ad_session');
          },500);
        }
      }
    });
  });
}

// 전역 (HTML onclick 핸들러용)
window.toggleTheme=toggleTheme;
window.handleLogin=handleLogin;
window.resetLoginState=resetLoginState;
window.skipPwChange=skipPwChange;
window.submitPwChange=submitPwChange;
window.logout=logout;
window.toggleMobile=toggleMobile;
window.closeMobile=closeMobile;
window.createPage=createPage;
window.loadPage=loadPage;
window.saveDoc=saveDoc;
window.toggleEdit=toggleEdit;
window.saveAndExit=saveAndExit;
window.cancelEdit=cancelEdit;
window.deleteCurrentPage=deleteCurrentPage;
window.deletePage=deletePage;
window.confirmDelete=confirmDelete;
window.restorePage=restorePage;
window.permanentDelete=permanentDelete;
window.emptyTrash=emptyTrash;
window.duplicatePage=duplicatePage;
window.toggleFavorite=toggleFavorite;
window.movePageUp=movePageUp;
window.movePageDown=movePageDown;
window.openTagModal=openTagModal;
window.submitTag=submitTag;
window.quickTag=quickTag;
window.removeTag=removeTag;
window.onTitleChange=onTitleChange;
window.scrollToBlk=scrollToBlk;
window.dupBlockCurrent=dupBlockCurrent;
window.deleteBlockCurrent=deleteBlockCurrent;
window.addBlockBelowCurrent=addBlockBelowCurrent;
window.moveBlockUpCurrent=moveBlockUpCurrent;
window.moveBlockDownCurrent=moveBlockDownCurrent;
window.getCurrentIdx=getCurrentIdx;
window.genId=genId;
window.insertBlock=insertBlock;
window.closeTablePanel=closeTablePanel;
window.addBlockBelow=addBlockBelow;
window.hideCtx=hideCtx;
window.dupBlock=dupBlock;
window.deleteBlock=deleteBlock;
window.moveBlockUp=moveBlockUp;
window.moveBlockDown=moveBlockDown;
window.changeBlockType=changeBlockType;
window.focusBlock=focusBlock;
window.openVersions=openVersions;
window.openComments=openComments;
window.closePanel=closePanel;
window.openModal=openModal;
window.closeModal=closeModal;
window.openSearch=openSearch;
window.doSearch=doSearch;
window.openSettings=openSettings;
window.showSettingsTab=showSettingsTab;
window.saveNickname=saveNickname;
window.createUser=createUser;
window.resetPw=resetPw;
window.togglePwView=togglePwView;
window.exportUsers=exportUsers;
window.toggleActive=toggleActive;
window.delUser=delUser;
window.changePassword=changePassword;
window.changeUserIdSelf=changeUserIdSelf;
window.adminChangeUserId=adminChangeUserId;
window.showChangeIdInput=showChangeIdInput;
window.toggleChangeIdSelf=toggleChangeIdSelf;
window.saveWorkspace=saveWorkspace;
window.saveNotice=saveNotice;
window.clearNotice=clearNotice;
window.clearIpLog=clearIpLog;
window.clearDeleteLog=clearDeleteLog;
window.restoreFromLog=restoreFromLog;
window.loadErrorLogs=loadErrorLogs;
window.clearErrorLogsUI=clearErrorLogsUI;
window.migrateImages=migrateImages;
window.setImageStorageMode=setImageStorageMode;
window.showNotice=showNotice;
window.closeNoticeBar=closeNoticeBar;
window.showTrash=showTrash;
window.showRecent=showRecent;
window.showFavorites=showFavorites;
window.showTemplates=showTemplates;
window.openIconPicker=openIconPicker;
window.selectIcon=selectIcon;
window.openExport=openExport;
window.exportDoc=exportDoc;
window.exportPdf=exportPdf;
window.insertImage=insertImage;
window.submitImage=submitImage;
window.insertVideo=insertVideo;
window.submitVideo=submitVideo;
window.insertPdf=insertPdf;
window.submitPdf=submitPdf;
window.insertFile=insertFile;
window.submitFile=submitFile;
window.insertBookmark=insertBookmark;
window.submitBookmark=submitBookmark;
window.setCalloutIcon=setCalloutIcon;
window.submitCodeLang=submitCodeLang;
window.addComment=addComment;
window.editComment=editComment;
window.submitEditComment=submitEditComment;
window.deleteComment=deleteComment;
window.restoreVer=restoreVer;
window.deleteVer=deleteVer;
window.fmtCmd=fmtCmd;
window.openColorPicker=openColorPicker;
window.applyColor=applyColor;
window.changeCalMonth=changeCalMonth;
window.openCalEventAdd=openCalEventAdd;
window.selectEventColor=selectEventColor;
window.addCalEvent=addCalEvent;
window.deleteCalRangeEvent=deleteCalRangeEvent;
window.updateChartTitle=updateChartTitle;
window.updateChartData=updateChartData;
window.addChartData=addChartData;
window.removeChartData=removeChartData;
window.changeTagColor=changeTagColor;
window.removeInlineTag=removeInlineTag;
window.openImageViewer=openImageViewer;
window.closeImageViewer=closeImageViewer;
window.viewerNav=viewerNav;
window.slideNav=slideNav;
window.slideTo=slideTo;
window.setSlideAuto=setSlideAuto;
window.setSlideInterval=setSlideInterval;
window.addSlideImage=addSlideImage;
window.submitSlideImage=submitSlideImage;
window.removeSlideImage=removeSlideImage;
window.getSlideImages=getSlideImages;
window.openShortcutHelp=openShortcutHelp;
window.openEmojiPicker=openEmojiPicker;
window.insertEmoji=insertEmoji;
window.filterEmoji=filterEmoji;
window.openMentionPicker=openMentionPicker;
window.insertMention=insertMention;
window.openRenamePage=openRenamePage;
window.submitRenamePage=submitRenamePage;
window.highlightText=highlightText;
window.addUserTag=addUserTag;
window.removeUserTag=removeUserTag;
window.openUserTagModal=openUserTagModal;
window.undo=undo;
window.redo=redo;
window.selectPageLink=function(id,title){closeModal('pageLinkModal');insertPageLink(id,title)};
window.filterPageLinks=function(q){renderPageLinkList(q)};

// 디버그 상태 덤프 (loginDebug.dump()에서 사용)
window.__debugState=function(){return{user:state.user?{id:state.user.id,role:state.user.role}:null,appInitialized:state.appInitialized,loginInProgress:state.loginInProgress,loggingOut:state.loggingOut,editMode:state.editMode,pageId:state.page?state.page.id:null,pagesCount:state.db?state.db.pages.length:0}};

// DOMContentLoaded
function onReady(){initTablePanel();initTocNav();init()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',onReady);else onReady();
