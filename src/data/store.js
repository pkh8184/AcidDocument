// src/data/store.js — 중앙 상태 관리
// 모든 모듈이 공유하는 전역 상태 변수

var state={
  user:null,
  db:null,
  page:null,
  editMode:false,
  editBackup:null,
  slashMenuState:{open:false,idx:null},
  autoSaveTimer:null,
  isComposing:false,
  dragPageId:null,
  deleteTargetId:null,
  currentEditBlockId:null,
  currentInsertIdx:null,
  currentSlideIdx:null,
  panelType:null,
  savedSelection:null,
  editingCommentId:null,
  renamePageId:null,
  currentCalIdx:null,
  selectedEventColor:'#3b82f6',
  colWidthTableId:null,
  currentTagElement:null,
  lastSearchQuery:'',
  viewerImages:[],
  viewerIndex:0,
  slideIntervals:{},
  undoStack:[],
  redoStack:[],
  undoTimer:null,
  dragBlockIdx:null,
  loginInProgress:false
};

export default state;
