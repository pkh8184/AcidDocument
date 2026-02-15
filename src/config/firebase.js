// src/config/firebase.js — Firebase 초기화 + 상수

var firebaseConfig={apiKey:"AIzaSyBqHTIoLGKnCnR8n8jFGS3a4LGhIJe5xQI",authDomain:"aciddocument.firebaseapp.com",projectId:"aciddocument",storageBucket:"aciddocument.firebasestorage.app",messagingSenderId:"834603817632",appId:"1:834603817632:web:5bd935f6805e05582307c5"};
firebase.initializeApp(firebaseConfig);
export var firestore=firebase.firestore();
export var storage=firebase.storage();
export var auth=firebase.auth();

export var MAX_VER=10;
// Storage 용량 제한 (bytes)
export var STORAGE_LIMIT=5*1024*1024*1024; // 5GB
export var MAX_FILE_SIZE=10*1024*1024; // 파일당 최대 10MB
export var ALLOWED_IMAGE_TYPES=['image/jpeg','image/png','image/gif','image/webp'];
export var ALLOWED_VIDEO_TYPES=['video/mp4','video/webm','video/ogg'];
export var ALLOWED_FILE_TYPES=['application/pdf','application/zip','application/x-zip-compressed','text/plain','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
export var ICONS=['📄','📝','📋','📁','📚','📖','📌','💡','⭐','🔥','✨','🚀','🎨','💻','📊','🎯','👋','❤️','🏠','📱','🔧','⚙️','🎁','💎','🌟','📈','🔒','💬','📮','🗂️','📑','🔖','🎵','🎬','📷','🌍','⚡','🔔','✅','❌','⚠️','💰','🎓','🏆','🌈','☀️','🌙'];
export var COLORS=['#f85149','#ff7b72','#ffa657','#d29922','#3fb950','#56d364','#58a6ff','#79b8ff','#a371f7','#bc8cff','#f0f6fc','#8b949e','#6e7681','#30363d'];
export var SLASH=[
  {s:'기본',i:[{t:'text',c:'T',n:'텍스트',d:'일반 텍스트'},{t:'h1',c:'H1',n:'제목 1',d:'큰 제목'},{t:'h2',c:'H2',n:'제목 2',d:'중간 제목'},{t:'h3',c:'H3',n:'제목 3',d:'작은 제목'}]},
  {s:'리스트',i:[{t:'bullet',c:'•',n:'글머리 기호',d:'목록'},{t:'number',c:'1.',n:'번호 목록',d:'순서'},{t:'todo',c:'☑',n:'할 일',d:'체크리스트'},{t:'toggle',c:'▶',n:'토글',d:'접기/펼치기'}]},
  {s:'미디어',i:[{t:'image',c:'🖼',n:'이미지',d:'URL'},{t:'slide',c:'🎠',n:'슬라이드',d:'이미지 슬라이드'},{t:'video',c:'🎬',n:'동영상',d:'YouTube'},{t:'pdf',c:'📄',n:'PDF',d:'PDF 뷰어'},{t:'file',c:'📎',n:'파일',d:'파일 링크'},{t:'bookmark',c:'🔗',n:'북마크',d:'URL 미리보기'}]},
  {s:'테이블/코드',i:[{t:'table',c:'▦',n:'표',d:'테이블'},{t:'code',c:'</>',n:'코드',d:'코드 블록'},{t:'calendar',c:'📅',n:'달력',d:'일정 관리'}]},
  {s:'차트',i:[{t:'chart-bar',c:'📊',n:'막대 그래프',d:'Bar Chart'},{t:'chart-pie',c:'🥧',n:'원형 그래프',d:'Pie Chart'},{t:'chart-line',c:'📈',n:'선형 그래프',d:'Line Chart'}]},
  {s:'레이아웃',i:[{t:'col2',c:'▐▌',n:'2열',d:'2컬럼'},{t:'col3',c:'▐▐▌',n:'3열',d:'3컬럼'}]},
  {s:'기타',i:[{t:'quote',c:'"',n:'인용',d:'인용문'},{t:'callout',c:'💡',n:'콜아웃',d:'강조'},{t:'divider',c:'—',n:'구분선',d:'구분'},{t:'toc',c:'📑',n:'목차',d:'자동 목차'},{t:'emoji',c:'😀',n:'이모지',d:'이모지 삽입'},{t:'mention',c:'👤',n:'멘션',d:'사용자 태그'},{t:'pagelink',c:'🔗',n:'페이지 링크',d:'다른 페이지 연결'}]}
];
export var TEMPLATES=[
  {id:'meeting',name:'회의록',icon:'📋',blocks:[
    {type:'h1',content:'📋 회의록'},
    {type:'table',rowsJson:'[["항목","내용"],["📅 회의 일시",""],["📍 회의 장소",""],["👥 참여 대상",""],["📌 회의 주제",""],["🎤 발언자",""]]'},
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
    {type:'table',rowsJson:'[["단계","시작일","종료일","담당자"],["기획","","",""],["개발","","",""],["테스트","","",""]]'}
  ]}
];
export var CAL_COLORS=['#3b82f6','#ef4444','#22c55e','#f59e0b','#8b5cf6','#ec4899','#06b6d4','#84cc16'];
export var CHART_COLORS=['#3b82f6','#ef4444','#22c55e','#f59e0b','#8b5cf6','#ec4899','#06b6d4','#84cc16'];
export var EMOJIS=['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😊','😇','🥰','😍','🤩','😘','😗','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','😎','🤓','🧐','😕','😟','🙁','☹️','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','👍','👎','👏','🙌','🤝','🙏','✌️','🤞','🤟','🤘','👌','👈','👉','👆','👇','☝️','✋','🤚','🖐️','👋','🤙','💪','❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','❣️','💕','💞','💓','💗','💖','💘','⭐','🌟','✨','💫','🔥','💯','✅','❌','⚠️','📌','🎯','🚀','💡','📝','📋','📊','📈','📉','🗓️','⏰','🔔','🔒','🔑','🎉','🎊','🎁','🏆','🥇','🥈','🥉'];
