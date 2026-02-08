// src/features/versions.js — 버전 관리

import state from '../data/store.js';
import {$,toast} from '../utils/helpers.js';
import {saveDB} from '../data/firestore.js';
import {renderBlocks} from '../editor/renderer.js';
import {closePanel} from '../ui/modals.js';
import {renderVersions,saveDoc} from '../ui/sidebar.js';

export function openVersions(){import('../ui/modals.js').then(function(m){m.closeAllPanels()});state.panelType='versions';$('versionPanel').classList.add('open')}
export function restoreVer(vid){var v=null;for(var i=0;i<state.page.versions.length;i++){if(state.page.versions[i].id==vid){v=state.page.versions[i];break}}if(!v||!v.blocks||!confirm('이 버전으로 복원?'))return;state.page.blocks=JSON.parse(JSON.stringify(v.blocks));renderBlocks();saveDoc();closePanel('versionPanel');toast('복원됨')}
export function deleteVer(vid){if(!confirm('버전 삭제?'))return;state.page.versions=state.page.versions.filter(function(v){return v.id!=vid});saveDB();renderVersions();toast('삭제됨')}
