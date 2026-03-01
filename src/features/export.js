// src/features/export.js — 내보내기 (HTML, PDF, Markdown, Text)

import state from '../data/store.js';
import {$,esc,toast} from '../utils/helpers.js';
import {sanitizeHTML} from '../utils/sanitize.js';
import {openModal,closeModal} from '../ui/modals.js';

export function openExport(){openModal('exportModal')}
export function exportDoc(fmt){
  var title=state.page.title,content='';
  for(var i=0;i<state.page.blocks.length;i++){var b=state.page.blocks[i],txt=sanitizeHTML(b.content||'').replace(/<[^>]*>/g,'');if(txt)content+=txt+'\n\n'}
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
  var html='<!DOCTYPE html><html><head><meta charset="UTF-8"><title>'+esc(title)+'</title><style>@media print{@page{margin:20mm}body{font-family:-apple-system,BlinkMacSystemFont,"Pretendard",sans-serif;line-height:1.8;color:#333}h1{font-size:28px;margin-bottom:20px}h2{font-size:22px;margin:24px 0 12px}h3{font-size:18px;margin:20px 0 10px}.block-h4 .block-content{font-size:16px;font-weight:600;margin:16px 0 6px}.block-h5 .block-content{font-size:14px;font-weight:600;margin:12px 0 4px}p{margin:12px 0}ul,ol{margin:12px 0;padding-left:24px}table{width:100%;border-collapse:collapse;margin:16px 0}th,td{border:1px solid #ddd;padding:10px;text-align:left}th{background:#f5f5f5}blockquote{border-left:4px solid #ddd;padding-left:16px;margin:16px 0;color:#666}code{background:#f5f5f5;padding:2px 6px;border-radius:4px;font-family:monospace}.block-handle{display:none!important}}</style></head><body><h1>'+esc(title)+'</h1>'+$('editor').innerHTML+'<script>window.onload=function(){window.print();window.onafterprint=function(){window.close()}}<\/script></body></html>';
  printWin.document.write(html);
  printWin.document.close();
  closeModal('exportModal');toast('PDF 인쇄 창 열림')
}
// PDF 템플릿 선택 화면 표시
export function showPdfOptions(){
  closeModal('exportModal');
  openModal('pdfTemplateModal');
}
// 기획서/제안서 템플릿 PDF 내보내기
export function exportPdfTemplate(tpl){
  if(tpl==='basic'){closeModal('pdfTemplateModal');exportPdf();return}
  var title=state.page.title;
  var wsName=(state.db&&state.db.settings&&state.db.settings.wsName)||'AcidDocument';
  var author=(state.user&&(state.user.nickname||state.user.id))||'';
  var now=new Date();
  var dateStr=now.getFullYear()+'년 '+(now.getMonth()+1)+'월 '+now.getDate()+'일';

  // 목차 생성 (h1~h5)
  var tocHtml='';
  var blocks=state.page.blocks||[];
  for(var i=0;i<blocks.length;i++){
    var b=blocks[i];
    if(b.type==='h1'||b.type==='h2'||b.type==='h3'||b.type==='h4'||b.type==='h5'){
      var tmp=document.createElement('div');
      tmp.innerHTML=sanitizeHTML(b.content||'');
      var txt=tmp.textContent||'';
      if(!txt)continue;
      var lvl=b.type==='h1'?1:b.type==='h2'?2:b.type==='h3'?3:b.type==='h4'?4:5;
      var pad=(lvl-1)*20;
      tocHtml+='<div style="padding:6px 0 6px '+pad+'px;font-size:'+(lvl===1?'15px':'13px')+';'+(lvl===1?'font-weight:600;':'color:#555;')+'">'+esc(txt)+'</div>';
    }
  }
  if(!tocHtml)tocHtml='<p style="color:#999">제목이 없습니다</p>';

  // 본문 (에디터 innerHTML 활용)
  var editorContent=$('editor').innerHTML;

  var printWin=window.open('','_blank');
  var html='<!DOCTYPE html><html><head><meta charset="UTF-8"><title>'+esc(title)+'</title>';
  html+='<style>';
  // 기본
  html+='*{margin:0;padding:0;box-sizing:border-box}';
  html+='body{font-family:-apple-system,BlinkMacSystemFont,"Pretendard","Segoe UI",sans-serif;color:#222;line-height:1.7;font-size:14px}';
  // 인쇄 설정
  html+='@page{margin:25mm 20mm 25mm 20mm;size:A4}';
  // 커버 페이지
  html+='.cover{display:flex;flex-direction:column;justify-content:center;align-items:center;height:100vh;text-align:center;page-break-after:always}';
  html+='.cover-ws{font-size:14px;color:#888;letter-spacing:2px;text-transform:uppercase;margin-bottom:40px}';
  html+='.cover-title{font-size:36px;font-weight:700;line-height:1.3;margin-bottom:24px;color:#111;max-width:80%}';
  html+='.cover-meta{font-size:14px;color:#666;margin-top:16px}';
  html+='.cover-line{width:60px;height:3px;background:#333;margin:32px auto 0}';
  // 목차 페이지
  html+='.toc-page{page-break-after:always;padding-top:60px}';
  html+='.toc-title{font-size:24px;font-weight:700;margin-bottom:32px;padding-bottom:12px;border-bottom:2px solid #333}';
  // 본문
  html+='.doc-body{padding-top:20px}';
  // 헤더/푸터 (position:fixed로 인쇄 시 모든 페이지에 반복)
  html+='.print-header{position:fixed;top:0;left:0;right:0;font-size:10px;color:#aaa;border-bottom:0.5px solid #ddd;padding-bottom:4px}';
  html+='.print-footer{position:fixed;bottom:0;left:0;right:0;text-align:center;font-size:10px;color:#aaa}';
  // 본문 내 블록 스타일
  html+='.block-handle,.block-add-below,.block-toggle-arrow,.block-code-head button,.ctx-menu{display:none!important}';
  html+='.block{position:relative;padding:2px 0;margin:0}';
  html+='.block-content{outline:none}';
  html+='.block-h1 .block-content{font-size:26px;font-weight:700;line-height:1.3;margin:32px 0 12px;padding-bottom:8px;border-bottom:1px solid #e0e0e0;page-break-before:always}';
  html+='.block-h1:first-child .block-content{page-break-before:auto}';
  html+='.block-h2 .block-content{font-size:21px;font-weight:600;line-height:1.35;margin:24px 0 10px;color:#222}';
  html+='.block-h3 .block-content{font-size:18px;font-weight:600;line-height:1.4;margin:20px 0 8px;color:#333}';
  html+='.block-h4 .block-content{font-size:16px;font-weight:600;line-height:1.4;margin:16px 0 6px;color:#444}';
  html+='.block-h5 .block-content{font-size:14px;font-weight:600;line-height:1.45;margin:12px 0 4px;color:#555}';
  html+='.block-text .block-content{margin:4px 0}';
  html+='.block-quote{border-left:3px solid #999;padding-left:16px;margin:12px 0}';
  html+='.block-quote .block-content{color:#555;font-style:italic}';
  html+='.block-bullet{padding-left:24px;position:relative}.block-bullet::before{content:"•";position:absolute;left:8px;color:#666}';
  html+='.block-number{padding-left:24px;position:relative}.block-number::before{content:attr(data-num)".";position:absolute;left:4px;color:#666;font-size:13px}';
  html+='.block-todo{padding-left:24px}';
  html+='.block-callout-wrap{background:#f7f7f7;border:1px solid #e0e0e0;border-radius:6px;padding:12px 16px;margin:12px 0;display:flex;gap:10px}';
  html+='.block-code-wrap{background:#f5f5f5;border:1px solid #e0e0e0;border-radius:6px;padding:12px 16px;margin:12px 0;font-family:monospace;font-size:13px;white-space:pre-wrap}';
  html+='table{width:100%;border-collapse:collapse;margin:16px 0}th,td{border:1px solid #ddd;padding:8px 10px;text-align:left;font-size:13px}th{background:#f5f5f5;font-weight:600}';
  html+='.block-divider hr{border:none;border-top:1px solid #ddd;margin:24px 0}';
  html+='.block-toc,.block-toc-wrap{display:none}';
  html+='code{background:#f0f0f0;padding:1px 5px;border-radius:3px;font-family:monospace;font-size:13px}';
  html+='img{max-width:100%;height:auto}';
  html+='</style>';
  html+='</head><body>';
  // 헤더 (2페이지부터)
  html+='<div class="print-header">'+esc(title)+'</div>';
  html+='<div class="print-footer"></div>';
  // 커버 페이지
  html+='<div class="cover">';
  html+='<div class="cover-ws">'+esc(wsName)+'</div>';
  html+='<div class="cover-title">'+esc(title)+'</div>';
  html+='<div class="cover-meta">'+esc(author)+(author?' · ':'')+esc(dateStr)+'</div>';
  html+='<div class="cover-line"></div>';
  html+='</div>';
  // 목차 페이지
  html+='<div class="toc-page">';
  html+='<div class="toc-title">목차</div>';
  html+=tocHtml;
  html+='</div>';
  // 본문
  html+='<div class="doc-body">';
  html+=editorContent;
  html+='</div>';
  // 인쇄
  html+='<script>';
  html+='window.onload=function(){';
  // 페이지 번호 (CSS counter 대안: 직접 표시)
  html+='document.querySelector(".print-footer").textContent="";';
  html+='window.print();';
  html+='window.onafterprint=function(){window.close()}';
  html+='};';
  html+='<\/script>';
  html+='</body></html>';

  printWin.document.write(html);
  printWin.document.close();
  closeModal('pdfTemplateModal');
  toast('기획서 PDF 인쇄 창 열림');
}
