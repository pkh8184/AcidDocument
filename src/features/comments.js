// src/features/comments.js — 댓글

import state from '../data/store.js';
import {$,genId,toast} from '../utils/helpers.js';
import {saveDB} from '../data/firestore.js';
import {closePanel,closeAllPanels,openModal,closeModal} from '../ui/modals.js';
import {renderComments} from '../ui/sidebar.js';

export function openComments(){closeAllPanels();state.panelType='comments';$('commentPanel').classList.add('open');if(state.page)renderComments()}
export function addComment(){var txt=$('commentInput').value.trim();if(!txt){toast('댓글 입력','err');return}state.page.comments.push({id:genId(),author:state.user.nickname||state.user.id,date:Date.now(),text:txt});saveDB();$('commentInput').value='';renderComments();toast('댓글 작성')}
export function editComment(id){for(var i=0;i<state.page.comments.length;i++){if(state.page.comments[i].id===id){state.editingCommentId=id;$('editCommentInput').value=state.page.comments[i].text;openModal('editCommentModal');return}}}
export function submitEditComment(){if(!state.editingCommentId)return;var txt=$('editCommentInput').value.trim();if(!txt){toast('내용을 입력하세요','err');return}for(var i=0;i<state.page.comments.length;i++){if(state.page.comments[i].id===state.editingCommentId){state.page.comments[i].text=txt;state.page.comments[i].date=Date.now();break}}saveDB();renderComments();closeModal('editCommentModal');state.editingCommentId=null;toast('댓글 수정됨')}
export function deleteComment(id){if(!confirm('댓글을 삭제하시겠습니까?'))return;state.page.comments=state.page.comments.filter(function(c){return c.id!==id});saveDB();renderComments();toast('댓글 삭제됨')}
