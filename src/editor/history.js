// src/editor/history.js — Undo/Redo 히스토리 관리

import state from '../data/store.js';
import {collectBlocks,focusBlock} from './blocks.js';
import {renderBlocks} from './renderer.js';

var MAX_UNDO=50;

export function pushUndo(){
  if(!state.editMode||!state.page)return;
  syncBlocksFromDOM();
  var snapshot=JSON.parse(JSON.stringify(state.page.blocks));
  state.undoStack.push(snapshot);
  if(state.undoStack.length>MAX_UNDO)state.undoStack.shift();
  state.redoStack=[];
}

// 구조 변경(블록 추가/삭제/이동) 전 호출 — 즉시 저장
export function pushUndoImmediate(){
  if(!state.editMode||!state.page)return;
  clearTimeout(state.undoTimer);
  syncBlocksFromDOM();
  pushUndo();
}

// DOM → state 동기화 (undo 전 호출)
function syncBlocksFromDOM(){
  try{
    var synced=collectBlocks();
    if(synced&&synced.length>0)state.page.blocks=synced;
  }catch(e){console.warn('syncBlocksFromDOM 실패:',e)}
}

export function undo(){
  if(!state.page||state.undoStack.length===0)return;
  clearTimeout(state.undoTimer);
  syncBlocksFromDOM();
  var current=JSON.parse(JSON.stringify(state.page.blocks));
  state.redoStack.push(current);
  state.page.blocks=state.undoStack.pop();
  renderBlocks();
  if(state.page.blocks.length>0)focusBlock(0,0);
}

export function redo(){
  if(!state.page||state.redoStack.length===0)return;
  clearTimeout(state.undoTimer);
  syncBlocksFromDOM();
  var current=JSON.parse(JSON.stringify(state.page.blocks));
  state.undoStack.push(current);
  if(state.undoStack.length>MAX_UNDO)state.undoStack.shift();
  state.page.blocks=state.redoStack.pop();
  renderBlocks();
  if(state.page.blocks.length>0)focusBlock(0,0);
}

export function clearHistory(){
  state.undoStack=[];
  state.redoStack=[];
}
