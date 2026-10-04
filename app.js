const GROUPS = window.GROUPS || [];

const el = id => document.getElementById(id);
const normalize = s => String(s).trim().toLowerCase().replace(/\s+/g,' ');
const shuffle = arr => {
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}
  return a;
};
const sample=(arr,n)=>shuffle(arr).slice(0,Math.min(n,arr.length));

const storageKey='ielts_synonym_glass_v1';
let saved={seen:[],wrong:[],mode:'multi',review:false};
try{ saved={...saved,...JSON.parse(localStorage.getItem(storageKey)||'{}')}; }catch(e){}
let mode=['one','multi','cluster'].includes(saved.mode)?saved.mode:'multi';
let review=!!saved.review;
let current=null;
let selectedLeft=null;
let links=[];
let checked=false;

function save(){
  saved.mode=mode;saved.review=review;
  localStorage.setItem(storageKey,JSON.stringify(saved));
  renderStats();
}
function renderStats(){
  el('seenStat').textContent=new Set(saved.seen).size;
  el('wrongStat').textContent=new Set(saved.wrong).size;
  el('totalStat').textContent=GROUPS.length;
  const pct=Math.min(100,(new Set(saved.seen).size/GROUPS.length)*100);
  el('progressFill').style.width=pct+'%';
  el('reviewBtn').classList.toggle('on',review);
}
function pool(){
  if(review && saved.wrong.length){
    const ids=new Set(saved.wrong);
    const p=GROUPS.filter(g=>ids.has(g.id));
    if(p.length) return p;
  }
  return GROUPS;
}
function randomGroup(excludeIds=[]){
  const p=pool().filter(g=>!excludeIds.includes(g.id) && g.terms.length>=2);
  return p[Math.floor(Math.random()*p.length)] || GROUPS[Math.floor(Math.random()*GROUPS.length)];
}
function termOccurrences(term){
  const n=normalize(term);
  let c=0;
  for(const g of GROUPS) if(g.terms.some(t=>normalize(t)===n)) c++;
  return c;
}
function getDistractors(group,count,used=[]){
  const ban=new Set([...group.terms,...used].map(normalize));
  const candidates=[];
  for(const g of GROUPS){
    if(g.id===group.id) continue;
    for(const t of g.terms){
      const n=normalize(t);
      if(!ban.has(n) && termOccurrences(t)===1 && t.length<34){
        candidates.push(t); ban.add(n);
      }
    }
  }
  return sample(candidates,count);
}
function pickAnchor(group){
  const preferred=group.terms.filter(t=>t.length<=22 && !/[()=]/.test(t));
  const base=preferred.length?preferred:group.terms;
  return base[Math.floor(Math.random()*base.length)];
}
function makeRound(){
  checked=false;selectedLeft=null;links=[];
  if(mode==='cluster') return makeClusterRound();
  const g=randomGroup();
  const anchor=pickAnchor(g);
  let correct=g.terms.filter(t=>normalize(t)!==normalize(anchor));
  if(mode==='one'){
    correct=sample(correct,1);
    const right=shuffle([...correct,...getDistractors(g,3,correct)]);
    return {type:'one',groups:[g],title:g.label,source:g.sourceId,left:[{id:'L0',groupId:g.id,word:anchor,label:g.label}],right:right.map((w,i)=>({id:'R'+i,word:w,groupId:correct.some(c=>normalize(c)===normalize(w))?g.id:'distractor'})),needed:1};
  }
  const n=Math.min(correct.length,Math.max(2,Math.min(4,Math.round(2+Math.random()*2))));
  correct=sample(correct,n);
  const distractN=Math.max(2,6-correct.length);
  const right=shuffle([...correct,...getDistractors(g,distractN,correct)]);
  return {type:'multi',groups:[g],title:g.label,source:g.sourceId,left:[{id:'L0',groupId:g.id,word:anchor,label:g.label}],right:right.map((w,i)=>({id:'R'+i,word:w,groupId:correct.some(c=>normalize(c)===normalize(w))?g.id:'distractor'})),needed:correct.length};
}
function makeClusterRound(){
  const groups=[];
  while(groups.length<3){
    const g=randomGroup(groups.map(x=>x.id));
    if(!groups.find(x=>x.id===g.id)) groups.push(g);
  }
  const left=groups.map((g,i)=>({id:'L'+i,groupId:g.id,word:pickAnchor(g),label:g.label}));
  const right=[];
  groups.forEach((g,gi)=>{
    const anchor=left[gi].word;
    let terms=g.terms.filter(t=>normalize(t)!==normalize(anchor) && t.length<34);
    if(terms.length<2) terms=g.terms.filter(t=>normalize(t)!==normalize(anchor));
    sample(terms,2).forEach(t=>right.push({id:'R'+right.length,word:t,groupId:g.id}));
  });
  return {type:'cluster',groups,title:'三组同义替换',source:groups.map(g=>g.sourceId).join(' · '),left,right:shuffle(right),needed:right.length};
}
function renderRound(){
  current=makeRound();
  el('heroChinese').textContent=current.title;
  el('heroEyebrow').textContent = mode==='cluster' ? `PDF #${current.source} · 词簇归类` : `PDF #${current.source} · ${mode==='one'?'单选匹配':'单组匹配'}`;
  el('heroSub').textContent = mode==='cluster' ? '把右侧词分别连回 3 个正确词簇' : '从左侧词出发，连到右侧同义 / 替换词';
  el('boardTitle').innerHTML = mode==='cluster' ? '先点一个 <b>左侧锚点</b>，再给右侧词归类' : '先点 <b>左侧词</b>，再点右侧答案';
  el('feedback').className='feedback';el('feedback').textContent=' ';
  el('checkBtn').style.display='inline-block';el('nextBtn').style.display='none';
  renderCards();
  updateCounter();
  requestAnimationFrame(drawLines);
}
function renderCards(){
  const lc=el('leftCol'), rc=el('rightCol');
  lc.innerHTML='<div class="col-label">Anchor</div>';
  rc.innerHTML='<div class="col-label">Synonym / Replacement</div>';
  current.left.forEach(item=>{
    const d=document.createElement('div');
    d.className='card left-card';d.dataset.id=item.id;
    d.innerHTML=`<div class="anchor-wrap"><div class="word">${escapeHtml(item.word)}</div>${mode==='cluster'?`<div class="zh-mini">${escapeHtml(item.label)}</div>`:''}</div><span class="dot"></span>`;
    d.addEventListener('click',()=>selectLeft(item.id));
    lc.appendChild(d);
  });
  current.right.forEach(item=>{
    const d=document.createElement('div');
    d.className='card right-card';d.dataset.id=item.id;
    d.innerHTML=`<span class="dot"></span><div class="word">${escapeHtml(item.word)}</div>`;
    d.addEventListener('click',()=>selectRight(item.id));
    rc.appendChild(d);
  });
  if(current.left.length===1){ selectedLeft=current.left[0].id; document.querySelector(`[data-id="${selectedLeft}"]`)?.classList.add('selected'); }
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function selectLeft(id){
  if(checked)return;
  selectedLeft=id;
  document.querySelectorAll('.left-card').forEach(x=>x.classList.toggle('selected',x.dataset.id===id));
}
function selectRight(rid){
  if(checked)return;
  if(!selectedLeft){
    el('feedback').textContent='先点左边一个词～';return;
  }
  if(mode==='cluster'){
    links=links.filter(x=>x.rightId!==rid);
    links.push({leftId:selectedLeft,rightId:rid});
  }else{
    const existing=links.find(x=>x.rightId===rid);
    if(existing) links=links.filter(x=>x.rightId!==rid);
    else links.push({leftId:selectedLeft,rightId:rid});
  }
  markConnected();updateCounter();drawLines();
  if(mode==='one' && links.length===1) checkAnswer();
}
function markConnected(){
  document.querySelectorAll('.right-card').forEach(x=>x.classList.toggle('connected',links.some(l=>l.rightId===x.dataset.id)));
}
function updateCounter(){
  const n=links.length;
  const target= mode==='one'?1 : current.needed;
  el('roundCounter').textContent=`本轮 ${n}/${target}`;
}
function clearLinks(){
  if(checked)return;
  links=[];markConnected();updateCounter();drawLines();
}
function checkAnswer(){
  if(checked)return;
  if(mode==='cluster' && links.length<current.needed){
    el('feedback').textContent=`还有 ${current.needed-links.length} 个词没归类。`;return;
  }
  if(mode==='multi' && links.length===0){
    el('feedback').textContent='先连至少一个你认为正确的词。';return;
  }
  checked=true;
  let allGood=true, correctCount=0;
  const linkedRight=new Map(links.map(l=>[l.rightId,l.leftId]));
  current.right.forEach(r=>{
    const card=document.querySelector(`.right-card[data-id="${r.id}"]`);
    let ok=false, should=false;
    if(mode==='cluster'){
      should=true;
      const leftId=linkedRight.get(r.id);
      const left=current.left.find(l=>l.id===leftId);
      ok=!!left && left.groupId===r.groupId;
    }else{
      should=r.groupId===current.groups[0].id;
      const selected=linkedRight.has(r.id);
      ok=(selected && should) || (!selected && !should);
      if(should && selected) correctCount++;
      if(should && !selected) card?.classList.add('missed');
    }
    if(ok && linkedRight.has(r.id)) card?.classList.add('correct');
    if(!ok && linkedRight.has(r.id)) card?.classList.add('wrong');
    if(!ok) allGood=false;
  });
  // Mark paths
  links.forEach(l=>{
    const r=current.right.find(x=>x.id===l.rightId);
    const left=current.left.find(x=>x.id===l.leftId);
    l.correct = mode==='cluster' ? (left && r && left.groupId===r.groupId) : (r && r.groupId===current.groups[0].id);
  });
  drawLines();
  current.groups.forEach(g=>{
    if(!saved.seen.includes(g.id))saved.seen.push(g.id);
    if(!allGood && !saved.wrong.includes(g.id))saved.wrong.push(g.id);
    if(allGood) saved.wrong=saved.wrong.filter(id=>id!==g.id);
  });
  save();
  if(allGood){
    el('feedback').className='feedback good';
    el('feedback').textContent=mode==='cluster'?'全归对了。这个模式最接近阅读里真正的“替换识别”。':'全对 ✓';
  }else{
    el('feedback').className='feedback bad';
    el('feedback').textContent=mode==='multi' ? `这组有 ${current.needed} 个目标词；黄色是漏掉的，红色是误连。` : '有一处没归对，红色看误连。';
  }
  el('checkBtn').style.display='none';el('nextBtn').style.display='inline-block';
}
function drawLines(){
  const area=el('matchArea'), svg=el('lineSvg');
  const box=area.getBoundingClientRect();
  svg.setAttribute('viewBox',`0 0 ${box.width} ${box.height}`);
  svg.innerHTML='';
  links.forEach(l=>{
    const a=document.querySelector(`.left-card[data-id="${l.leftId}"] .dot`);
    const b=document.querySelector(`.right-card[data-id="${l.rightId}"] .dot`);
    if(!a||!b)return;
    const ra=a.getBoundingClientRect(), rb=b.getBoundingClientRect();
    const x1=ra.left+ra.width/2-box.left, y1=ra.top+ra.height/2-box.top;
    const x2=rb.left+rb.width/2-box.left, y2=rb.top+rb.height/2-box.top;
    const dx=Math.max(34,(x2-x1)*.46);
    const p=document.createElementNS('http://www.w3.org/2000/svg','path');
    p.setAttribute('d',`M ${x1} ${y1} C ${x1+dx} ${y1}, ${x2-dx} ${y2}, ${x2} ${y2}`);
    p.setAttribute('class','path'+(checked?(l.correct?' correct':' wrong'):''));
    svg.appendChild(p);
  });
}
function setMode(m){
  mode=m;saved.mode=m;save();
  document.querySelectorAll('.seg-btn').forEach(b=>b.classList.toggle('active',b.dataset.mode===m));
  renderRound();
}
document.querySelectorAll('.seg-btn').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
el('clearBtn').addEventListener('click',clearLinks);
el('checkBtn').addEventListener('click',checkAnswer);
el('nextBtn').addEventListener('click',renderRound);
el('reviewBtn').addEventListener('click',()=>{review=!review;save();renderRound()});
el('helpBtn').addEventListener('click',()=>el('helpModal').classList.add('show'));
el('closeHelp').addEventListener('click',()=>el('helpModal').classList.remove('show'));
el('helpModal').addEventListener('click',e=>{if(e.target===el('helpModal'))el('helpModal').classList.remove('show')});
el('resetBtn').addEventListener('click',()=>{
  if(confirm('清空本网页保存的练习进度和错题记录？')){saved.seen=[];saved.wrong=[];save();renderRound()}
});
window.addEventListener('resize',()=>requestAnimationFrame(drawLines));
window.addEventListener('keydown',e=>{
  if(e.key==='Enter'){ if(checked)renderRound(); else checkAnswer(); }
  if(e.key==='Escape')el('helpModal').classList.remove('show');
});
renderStats();
setMode(mode);
