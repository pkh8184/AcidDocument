// src/main.js — Entry point

import state from './data/store.js';
import {$,genId,toast,setTheme,toggleTheme,getLoginState,highlightText} from './utils/helpers.js';
import {initDB,saveDB} from './data/firestore.js';
import {handleLogin,showLockTimer,resetLoginState,skipPwChange,submitPwChange,logout,isSuper} from './auth/auth.js';
import {setupListeners} from './editor/listeners.js';
import {renderBlocks} from './editor/renderer.js';
import {
  getPages,getPage,focusBlock,insertBlock,addBlockBelow,deleteBlock,dupBlock,
  moveBlockUp,moveBlockDown,changeBlockType,scrollToBlk,getCurrentIdx,
  dupBlockCurrent,deleteBlockCurrent,addBlockBelowCurrent,
  moveBlockUpCurrent,moveBlockDownCurrent,onTitleChange,copyCode,downloadCode
} from './editor/blocks.js';
import {
  addTblRow,addTblCol,delTblRow,delTblCol,setTblColor,setTblAlign,
  deleteTable,openColWidthModal,applyColWidths
} from './editor/table.js';
import {
  insertImage,submitImage,insertVideo,submitVideo,insertPdf,submitPdf,
  insertFile,submitFile,insertBookmark,submitBookmark,
  openCalloutIconPicker,setCalloutIcon,openCodeSetting,submitCodeLang,
  openImageViewer,closeImageViewer,viewerNav,copyImageUrl,setImageScale,
  downloadImage,downloadFile,slideNav,slideTo,setSlideAuto,setSlideInterval,
  addSlideImage,submitSlideImage,removeSlideImage,getSlideImages,insertSlide
} from './editor/media.js';
import {changeCalMonth,openCalEventAdd,selectEventColor,addCalEvent,deleteCalRangeEvent} from './editor/calendar.js';
import {updateChartTitle,updateChartData,addChartData,removeChartData} from './editor/chart.js';
import {
  renderBC,renderMeta,renderTags,openTagModal,submitTag,quickTag,removeTag,
  openUserTagModal,addUserTag,removeUserTag,
  openRenamePage,submitRenamePage,
  toggleMobile,closeMobile,
  createPage,loadPage,loadPageWithoutPush,saveDoc,toggleEdit,saveAndExit,cancelEdit,
  deleteCurrentPage,deletePage,confirmDelete,restorePage,permanentDelete,emptyTrash,
  duplicatePage,toggleFavorite,movePage,
  renderTree,renderSidebar,
  showPageCtx,showBlockCtx,hideCtx,
  renderVer,renderCmt,
  showTrash,showRecent,showFavorites,showTemplates
} from './ui/sidebar.js';
import {
  openModal,closeModal,closePanel,closeAllModals,closeAllPanels,
  openSettings,showSettingsTab,saveNickname,createUser,resetPw,togglePwView,
  exportUsers,toggleActive,delUser,changePassword,saveWorkspace,
  saveNotice,clearNotice,updateNoticeBar,closeNoticeBar,showNotice,
  openShortcutHelp,openSearch,openIconPicker,selectIcon,
  migrateImages,setImageStorageMode,
  clearIpLog,clearDeleteLog,restoreFromLog,renderUsers
} from './ui/modals.js';
import {fmtCmd,openColorPicker,applyColor,changeTagColor,removeInlineTag,openEmojiPicker,filterEmoji,insertEmoji,openMentionPicker,insertMention} from './ui/toolbar.js';
import {openVersions,restoreVer,deleteVer} from './features/versions.js';
import {openComments,addComment,editComment,submitEditComment,deleteComment} from './features/comments.js';
import {openExport,exportDoc,exportPdf} from './features/export.js';
import {doSearch} from './features/search.js';

// initApp — 로그인 성공 후 앱 초기화
export function initApp(){
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
}

// init — 앱 시작점
function init(){
  initDB().then(function(){
    setupListeners();
    var st=getLoginState();
    if(st.blocked){$('loginBlocked').style.display='block';$('loginForm').style.display='none';return}
    if(st.lockUntil>Date.now()){showLockTimer(st.lockUntil);return}
    // 세션은 localStorage에서 확인 (기기별 독립)
    var localSession=localStorage.getItem('ad_session');
    if(localSession){
      var u=null;
      for(var i=0;i<state.db.users.length;i++){
        if(state.db.users[i].id===localSession&&state.db.users[i].active){u=state.db.users[i];break}
      }
      if(u){
        state.user=u;
        // 비밀번호 변경 필요 여부 확인
        if(u.needPw){
          $('loginScreen').classList.add('hidden');
          openModal('pwChangeModal');
        }else{
          initApp();
        }
      }
    }
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
window.openTagModal=openTagModal;
window.submitTag=submitTag;
window.quickTag=quickTag;
window.removeTag=removeTag;
window.onTitleChange=onTitleChange;
window.scrollToBlk=scrollToBlk;
window.copyCode=copyCode;
window.downloadCode=downloadCode;
window.copyImageUrl=copyImageUrl;
window.setImageScale=setImageScale;
window.downloadImage=downloadImage;
window.downloadFile=downloadFile;
window.dupBlockCurrent=dupBlockCurrent;
window.deleteBlockCurrent=deleteBlockCurrent;
window.addBlockBelowCurrent=addBlockBelowCurrent;
window.moveBlockUpCurrent=moveBlockUpCurrent;
window.moveBlockDownCurrent=moveBlockDownCurrent;
window.getCurrentIdx=getCurrentIdx;
window.genId=genId;
window.insertBlock=insertBlock;
window.addTblRow=addTblRow;
window.addTblCol=addTblCol;
window.delTblRow=delTblRow;
window.delTblCol=delTblCol;
window.setTblColor=setTblColor;
window.setTblAlign=setTblAlign;
window.deleteTable=deleteTable;
window.openColWidthModal=openColWidthModal;
window.applyColWidths=applyColWidths;
window.addBlockBelow=addBlockBelow;
window.showBlockCtx=showBlockCtx;
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
window.saveWorkspace=saveWorkspace;
window.saveNotice=saveNotice;
window.clearNotice=clearNotice;
window.clearIpLog=clearIpLog;
window.clearDeleteLog=clearDeleteLog;
window.restoreFromLog=restoreFromLog;
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
window.openCalloutIconPicker=openCalloutIconPicker;
window.setCalloutIcon=setCalloutIcon;
window.openCodeSetting=openCodeSetting;
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

// DOMContentLoaded
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
