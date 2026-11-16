/* CardNest SmartScan 3 — better photo OCR, Chinese recognition and card matching.
   Runs locally in the browser. Original card photos are not uploaded. */
(() => {
'use strict';
const $s=selector=>document.querySelector(selector);
const CJK=/[\u3400-\u9fff]/u;
const clean=text=>String(text||'').normalize('NFKC').replace(/[\u200b-\u200f]/g,'').trim();
const normalized=text=>clean(text).toLowerCase().replace(/[\s·•'".,，。:：!！、()\[\]【】_\-]/g,'');
const normNo=text=>clean(text).replace(/^0+(?=\d)/,'').toUpperCase();
const blocked=/^(basic|stage|pokemon|pokémon|trainer|item|supporter|ability|weakness|retreat|resistance|illustrator|attack|damage|evolves|energy|vstar|vmax|special|height|weight|no\.|基本|基礎|基础|進化|进化|招式|特性|弱點|弱点|撤退|抵抗|寶可夢|宝可梦|插畫|插画|身高|體重|体重|攻击|傷害|伤害|能量)/i;
let requestId=0, lastOCR=null;
const oldSearch=searchCards;
function fixDigits(text) {
 return clean(text).replace(/[oO○〇]/g,'0').replace(/[lI|]/g,'1').replace(/(?<=\d)[sS](?=\d)/g,'5');
}
function findNumber(text){
 const t=fixDigits(text);
 const fractions=[...t.matchAll(/(?:^|[^\d])(\d{1,4})\s*[/／\\]\s*(\d{1,4})(?!\d)/gm)];
 if(fractions.length){
   fractions.sort((a,b)=>Number(b[2])-Number(a[2]));
   return {local:fractions[0][1],total:fractions[0][2]};
 }
 const promo=t.match(/(?:^|[^\w])((?:SVP|SWSH|XY|SM|BW|DP)[-\s]?\d{1,4})(?!\w)/i);
 if(promo)return {local:promo[1].replace(/\s/g,''),total:''};
 return {local:'',total:''};
}
function readNames(reads){
 const candidates=[];
 for(const ocr of reads) {
  clean(ocr.text).split(/\r?\n/).slice(0,17).forEach((line,index)=>{
   let name=line.replace(/(?:HP\s*\d{2,3}|\d{2,3}\s*HP)/gi,'')
    .replace(/^(?:基本寶可夢|基本宝可梦|基本ポケモン|基本|基礎|基础|STAGE\s*[12]|BASIC)\s*/i,'')
    .replace(/[^\p{L}\p{M}0-9\s’'.+\-]/gu,' ').replace(/\s+/g,' ').trim()
    .replace(/^[\d\s./-]+/,'');
   if(!name||blocked.test(name)||/www\.|https?:|\/\d{2,}/i.test(name))return;
   const han=(name.match(/[\u3400-\u9fff]/g)||[]).length;
   const latin=(name.match(/[A-Za-z]/g)||[]).length;
   if(!((han>=2&&han<=12&&name.length<=24)||(latin>=3&&name.length<=34)))return;
   if(/^\d/.test(name)||/^(ex|gx|v|vmax|vstar|hp|lv|level|rare|energy)$/i.test(name))return;
   const score=ocr.weight+(index<3?7:0)+Math.min(han,6)*1.6+Math.min(latin,12)*.25-index*.8;
   candidates.push({name,score});
  });
 }
 const seen=new Set();
 return candidates.sort((a,b)=>b.score-a.score).filter(x=>{
  const key=normalized(x.name);if(seen.has(key))return false;seen.add(key);return true;
 });
}
function parseReads(top,bottom){
 const names=readNames(top),first=findNumber(bottom.map(x=>x.text).join('\n'));
 const number=first.local?first:findNumber(top.map(x=>x.text).join('\n'));
 return {name:names[0]?.name||'',alternatives:names.slice(1,4).map(x=>x.name),
  number:number.local,total:number.total,top,bottom};
}
async function decode(url){
 const img=new Image();img.src=url;
 if(img.decode)await img.decode().catch(()=>{});
 if(!img.complete||!img.naturalWidth)await new Promise((ok,fail)=>{
  img.onload=ok;img.onerror=()=>fail(Error('Could not open this image'));});
 if(!img.naturalWidth)throw Error('This image format cannot be read on your device');
 return img;
}
function orientation(img,degrees){
 const vertical=Math.abs(degrees)%180===90;
 const scale=Math.min(1,2400/Math.max(img.naturalHeight,img.naturalWidth));
 const w=Math.max(1,Math.round(img.naturalWidth*scale));
 const h=Math.max(1,Math.round(img.naturalHeight*scale));
 const c=document.createElement('canvas');
 c.width=vertical?h:w;c.height=vertical?w:h;
 const ctx=c.getContext('2d');if(!ctx)throw Error('Image processing unavailable');
 ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);
 ctx.translate(c.width/2,c.height/2);ctx.rotate(degrees*Math.PI/180);
 ctx.drawImage(img,-w/2,-h/2,w,h);return c;
}
function crop(image,x,y,w,h,enhance=true){
 const sx=image.width*x,sy=image.height*y,sw=image.width*w,sh=image.height*h;
 const c=document.createElement('canvas');
 c.width=Math.min(1750,Math.max(650,Math.round(sw*1.65)));
 c.height=Math.max(100,Math.round(c.width*sh/sw));
 const ctx=c.getContext('2d');if(!ctx)throw Error('Canvas unavailable');
 if(enhance)ctx.filter='grayscale(1) contrast(1.7) brightness(1.10)';
 ctx.drawImage(image,sx,sy,sw,sh,0,0,c.width,c.height);return c;
}
function status(message){const e=$s('#scan-status');if(e)e.textContent=message;}
async function workerFor(language){
 const langs=language==='en'?['eng']:language==='zh-cn'?['chi_sim','eng']:['chi_tra','eng'];
 return window.Tesseract.createWorker(langs,1,{logger:m=>{
  if(m.status==='loading tesseract core'||m.status==='loading language traineddata')
    status('Downloading recognition models. The first scan can take a little longer…');
 }});
}
async function doOCR(worker,image,message,psm='6',numbersOnly=false){
 status(message);
 await worker.setParameters({tessedit_pageseg_mode:psm,
  tessedit_char_whitelist:numbersOnly?'0123456789/\\-ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz ':''});
 const r=await worker.recognize(image);
 return {text:String(r?.data?.text||''),confidence:Number(r?.data?.confidence||0)};
}
async function multiPass(worker,img,label,fast=false){
 const top=[],bottom=[];
 top.push({...await doOCR(worker,crop(img,.035,.015,.93,.29),'Reading card name ('+label+' view)…'),weight:15});
 bottom.push(await doOCR(worker,crop(img,.02,.67,.96,.32),'Reading collector number…','11',true));
 let found=parseReads(top,bottom);
 if(!found.name){
  top.push({...await doOCR(worker,crop(img,.055,.03,.89,.17,false),'Trying another name-reading method…','7'),weight:24});
  found=parseReads(top,bottom);
 }
 if(!found.number&&!fast){
  bottom.push(await doOCR(worker,crop(img,.03,.83,.94,.16,false),'Checking the printed number again…','11',true));
  found=parseReads(top,bottom);
 }
 return found;
}
function bestRead(readings){
 return readings.slice().sort((a,b)=>{
  const score=x=>(x.name?30:0)+(x.number?28:0)+(x.total?8:0)+(x.top[0]?.confidence||0)*.1;
  return score(b)-score(a);
 })[0];
}
function showExtracted(parsed){
 $s('#scan-name').value=parsed.name||'';
 $s('#scan-number').value=parsed.number?(parsed.number+(parsed.total?'/'+parsed.total:'')):'';
 const raw=$s('#scan-ocr-raw'),details=$s('#scan-ocr-details');
 raw.textContent='CARD NAME / HEADER:\n'+parsed.top.map(x=>x.text.trim()).filter(Boolean).join('\n--- alternate read ---\n')
   +'\n\nCARD NUMBER / FOOTER:\n'+parsed.bottom.map(x=>x.text.trim()).filter(Boolean).join('\n--- alternate read ---\n');
 details.hidden=false;
}
recognizePhoto=async function(){
 if(!state.photoFile)return;
 const btn=$s('#recognize-button'),original=state.photoFile;
 btn.disabled=true;
 let worker=null;
 try {
  $s('#scan-results').replaceChildren();
  status('Optimizing the card photo…');
  await loadOCRScript();
  const image=await decode(state.photoUrl),regular=orientation(image,0);
  const choice=$s('#scan-language').value;
  worker=await workerFor(choice);
  const passes=[await multiPass(worker,regular,'the')];
  // A card may occupy only the center of a photo, not its full frame.
  if(!passes[0].name||!passes[0].number){
   const center=crop(regular,.13,.095,.74,.81,false);
   passes.push(await multiPass(worker,center,'centered',true));
  }
  // Automatic orientation correction for a sideways photograph.
  if(!passes.some(p=>p.name||p.number)&&image.naturalWidth>image.naturalHeight*1.06){
   passes.push(await multiPass(worker,orientation(image,90),'rotated',true));
   if(!passes[1].name&&!passes[1].number)
    passes.push(await multiPass(worker,orientation(image,-90),'alternate rotation',true));
  }
  // Auto does not load three large Chinese models simultaneously on iPhones.
  const recognizedChinese=passes.some(p=>p.name&&CJK.test(p.name));
  const readableEnglish=passes.some(p=>p.name&&/[A-Za-z]{3}/.test(p.name)&&(p.number||p.top[0]?.confidence>=55));
  if(choice==='auto'&&!recognizedChinese&&!readableEnglish){
   await worker.terminate();worker=null;
   status('Checking Simplified Chinese text…');
   worker=await workerFor('zh-cn');
   passes.push(await multiPass(worker,regular,'Simplified Chinese',true));
  }
  if(original!==state.photoFile)return;
  const parsed=bestRead(passes);lastOCR=parsed;showExtracted(parsed);
  if(parsed.name||parsed.number){
   status('Read '+(parsed.name?'“'+parsed.name+'”':'a card number')
     +(parsed.number?' · #'+parsed.number:'')+'. Finding possible prints — check the artwork.');
   await searchCards('scan',parsed.name,$s('#scan-number').value);
  } else {
   status('Still cannot read this card. Try Rotate photo, or take a closer, glare-free picture. Search by the collector number below if needed.');
   toast('No readable name or number. Try a clearer photo.','error');
  }
 }catch(e){
  status('Scan could not finish: '+String(e.message||e)+'. Try another photo or manual number search.');
  toast('Card scan failed. Manual search is still available.','error');
 }finally{
  if(worker)try{await worker.terminate()}catch{}
  btn.disabled=false;
 }
};
function compareNames(a,b){
 const aa=Array.from(normalized(a)),bb=Array.from(normalized(b));
 if(!aa.length||!bb.length)return 0;
 if(aa.join('')===bb.join(''))return 1;
 if(aa.join('').includes(bb.join(''))||bb.join('').includes(aa.join('')))return .85;
 const dist=Array.from({length:bb.length+1},(_,j)=>Array.from({length:aa.length+1},(_,i)=>j?i?0:j:i));
 for(let j=1;j<=bb.length;j++)for(let i=1;i<=aa.length;i++)
  dist[j][i]=Math.min(dist[j-1][i]+1,dist[j][i-1]+1,dist[j-1][i-1]+(aa[i-1]===bb[j-1]?0:1));
 return Math.max(0,1-dist[bb.length][aa.length]/Math.max(aa.length,bb.length));
}
function matchRank(card,name,number){
 const nameScore=name?compareNames(card.name,name):0;
 const exactNumber=number&&normNo(card.localId)===normNo(number);
 return (exactNumber?100:0)+(nameScore*85)+(nameScore>.92?22:0);
}
function termsOf(name){
 const text=clean(name),han=(text.match(/[\u3400-\u9fff]/g)||[]).join('');
 if(han.length>=4)return [text,han.slice(0,han.length-2)];
 if(han.length>=3)return [text,han.slice(0,2)];
 const word=text.split(/\s+/)[0];
 if(word?.length>=7)return [text,word.slice(0,5)];
 return [text];
}
async function searchLanguage(lang,name,num){
 const result=[],attempted=new Set();
 async function query(field,val,max){
  const key=field+':'+val;if(!val||attempted.has(key))return [];
  attempted.add(key);
  return findCatalogCards(lang,field,val,max);
 }
 if(name){
  let found=await query('name',name,230);
  result.push(...found);
  if(!found.length){
   const terms=termsOf(name);
   if(terms[1])result.push(...await query('name',terms[1],180));
  }
 }
 if(num){
  // Use strict equality, not the catalog's default substring search. Without
  // eq: the common number 025 also matches thousands of other collector IDs.
  const ids=[num];
  if(/^\d+$/.test(num)){
   const base=String(Number(num));
   ids.push(base,base.padStart(2,'0'),base.padStart(3,'0'),base.padStart(4,'0'));
  }
  const variants=[...new Set(ids)];
  let found=await query('localId','eq:'+variants.join('|'),500);
  // TCGdex supports OR filters, but retry single exact matches if a backend
  // version doesn't parse multiple values.
  if(!found.length){
   for(const id of variants.slice(0,3)){
    const exact=await query('localId','eq:'+id,500);
    found.push(...exact);if(exact.length)break;
   }
  }
  result.push(...found.filter(x=>normNo(x.localId)===normNo(num)));
 }
 const seen=new Set();
 return result.filter(x=>{
  if(!x?.id||seen.has(x.id))return false;seen.add(x.id);x.lang=lang;return true;
 });
}
searchCards=async function(type,name,rawNumber=''){
 if(type!=='scan')return oldSearch(type,name,rawNumber);
 const target=$s('#scan-results'),query=clean(name),num=clean(rawNumber).split(/[/／\\]/)[0].trim();
 if(!query&&!num){toast('Enter a card name or collector number.','error');return;}
 const current=++requestId;
 target.innerHTML='<div class="loading-results"><span class="spinner"></span> Comparing card names and collector numbers across catalogs…</div>';
 const choice=$s('#scan-language')?.value||'auto';
 const langs=choice==='auto'?(CJK.test(query)?['zh-tw','zh-cn']:['en','zh-tw','zh-cn']):[choice];
 try{
  const outcomes=await Promise.allSettled(langs.map(lang=>searchLanguage(lang,query,num)));
  if(current!==requestId)return;
  const cards=[],seen=new Set();
  let failures=0;
  outcomes.forEach(x=>{
   if(x.status==='rejected'){failures++;return;}
   x.value.forEach(card=>{const key=card.lang+':'+card.id;if(!seen.has(key)){seen.add(key);cards.push(card);}});
  });
  if(failures===langs.length)throw Error('Card catalog not reachable');
  // OCR often guesses the wrong first line. If there are no matches, retry
  // up to two alternative name candidates from the photo.
  const alternatives=(lastOCR?.name===query?lastOCR.alternatives:[])||[];
  if(!cards.length&&alternatives.length){
   for(const otherName of alternatives.slice(0,2)){
    const fallbacks=await Promise.allSettled(langs.map(lang=>searchLanguage(lang,otherName,num)));
    fallbacks.forEach(out=>{
     if(out.status!=='fulfilled')return;
     out.value.forEach(card=>{
      const key=card.lang+':'+card.id;
      if(!seen.has(key)){seen.add(key);cards.push(card);}
     });
    });
    if(cards.length)break;
   }
  }
  const rating=card=>Math.max(matchRank(card,query,num),
    ...alternatives.map(alt=>matchRank(card,alt,num)));
  cards.sort((a,b)=>rating(b)-rating(a));
  state.results.scan=cards;state.resultViews.scan=20;state.queries.scan=query;
  renderResults('scan');
  cards.slice(0,3).forEach((card,index)=>{
   const score=rating(card);
   if(score<100)return;
   const frame=$s('#scan-results .card-grid')?.children[index]?.querySelector('.card-image-frame');
   if(!frame)return;
   const badge=document.createElement('span');badge.className='smart-match-badge';
   badge.textContent=score>=180?'Name + number match':'Number match';frame.append(badge);
  });
  if(failures)toast('Some regional catalogs were unavailable. Showing available matches.');
  if(!cards.length)status('No catalog match. Try another language or the number on your card; some regional prints are not yet listed.');
 }catch(error){
  if(current!==requestId)return;
  target.innerHTML='<div class="empty-results"><span>!</span><h3>Catalog unavailable</h3><p>Please check your connection and try again.</p><button class="btn btn-outline" id="smart-retry">Retry</button></div>';
  $s('#smart-retry').onclick=()=>searchCards('scan',query,rawNumber);
 }
};
function addControls(){
 const row=$s('.scan-controls');
 if(!row||$s('#rotate-photo'))return;
 const btn=document.createElement('button');btn.type='button';btn.id='rotate-photo';
 btn.className='btn btn-outline smart-rotate';btn.textContent='↻ Rotate photo';
 btn.title='Rotate your photo 90° clockwise';btn.disabled=true;row.append(btn);
 const before=setPhoto;
 setPhoto=function(file){
  const result=before(file);btn.disabled=!state.photoFile;lastOCR=null;return result;
 };
 if(state.photoFile)btn.disabled=false;
 btn.onclick=async()=>{
  if(!state.photoFile)return;btn.disabled=true;
  try{
   const img=await decode(state.photoUrl),canvas=orientation(img,90);
   const blob=await new Promise((ok,fail)=>canvas.toBlob(b=>b?ok(b):fail(Error('Rotation unavailable')),'image/jpeg',.94));
   setPhoto(new File([blob],'rotated-pokemon-card.jpg',{type:'image/jpeg'}));
   status('Photo rotated. Tap Read card text to scan it again.');
  }catch(e){toast('Could not rotate: '+e.message,'error');}
  finally{btn.disabled=!state.photoFile;}
 };
 const guide=$s('.scan-info');
 if(guide&&!$s('#smart-guide')){
  const info=document.createElement('div');info.id='smart-guide';info.className='smart-guide';
  const heading=document.createElement('strong');heading.textContent='SmartScan 3.0';
  const caption=document.createElement('span');caption.textContent='Multiple OCR passes, Chinese text, collector-number matching, and sideways-photo recovery.';
  info.append(heading,caption);guide.prepend(info);
 }
}
document.addEventListener('DOMContentLoaded',addControls);
})();