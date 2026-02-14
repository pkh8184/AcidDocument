// src/editor/media.js — 이미지, 동영상, PDF, 파일, 북마크, 슬라이드

import state from '../data/store.js';
import {ALLOWED_IMAGE_TYPES} from '../config/firebase.js';
import {$,genId,esc,toast} from '../utils/helpers.js';
import {sanitizeURL} from '../utils/sanitize.js';
import {saveDB,uploadToStorage} from '../data/firestore.js';
import {renderBlocks} from './renderer.js';
import {triggerAutoSave,deleteBlock,findBlock} from './blocks.js';
import {pushUndoImmediate} from './history.js';
import {openModal,closeModal} from '../ui/modals.js';

function insertMediaBlock(b){
  pushUndoImmediate();
  if(state.slashMenuState.idx!==null){state.page.blocks[state.slashMenuState.idx]=b;state.slashMenuState.idx=null}
  else if(state.currentInsertIdx!==null){state.page.blocks.splice(state.currentInsertIdx+1,0,b);state.currentInsertIdx=null}
  else state.page.blocks.push(b);
}

export function getYTId(url){if(!url)return null;var m=url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);return m?m[1]:null}

export function insertImage(){openModal('imageUploadModal');$('imageUrlInput').value='';$('imageFileInput').value=''}
export function submitImage(){
  var url=$('imageUrlInput').value.trim(),file=$('imageFileInput').files[0];
  if(file){
    var mode=state.db.settings.imageStorage||'storage';
    if(mode==='storage'){
      uploadToStorage(file,'images',ALLOWED_IMAGE_TYPES).then(function(result){
        addImageBlock(result.url);
      }).catch(function(err){
        console.error('이미지 업로드 실패:',err);
        toast(err.message||'이미지 업로드 실패','err');
      });
    }else{
      var reader=new FileReader();
      reader.onload=function(e){addImageBlock(e.target.result)};
      reader.readAsDataURL(file);
    }
  }else if(url){var safe=sanitizeURL(url);if(!safe){toast('유효하지 않은 URL입니다','err');return}addImageBlock(safe)}
  else{toast('URL 또는 파일을 선택하세요','err');return}
}
export function addImageBlock(src){
  var b={id:genId(),type:'image',src:src,caption:''};
  insertMediaBlock(b);
  renderBlocks();triggerAutoSave();closeModal('imageUploadModal');toast('이미지 삽입')
}

// 이미지 뷰어
export function openImageViewer(images,index){
  state.viewerImages=images;
  state.viewerIndex=index||0;
  $('viewerImg').src=state.viewerImages[state.viewerIndex];
  updateViewerCounter();
  $('imageViewer').classList.add('open');
  document.body.style.overflow='hidden';
}
export function closeImageViewer(e){
  if(e&&e.target!==$('imageViewer')&&e.target!==$('viewerImg'))return;
  $('imageViewer').classList.remove('open');
  document.body.style.overflow='';
}
export function viewerNav(dir,e){
  if(e)e.stopPropagation();
  state.viewerIndex+=dir;
  if(state.viewerIndex<0)state.viewerIndex=state.viewerImages.length-1;
  if(state.viewerIndex>=state.viewerImages.length)state.viewerIndex=0;
  $('viewerImg').src=state.viewerImages[state.viewerIndex];
  updateViewerCounter();
}
export function updateViewerCounter(){
  $('viewerCounter').textContent=(state.viewerIndex+1)+' / '+state.viewerImages.length;
  $('viewerPrev').style.display=state.viewerImages.length>1?'block':'none';
  $('viewerNext').style.display=state.viewerImages.length>1?'block':'none';
}

export function copyImageUrl(idx){
  var b=state.page.blocks[idx];
  if(b&&b.src){
    // 이미지를 클립보드에 복사
    var img=new Image();
    img.crossOrigin='anonymous';
    img.onload=function(){
      var canvas=document.createElement('canvas');
      canvas.width=img.naturalWidth;
      canvas.height=img.naturalHeight;
      var ctx=canvas.getContext('2d');
      ctx.drawImage(img,0,0);
      canvas.toBlob(function(blob){
        if(blob){
          navigator.clipboard.write([new ClipboardItem({'image/png':blob})]).then(function(){toast('이미지 복사됨')}).catch(function(){
            // fallback: URL 복사
            navigator.clipboard.writeText(b.src).then(function(){toast('URL 복사됨')});
          });
        }
      },'image/png');
    };
    img.onerror=function(){
      // 이미지 로드 실패 시 URL 복사
      navigator.clipboard.writeText(b.src).then(function(){toast('URL 복사됨')});
    };
    img.src=b.src;
  }
}
export function setImageScale(idx,scale){pushUndoImmediate();state.page.blocks[idx].scale=scale;delete state.page.blocks[idx].width;renderBlocks();triggerAutoSave();toast(scale+'% 크기')}
export function setImageAlign(idx,align){pushUndoImmediate();state.page.blocks[idx].align=align;renderBlocks();triggerAutoSave();toast(align==='left'?'왼쪽 정렬':align==='right'?'오른쪽 정렬':'가운데 정렬')}
export function downloadImage(idx){
  var b=state.page.blocks[idx];
  if(b&&b.src){
    var a=document.createElement('a');
    a.href=b.src;
    a.download='image_'+Date.now()+'.png';
    a.click();
    toast('다운로드 시작');
  }
}
export function downloadFile(idx){var b=state.page.blocks[idx];if(b&&b.url){var a=document.createElement('a');a.href=b.url;a.download=b.name||'file';a.click();toast('다운로드 시작')}}

// 슬라이드 블록
export function renderSlideBlock(b,idx){
  var images=b.images||[];
  var current=b.currentSlide||0;
  var autoPlay=b.autoPlay||false;
  var interval=b.interval||3000;

  var html='<div class="block-slide-wrap" data-block-idx="'+idx+'" data-current="'+current+'">';
  html+='<div class="block-slide-container">';
  html+='<div class="block-slide-track" style="transform:translateX(-'+current*100+'%)">';
  if(images.length===0){
    html+='<div class="block-slide-item" style="background:var(--bg2);color:var(--t4);font-size:14px">이미지를 추가하세요</div>';
  }else{
    for(var i=0;i<images.length;i++){
      html+='<div class="block-slide-item" onclick="'+(state.editMode?'':'openImageViewer(getSlideImages('+idx+'),'+i+')')+'">';
      html+='<img src="'+esc(images[i])+'" onerror="this.style.display=\'none\'">';
      html+='</div>';
    }
  }
  html+='</div>';
  if(images.length>1){
    html+='<button class="block-slide-nav prev" onclick="slideNav('+idx+',-1)">‹</button>';
    html+='<button class="block-slide-nav next" onclick="slideNav('+idx+',1)">›</button>';
  }
  html+='</div>';
  // 도트 인디케이터
  if(images.length>1){
    html+='<div class="block-slide-dots">';
    for(var i=0;i<images.length;i++){
      html+='<div class="block-slide-dot'+(i===current?' active':'')+'" onclick="slideTo('+idx+','+i+')"></div>';
    }
    html+='</div>';
  }
  // 편집 모드 툴바
  if(state.editMode){
    html+='<div class="block-slide-toolbar">';
    html+='<label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" '+(autoPlay?'checked':'')+' onchange="setSlideAuto('+idx+',this.checked)"><span style="font-size:13px">자동 넘기기</span></label>';
    html+='<select style="padding:4px 8px;border:1px solid var(--bdr);border-radius:4px;background:var(--bg3);color:var(--t1);font-size:13px" onchange="setSlideInterval('+idx+',this.value)"'+(autoPlay?'':' disabled')+'>';
    html+='<option value="2000"'+(interval===2000?' selected':'')+'>2초</option>';
    html+='<option value="3000"'+(interval===3000?' selected':'')+'>3초</option>';
    html+='<option value="5000"'+(interval===5000?' selected':'')+'>5초</option>';
    html+='<option value="7000"'+(interval===7000?' selected':'')+'>7초</option>';
    html+='</select>';
    html+='<button class="btn btn-sm btn-d" onclick="deleteBlock('+idx+')">삭제</button>';
    html+='</div>';
    html+='<div class="block-slide-images">';
    for(var i=0;i<images.length;i++){
      html+='<div style="position:relative"><img class="block-slide-thumb'+(i===current?' active':'')+'" src="'+esc(images[i])+'" onclick="slideTo('+idx+','+i+')">';
      html+='<button style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:var(--err);color:#fff;border:none;font-size:12px;cursor:pointer" onclick="removeSlideImage('+idx+','+i+')">✕</button></div>';
    }
    html+='<div class="block-slide-add" onclick="addSlideImage('+idx+')">+</div>';
    html+='</div>';
  }
  html+='</div>';
  return html;
}
export function getSlideImages(idx){
  return state.page.blocks[idx].images||[];
}
export function slideNav(idx,dir){
  var b=state.page.blocks[idx];
  var images=b.images||[];
  if(images.length<2)return;
  pushUndoImmediate();
  b=state.page.blocks[idx];
  var current=b.currentSlide||0;
  current+=dir;
  if(current<0)current=images.length-1;
  if(current>=images.length)current=0;
  b.currentSlide=current;
  renderBlocks();
}
export function slideTo(idx,i){
  pushUndoImmediate();
  state.page.blocks[idx].currentSlide=i;
  renderBlocks();
}
export function setSlideAuto(idx,auto){
  pushUndoImmediate();
  state.page.blocks[idx].autoPlay=auto;
  triggerAutoSave();
  renderBlocks();
}
export function setSlideInterval(idx,val){
  state.page.blocks[idx].interval=parseInt(val);
  triggerAutoSave();
}
export function insertSlide(){
  var b={id:genId(),type:'slide',images:[],currentSlide:0,autoPlay:false,interval:3000};
  insertMediaBlock(b);
  state.page.blocks.splice(state.page.blocks.indexOf(b)+1,0,{id:genId(),type:'text',content:''});
  renderBlocks();triggerAutoSave();toast('슬라이드 추가');
}
export function addSlideImage(idx){
  state.currentSlideIdx=idx;
  openModal('slideImageModal');
  $('slideImageUrlInput').value='';
  $('slideImageFileInput').value='';
}
export function submitSlideImage(){
  var url=$('slideImageUrlInput').value.trim(),file=$('slideImageFileInput').files[0];
  if(file){
    var mode=state.db.settings.imageStorage||'storage';
    if(mode==='storage'){
      uploadToStorage(file,'images',ALLOWED_IMAGE_TYPES).then(function(result){
        addSlideImageSrc(result.url);
      }).catch(function(err){
        toast(err.message||'업로드 실패','err');
      });
    }else{
      var reader=new FileReader();
      reader.onload=function(e){addSlideImageSrc(e.target.result)};
      reader.readAsDataURL(file);
    }
  }else if(url){
    var safe=sanitizeURL(url);if(!safe){toast('유효하지 않은 URL입니다','err');return}
    addSlideImageSrc(safe);
  }else{
    toast('URL 또는 파일을 선택하세요','err');
  }
}
export function addSlideImageSrc(src){
  if(state.currentSlideIdx===null)return;
  pushUndoImmediate();
  if(!state.page.blocks[state.currentSlideIdx].images)state.page.blocks[state.currentSlideIdx].images=[];
  state.page.blocks[state.currentSlideIdx].images.push(src);
  renderBlocks();triggerAutoSave();
  closeModal('slideImageModal');
  toast('이미지 추가');
  state.currentSlideIdx=null;
}
export function removeSlideImage(idx,imgIdx){
  pushUndoImmediate();
  state.page.blocks[idx].images.splice(imgIdx,1);
  if(state.page.blocks[idx].currentSlide>=state.page.blocks[idx].images.length){
    state.page.blocks[idx].currentSlide=Math.max(0,state.page.blocks[idx].images.length-1);
  }
  renderBlocks();triggerAutoSave();
}

// 슬라이드 자동 재생
export function setupSlideAutoPlay(){
  // 기존 인터벌 정리
  for(var k in state.slideIntervals){clearInterval(state.slideIntervals[k])}
  state.slideIntervals={};
  if(state.editMode)return;
  // 자동 재생 설정된 슬라이드 찾기
  for(var i=0;i<state.page.blocks.length;i++){
    var b=state.page.blocks[i];
    if(b.type==='slide'&&b.autoPlay&&b.images&&b.images.length>1){
      (function(idx,interval){
        state.slideIntervals[idx]=setInterval(function(){
          slideNav(idx,1);
        },interval||3000);
      })(i,b.interval);
    }
  }
}

export function insertVideo(){openModal('videoUploadModal');$('videoUrlInput').value='';$('videoFileInput').value=''}
export function submitVideo(){
  var url=$('videoUrlInput').value.trim(),file=$('videoFileInput').files[0];
  if(file){
    var reader=new FileReader();
    reader.onload=function(e){addVideoBlock(e.target.result,file.name)};
    reader.readAsDataURL(file)
  }else if(url){
    var safe=sanitizeURL(url);
    if(!safe){toast('유효하지 않은 URL입니다','err');return}
    var vid=getYTId(safe);
    if(!vid){toast('유효한 YouTube URL을 입력하세요','err');return}
    addVideoBlock(safe,null)
  }else{toast('URL 또는 파일을 선택하세요','err');return}
}
export function addVideoBlock(src,fname){
  var b={id:genId(),type:'video',url:src,isFile:!!fname,fileName:fname||''};
  insertMediaBlock(b);
  renderBlocks();triggerAutoSave();closeModal('videoUploadModal');toast('동영상 삽입')
}
export function insertPdf(){openModal('pdfUploadModal');$('pdfUrlInput').value='';$('pdfFileInput').value=''}
export function submitPdf(){
  var url=$('pdfUrlInput').value.trim(),file=$('pdfFileInput').files[0];
  if(file){
    var reader=new FileReader();
    reader.onload=function(e){addPdfBlock(e.target.result)};
    reader.readAsDataURL(file)
  }else if(url){var safe=sanitizeURL(url);if(!safe){toast('유효하지 않은 URL입니다','err');return}addPdfBlock(safe)}
  else{toast('URL 또는 파일을 선택하세요','err');return}
}
export function addPdfBlock(src){
  var b={id:genId(),type:'pdf',src:src};
  insertMediaBlock(b);
  renderBlocks();triggerAutoSave();closeModal('pdfUploadModal');toast('PDF 삽입')
}
export function insertFile(){openModal('fileUploadModal');$('fileFileInput').value=''}
export function insertBookmark(){
  openModal('bookmarkModal');
  $('bookmarkUrlInput').value='';
  $('bookmarkTitleInput').value='';
  $('bookmarkDescInput').value='';
}
export function submitBookmark(){
  var url=$('bookmarkUrlInput').value.trim();
  if(!url){toast('URL을 입력하세요','err');return}
  if(!url.startsWith('http'))url='https://'+url;
  url=sanitizeURL(url);if(!url){toast('유효하지 않은 URL입니다','err');return}
  var title=$('bookmarkTitleInput').value.trim()||'';
  var desc=$('bookmarkDescInput').value.trim()||'';
  var b={id:genId(),type:'bookmark',url:url,title:title,description:desc,image:''};
  insertMediaBlock(b);
  // 아래에 빈 블록 추가
  state.page.blocks.splice(state.page.blocks.indexOf(b)+1,0,{id:genId(),type:'text',content:''});
  renderBlocks();triggerAutoSave();closeModal('bookmarkModal');toast('북마크 삽입')
}
export function submitFile(){
  var file=$('fileFileInput').files[0];
  if(!file){toast('파일을 선택하세요','err');return}
  var reader=new FileReader();
  reader.onload=function(e){
    var b={id:genId(),type:'file',url:e.target.result,name:file.name};
    insertMediaBlock(b);
    renderBlocks();triggerAutoSave();closeModal('fileUploadModal');toast('파일 삽입')
  };
  reader.readAsDataURL(file)
}

// 콜아웃/코드 설정
export function openCalloutIconPicker(id){state.currentEditBlockId=id;var icons=['💡','✅','⚠️','❌','📌','🔔','💬','📝','🎯','⭐','🚀','💪','🔥','❤️','👍','📢'];var html='';for(var i=0;i<icons.length;i++)html+='<div class="icon-item" onclick="setCalloutIcon(\''+icons[i]+'\')">'+icons[i]+'</div>';$('calloutIconGrid').innerHTML=html;openModal('calloutIconModal')}
export function setCalloutIcon(icon){if(!state.currentEditBlockId)return;pushUndoImmediate();var b=findBlock(state.currentEditBlockId);if(b)b.icon=icon;renderBlocks();triggerAutoSave();closeModal('calloutIconModal');state.currentEditBlockId=null}
export function openCodeSetting(id){state.currentEditBlockId=id;var b=findBlock(id);if(b)$('codeLangInput').value=b.lang||'';openModal('codeSettingModal')}
export function submitCodeLang(){if(!state.currentEditBlockId)return;pushUndoImmediate();var lang=$('codeLangInput').value.trim();var b=findBlock(state.currentEditBlockId);if(b)b.lang=lang;renderBlocks();triggerAutoSave();closeModal('codeSettingModal');state.currentEditBlockId=null;toast('저장됨')}
