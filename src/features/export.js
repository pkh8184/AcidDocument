// src/features/export.js — 내보내기 (HTML, PDF, Markdown, Text)

import state from '../data/store.js';
import {$,esc,toast} from '../utils/helpers.js';
import {openModal,closeModal} from '../ui/modals.js';

export function openExport(){openModal('exportModal')}
export function exportDoc(fmt){
  var title=state.page.title,content='';
  for(var i=0;i<state.page.blocks.length;i++){var b=state.page.blocks[i],txt=(b.content||'').replace(/<[^>]*>/g,'');if(txt)content+=txt+'\n\n'}
  var blob,fn;
  if(fmt==='md'){blob=new Blob(['# '+title+'\n\n'+content],{type:'text/markdown'});fn=title+'.md'}
  else if(fmt==='html'){var html='<!DOCTYPE html><html><head><meta charset="UTF-8"><title>'+esc(title)+'</title><style>body{font-family:sans-serif;max-width:800px;margin:40px auto;padding:20px;line-height:1.6}</style></head><body><h1>'+esc(title)+'</h1><div>'+$('editor').innerHTML+'</div></body></html>';blob=new Blob([html],{type:'text/html'});fn=title+'.html'}
  else if(fmt==='pdf'){exportPdf();return}
  else{blob=new Blob([title+'\n\n'+content],{type:'text/plain'});fn=title+'.txt'}
  var url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=fn;a.click();URL.revokeObjectURL(url);closeModal('exportModal');toast('내보내기 완료')
}
export function exportPdf(){
  var title=state.page.title;
  var printWin=window.open('','_blank');
  var html='<!DOCTYPE html><html><head><meta charset="UTF-8"><title>'+esc(title)+'</title><style>@media print{@page{margin:20mm}body{font-family:-apple-system,BlinkMacSystemFont,"Pretendard",sans-serif;line-height:1.8;color:#333}h1{font-size:28px;margin-bottom:20px}h2{font-size:22px;margin:24px 0 12px}h3{font-size:18px;margin:20px 0 10px}p{margin:12px 0}ul,ol{margin:12px 0;padding-left:24px}table{width:100%;border-collapse:collapse;margin:16px 0}th,td{border:1px solid #ddd;padding:10px;text-align:left}th{background:#f5f5f5}blockquote{border-left:4px solid #ddd;padding-left:16px;margin:16px 0;color:#666}code{background:#f5f5f5;padding:2px 6px;border-radius:4px;font-family:monospace}.block-handle{display:none!important}}</style></head><body><h1>'+esc(title)+'</h1>'+$('editor').innerHTML+'<script>window.onload=function(){window.print();window.onafterprint=function(){window.close()}}<\/script></body></html>';
  printWin.document.write(html);
  printWin.document.close();
  closeModal('exportModal');toast('PDF 인쇄 창 열림')
}
