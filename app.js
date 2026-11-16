/* CardNest: static, browser-local Pokémon TCG collection MVP. No secret API keys. */
'use strict';
const API_ROOT = 'https://api.tcgdex.net/v2';
const API = `${API_ROOT}/en`;
const LANGUAGE_NAMES = {'en':'English', 'zh-tw':'Chinese (Traditional)', 'zh-cn':'Chinese (Simplified)'};
const apiFor = lang => `${API_ROOT}/${LANGUAGE_NAMES[lang]?lang:'en'}`;
const STORAGE_KEY = 'cardnest_collection_v1';
const $ = (q,scope=document)=>scope.querySelector(q);
const $$ = (q,scope=document)=>Array.from(scope.querySelectorAll(q));
const esc = s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = val => (val===null||val===undefined||String(val).trim()==='') ? null : Number.isFinite(Number(val)) ? Number(val) : null;
const money = val => Number.isFinite(val) ? new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(val) : '—';
const niceDate = str => {const num=typeof str==='number'?str:null;const date=new Date(num===null?str:(num<1e11?num*1000:num));return Number.isFinite(date.getTime())?date.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'Unknown';};
const cardImage = (c,quality='low') => c?.image ? `${c.image}/${quality}.webp` : '';
const blankImage = '<span class="no-card-image">✧</span>';
const imageHTML=(c,quality='low')=>cardImage(c,quality)?`<img loading="lazy" src="${esc(cardImage(c,quality))}" alt="${esc(c.name||'Trading card')}">`:blankImage;
const state={page:'home',collection:loadCollection(),results:{explore:[],scan:[]},queries:{explore:'',scan:''},resultViews:{explore:20,scan:20},cardCache:new Map(),fx:null,fxDate:null,detail:null,editId:null,photoFile:null,recognitionLoaded:false,searching:false,detailLang:'en'};
function loadCollection(){try{const x=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');return Array.isArray(x)?x.filter(v=>v&&typeof v.id==='string'&&typeof v.cardId==='string').slice(0,5000):[];}catch{return[];}}
function saveCollection(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state.collection));}catch{toast('Storage is full or blocked. Please export your collection.','error');}renderStats(); if(state.page==='collection') renderCollection();}
function toast(message,type='normal'){const el=document.createElement('div');el.className=`toast ${type==='error'?'error':''}`;el.textContent=message;$('#toast-stack').append(el);setTimeout(()=>el.remove(),4400);}
function nav(page){if(!['home','scan','explore','collection','settings'].includes(page)) page='home';state.page=page;$$('.page').forEach(x=>x.classList.toggle('active',x.id===`page-${page}`));$$('[data-nav]').forEach(x=>{x.classList.toggle('active',x.dataset.nav===page);x.classList.toggle('selected',x.dataset.nav===page)});$('#page-breadcrumb').textContent=({home:'Overview',scan:'Card scanner',explore:'Explore cards',collection:'My collection',settings:'Settings'})[page];history.replaceState(null,'',`#${page}`);window.scrollTo({top:0,behavior:'instant'});if(page==='collection')renderCollection();}
function renderStats(){let sum=0,count=0,priced=0,top=null;const uniques=new Set();for(const c of state.collection){const q=Math.max(0,Number(c.quantity)||0);count+=q;uniques.add(`${c.lang||'en'}:${c.cardId}`);if(Number.isFinite(c.gbpPrice)){const value=c.gbpPrice*q;sum+=value;priced+=q;if(!top||c.gbpPrice>top.gbpPrice)top=c;}}$('#home-cardcount').textContent=count;$('#home-unique').textContent=uniques.size;$('#nav-count').textContent=count;$('#home-total').textContent=money(sum);$('#home-top').textContent=top?money(top.gbpPrice):'—';$('#home-topname').textContent=top?.name||'No priced cards yet';$('#collection-value').textContent=money(sum);$('#collection-priced-note').textContent=`${priced} of ${count} cards have available reference prices · unpriced cards excluded`;}
async function getJSON(url){const response=await fetch(url,{headers:{Accept:'application/json'}});if(!response.ok)throw new Error(`Card service returned HTTP ${response.status}`);return response.json();}
async function exchangeRates(){try{let data;try{data=await getJSON('https://api.frankfurter.dev/v1/latest?base=EUR&symbols=GBP,USD');}catch{data=await getJSON('https://api.frankfurter.app/latest?from=EUR&to=GBP,USD');}const eur=Number(data?.rates?.GBP),usd=Number(data?.rates?.USD);if(!eur||!usd)throw Error('Incomplete rates');state.fx={EUR:eur,USD:eur/usd};state.fxDate=data.date||null;$('#fx-status').textContent=`GBP conversion based on exchange-rate data dated ${state.fxDate||'latest available'}. Sources may not reflect your bank or sale rate.`;updateVisiblePrices();}catch{$('#fx-status').textContent='GBP conversion temporarily unavailable. Original USD/EUR prices may still show on card details.';}}
function variantChoices(card){const v=card?.variants||{};const arr=[];if(v.normal)arr.push(['normal','Normal']);if(v.holo)arr.push(['holo','Holofoil']);if(v.reverse)arr.push(['reverse','Reverse holo']);if(v.firstEdition)arr.push(['first','1st edition']);if(!arr.length)return [['normal','Standard']];return arr;}
function selectQuote(card,variant){const cm=card?.pricing?.cardmarket||{};const tcg=card?.pricing?.tcgplayer||{};let entries=[];if(variant==='normal'){
 if(Number.isFinite(number(cm.trend)))entries.push({source:'Cardmarket',unit:'EUR',value:number(cm.trend),asOf:cm.updated,basis:'Trend price'});
 if(Number.isFinite(number(cm.avg)))entries.push({source:'Cardmarket',unit:'EUR',value:number(cm.avg),asOf:cm.updated,basis:'Average sale'});
 for(const key of ['normal','unlimited'])if(Number.isFinite(number(tcg[key]?.marketPrice)))entries.push({source:'TCGplayer',unit:'USD',value:number(tcg[key].marketPrice),asOf:tcg.updated,basis:'Market price'});
 }else if(variant==='holo'){
 if(Number.isFinite(number(cm['trend-holo'])))entries.push({source:'Cardmarket',unit:'EUR',value:number(cm['trend-holo']),asOf:cm.updated,basis:'Foil trend price'});
 for(const key of ['holofoil','unlimited-holofoil'])if(Number.isFinite(number(tcg[key]?.marketPrice)))entries.push({source:'TCGplayer',unit:'USD',value:number(tcg[key].marketPrice),asOf:tcg.updated,basis:'Holofoil market price'});
 }else if(variant==='reverse'){
 for(const key of ['reverse-holofoil','reverse'])if(Number.isFinite(number(tcg[key]?.marketPrice)))entries.push({source:'TCGplayer',unit:'USD',value:number(tcg[key].marketPrice),asOf:tcg.updated,basis:'Reverse holo market price'});
 }else if(variant==='first'){
 for(const key of ['1st-edition','1st-edition-holofoil'])if(Number.isFinite(number(tcg[key]?.marketPrice)))entries.push({source:'TCGplayer',unit:'USD',value:number(tcg[key].marketPrice),asOf:tcg.updated,basis:'1st edition market price'});
 }
 const result=entries[0];if(!result)return null;
 const rate=state.fx?.[result.unit];return {...result,gbp:rate?result.value*rate:null,rateDate:state.fxDate};
}
function updateVisiblePrices(){if(state.detail){updateModalQuote();}renderStats();if(state.page==='collection')renderCollection();}
function quoteHTML(quote){if(!quote)return `<span class="price-label">ESTIMATED MARKET VALUE</span><strong>Price unavailable</strong><small>No reliable price for this specific card finish. You can still save it to your collection.</small>`;let display=Number.isFinite(quote.gbp)?money(quote.gbp):`${quote.unit==='EUR'?'€':'$'}${quote.value.toFixed(2)}`;const date=quote.asOf?niceDate(quote.asOf):'date not provided';return `<span class="price-label">REFERENCE MARKET VALUE</span><strong>${esc(display)}</strong><small>${esc(quote.source)} · ${esc(quote.basis)} · Data: ${esc(date)}</small><small>${Number.isFinite(quote.gbp)?'Converted to GBP. This is not a UK sold-price quote.':'GBP conversion unavailable. Original quote shown.'} No grading or condition adjustment.</small>`;}
// Catalogs are language-specific. A Chinese print must never be assumed to be
// the same card as a similarly numbered English print.
function normalizeCardNumber(n){return String(n||'').normalize('NFKC').trim().replace(/^0+(?=\d)/,'').toLowerCase();}
function selectedLanguages(type,query){
 const choice=$(`#${type}-language`)?.value||'en';
 if(choice!=='auto')return [choice];
 const chinese=/[\p{Script=Han}]/u.test(query);
 return chinese?['zh-tw','zh-cn']:['en','zh-tw','zh-cn'];
}
async function findCatalogCards(language,field,value,limit=150){
 const params=new URLSearchParams();params.set(field,value);params.set('pagination:page','1');params.set('pagination:itemsPerPage',String(limit));
 const data=await getJSON(`${apiFor(language)}/cards?${params}`);
 if(!Array.isArray(data))throw Error('Unexpected catalog response');
 return data.map(card=>({...card,lang:language}));
}
async function searchCards(type,query,localId=''){
 const target=$(`#${type}-results`),cleaned=String(query||'').trim(),num=String(localId||'').trim().split(/[\/／]/)[0].trim();
 if(!cleaned&&!num){toast('Enter a card name or collector number to search.','error');return;}
 const searchToken=Symbol();state[`${type}Token`]=searchToken;
 target.innerHTML='<div class="loading-results"><span class="spinner"></span> Finding the exact card in the selected language catalog...</div>';
 state.queries[type]=cleaned;const langs=selectedLanguages(type,cleaned);
 try{
  // Search by name, then by card number when OCR is imperfect. Chinese and
  // Western card pools use separate IDs; keep the language with every result.
  const searches=await Promise.allSettled(langs.map(async lang=>{
   let cards=[];
   if(cleaned){
    cards=await findCatalogCards(lang,'name',cleaned,150);
    if(num){const exact=cards.filter(c=>normalizeCardNumber(c.localId)===normalizeCardNumber(num));if(exact.length)cards=exact;}
   }
   if(num && (cards.length===0||!cards.some(c=>normalizeCardNumber(c.localId)===normalizeCardNumber(num)))){
    const byNum=await findCatalogCards(lang,'localId',num,130);
    const exact=byNum.filter(c=>normalizeCardNumber(c.localId)===normalizeCardNumber(num));
    cards=cleaned?[...cards,...exact]:exact;
   }
   return cards;
  }));
  if(state[`${type}Token`]!==searchToken)return;
  const cards=[],seen=new Set();let failures=0;
  for(const result of searches){if(result.status==='rejected'){failures++;continue;}for(const card of result.value){const key=`${card.lang}:${card.id}`;if(!seen.has(key)){seen.add(key);cards.push(card);}}}
  if(failures===langs.length)throw Error('The card catalogs could not be reached. Please try again.');
  // Good number matches rank first, but keep other possible name matches when
  // the photograph has an incorrect or ambiguous collector number.
  if(num)cards.sort((a,b)=>Number(normalizeCardNumber(b.localId)===normalizeCardNumber(num))-Number(normalizeCardNumber(a.localId)===normalizeCardNumber(num)));
  state.results[type]=cards;state.resultViews[type]=20;renderResults(type);
  if(failures&&cards.length)toast('Some language catalogs were unavailable; showing the matches we found.');
 }catch(e){if(state[`${type}Token`]!==searchToken)return;target.innerHTML=`<div class="empty-results"><span>!</span><h3>Card catalog unavailable</h3><p>${esc(e.message)} Check your connection and try again.</p><button class="btn btn-outline" id="retry-${type}">Try again</button></div>`;const retry=$(`#retry-${type}`);if(retry)retry.onclick=()=>searchCards(type,cleaned,num);}
}
function renderResults(type){
 const target=$(`#${type}-results`),cards=state.results[type]||[],shown=cards.slice(0,state.resultViews[type]);
 if(!cards.length){target.innerHTML='<div class="empty-results"><span>⌕</span><h3>No exact match found yet</h3><p>Try switching Chinese language, searching only the number at the bottom of your card, or entering a shorter name. Catalog coverage varies by region.</p></div>';return;}
 target.innerHTML=`<div class="results-header"><div><h3>Possible matches — confirm the artwork</h3><p>${cards.length} results · showing ${shown.length}. Check the language, card number and set before saving.</p></div></div><div class="card-grid">${shown.map(c=>`<button class="browse-card" data-cardid="${esc(c.id)}" data-cardlang="${esc(c.lang||'en')}" aria-label="View ${esc(c.name)} number ${esc(c.localId)}"><div class="card-image-frame">${imageHTML(c)}</div><strong>${esc(c.name)}</strong><small>${esc(LANGUAGE_NAMES[c.lang]||'English')} · #${esc(c.localId)}</small><div class="card-indicator">View details ↗</div></button>`).join('')}</div>${shown.length<cards.length?`<button class="btn btn-outline load-more" data-loadmore="${type}">Show more cards ↓</button>`:''}`;
}
async function fetchCard(id,force=false,lang='en'){
 const language=LANGUAGE_NAMES[lang]?lang:'en', key=`${language}:${id}`;
 if(!force&&state.cardCache.has(key))return state.cardCache.get(key);
 const card=await getJSON(`${apiFor(language)}/cards/${encodeURIComponent(id)}`);
 if(!card?.id)throw Error('Card record not available in this language');
 state.cardCache.set(key,card);return card;
}
function openModal(){const modal=$('#card-modal');modal.hidden=false;document.body.style.overflow='hidden';$('#modal-body').innerHTML='<div class="loading-results" style="padding:60px"><span class="spinner"></span> Loading card details & prices...</div>';}
function closeModal(){const modal=$('#card-modal');modal.hidden=true;document.body.style.overflow='';state.detail=null;state.editId=null;}
async function showCard(id,editId=null,lang='en'){state.detail=null;state.detailLang=lang;state.editId=editId;openModal();try{const card=await fetchCard(id,false,lang);if($('#card-modal').hidden)return;state.detail=card;const existing=editId?state.collection.find(c=>c.id===editId):null;const choices=variantChoices(card);const selected=existing?.variant&&choices.some(c=>c[0]===existing.variant)?existing.variant:choices[0][0];const options=choices.map(([v,label])=>`<option value="${esc(v)}" ${selected===v?'selected':''}>${esc(label)}</option>`).join('');const cond=existing?.condition||'NM';$('#modal-body').innerHTML=`<div class="modal-content"><div class="modal-card-art">${imageHTML(card,'high')}</div><div class="modal-details"><span class="eyebrow">${esc(card.rarity||'POKÉMON TCG')}</span><h2 id="modal-title">${esc(card.name)}</h2><p class="modal-subhead">${esc(card.set?.name||'Unknown set')} · #${esc(card.localId)} · ${esc(LANGUAGE_NAMES[state.detailLang]||'English')}${card.illustrator?` · Art by ${esc(card.illustrator)}`:''}</p><div class="price-box" id="modal-price"></div><form id="modal-form" class="modal-form"><label>Card finish<select name="variant" id="variant-picker">${options}</select></label><label>Condition<select name="condition"><option value="NM" ${cond==='NM'?'selected':''}>Near Mint</option><option value="LP" ${cond==='LP'?'selected':''}>Lightly Played</option><option value="MP" ${cond==='MP'?'selected':''}>Moderately Played</option><option value="HP" ${cond==='HP'?'selected':''}>Heavily Played</option><option value="DMG" ${cond==='DMG'?'selected':''}>Damaged</option></select></label><label>Quantity<input type="number" name="quantity" min="1" max="999" step="1" required value="${Math.max(1,Number(existing?.quantity)||1)}"></label><label>Paid per card (£, optional)<input type="number" name="paid" min="0" step="0.01" placeholder="0.00" value="${existing?.paid!=null?esc(existing.paid):''}"></label><label class="full">Notes (optional)<input type="text" maxlength="200" name="notes" placeholder="Where you pulled it, trade details..." value="${esc(existing?.notes||'')}"></label><button class="btn btn-primary modal-add" type="submit">${existing?'Save changes':'＋ Add to my collection'}</button></form><p class="modal-note">Values are reference prices for the selected finish; condition can substantially change the actual resale value.</p></div></div>`;$('#variant-picker').onchange=updateModalQuote;$('#modal-form').onsubmit=onSaveCard;updateModalQuote();}catch(e){$('#modal-body').innerHTML=`<div class="empty-results" style="margin:30px"><span>!</span><h3>Couldn't load card details</h3><p>${esc(e.message)}. Please try again shortly.</p></div>`;}}
function updateModalQuote(){if(!state.detail||!$('#modal-price'))return;const variant=$('#variant-picker')?.value||'normal';$('#modal-price').innerHTML=quoteHTML(selectQuote(state.detail,variant));}
function onSaveCard(event){event.preventDefault();if(!state.detail)return;const fd=new FormData(event.currentTarget);const qty=Number(fd.get('quantity'));if(!Number.isSafeInteger(qty)||qty<1||qty>999){toast('Quantity must be between 1 and 999.','error');return;}const rawPaid=String(fd.get('paid')??'').trim(),paid=rawPaid===''?null:Number(rawPaid);if(paid!==null&&(!Number.isFinite(paid)||paid<0)){toast('Enter a valid purchase price.','error');return;}const c=state.detail,variant=String(fd.get('variant')),quote=selectQuote(c,variant),now=new Date().toISOString();const existing=state.editId?state.collection.find(x=>x.id===state.editId):null;
const item={id:existing?.id||(globalThis.crypto?.randomUUID?.()||`item-${Date.now()}-${Math.random().toString(36).slice(2)}`),cardId:c.id,lang:state.detailLang,name:c.name,image:c.image||null,setName:c.set?.name||'',number:c.localId,rarity:c.rarity||'',variant,condition:String(fd.get('condition')),quantity:qty,paid,notes:String(fd.get('notes')||'').trim().slice(0,200),gbpPrice:Number.isFinite(quote?.gbp)?quote.gbp:null,sourcePrice:quote?.value??null,sourceCurrency:quote?.unit??null,source:quote?.source??null,priceAsOf:quote?.asOf??null,updatedAt:now,createdAt:existing?.createdAt||now};
if(existing){Object.assign(existing,item);}else{const duplicate=state.collection.find(x=>x.cardId===item.cardId&&(x.lang||'en')===item.lang&&x.variant===item.variant&&x.condition===item.condition&&x.paid===item.paid);if(duplicate){duplicate.quantity+=item.quantity;duplicate.updatedAt=now;duplicate.gbpPrice=item.gbpPrice;duplicate.sourcePrice=item.sourcePrice;duplicate.sourceCurrency=item.sourceCurrency;duplicate.source=item.source;duplicate.priceAsOf=item.priceAsOf;}else state.collection.unshift(item);}saveCollection();closeModal();toast(existing?'Card updated in your binder.':'Card added to your collection!');}
function collectionCards(){const q=$('#collection-query')?.value.trim().toLowerCase()||'';let arr=state.collection.filter(c=>[c.name,c.setName,c.number,c.variant].some(x=>String(x||'').toLowerCase().includes(q)));const sort=$('#collection-sort')?.value||'recent';if(sort==='value')arr.sort((a,b)=>(b.gbpPrice||0)*b.quantity-(a.gbpPrice||0)*a.quantity);if(sort==='name')arr.sort((a,b)=>a.name.localeCompare(b.name));if(sort==='quantity')arr.sort((a,b)=>b.quantity-a.quantity);if(sort==='recent')arr.sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));return arr;}
function renderCollection(){const target=$('#collection-results');if(!state.collection.length){target.innerHTML=`<div class="empty-results collection-empty"><span>▤</span><h3>Your binder is waiting.</h3><p>Add your first Pokémon card by scanning a photo or browsing the catalog.</p><button class="btn btn-primary" data-nav="explore">Find your first card →</button></div>`;return;}const results=collectionCards();if(!results.length){target.innerHTML='<div class="empty-results"><span>⌕</span><h3>No matching cards in your binder</h3><p>Try clearing the search field.</p></div>';return;}target.innerHTML=results.map(c=>`<div class="collection-row"><div class="collection-thumb">${imageHTML(c)}</div><div class="collection-main"><strong>${esc(c.name)}</strong><p>${esc(c.setName)} · #${esc(c.number)} · ${esc(LANGUAGE_NAMES[c.lang||'en']||'English')}</p><div class="chips"><span>${esc(c.variant)}</span><span>${esc(c.condition)}</span><span>×${Number(c.quantity)||1}</span></div></div><div class="collection-price"><strong>${Number.isFinite(c.gbpPrice)?money(c.gbpPrice*c.quantity):'—'}</strong><small>${Number.isFinite(c.gbpPrice)?`${money(c.gbpPrice)} each`:'No price available'}</small></div><div class="collection-actions"><button class="icon-btn" data-editid="${esc(c.id)}" aria-label="Edit ${esc(c.name)}">✎</button><button class="icon-btn" data-deleteid="${esc(c.id)}" aria-label="Remove ${esc(c.name)}">×</button></div></div>`).join('');}
async function refreshPrices(){
 if(!state.collection.length){toast('Your binder is empty.');return;}
 const button=$('#refresh-prices');button.disabled=true;
 const uniq=[...new Set(state.collection.map(c=>`${c.lang||'en'}|${c.cardId}`))];
 let done=0,updated=0,failed=0;button.textContent='Updating...';const queue=uniq.slice();
 async function worker(){while(queue.length){const key=queue.shift(),sep=key.indexOf('|'),lang=key.slice(0,sep),id=key.slice(sep+1);try{
  const card=await fetchCard(id,true,lang);
  for(const c of state.collection.filter(x=>x.cardId===id&&(x.lang||'en')===lang)){
   const quote=selectQuote(card,c.variant);c.gbpPrice=Number.isFinite(quote?.gbp)?quote.gbp:null;c.sourcePrice=quote?.value??null;c.sourceCurrency=quote?.unit??null;c.source=quote?.source??null;c.priceAsOf=quote?.asOf??null;c.updatedAt=new Date().toISOString();updated++;
  }
 }catch{failed++;}done++;button.textContent=`Updating ${done}/${uniq.length}`;}}
 try{await Promise.all(Array.from({length:Math.min(3,uniq.length)},worker));saveCollection();toast(`${updated} card entries refreshed${failed?`; ${failed} lookups failed`:''}.`);}finally{button.disabled=false;button.textContent='↻ Update prices';}
}
function saveFile(filename,content,type){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function exportJSON(){saveFile(`cardnest-backup-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify({app:'CardNest',version:1,exportedAt:new Date().toISOString(),cards:state.collection},null,2),'application/json');toast('Collection backup downloaded.');}
function csvSafe(x){let s=String(x??'');if(/^[=+@-]/.test(s))s="'"+s;return `"${s.replace(/"/g,'""')}"`;}
function exportCSV(){const fields=['name','lang','setName','number','cardId','variant','condition','quantity','gbpPrice','paid','source','sourcePrice','sourceCurrency','priceAsOf','notes'];const rows=[fields.join(','),...state.collection.map(c=>fields.map(k=>csvSafe(c[k])).join(','))];saveFile(`cardnest-collection-${new Date().toISOString().slice(0,10)}.csv`,'\ufeff'+rows.join('\r\n'),'text/csv;charset=utf-8');toast('Collection CSV downloaded.');}
async function importJSON(file){if(!file)return;if(file.size>3e6){toast('Backup is too large (3MB limit).','error');return;}try{const data=JSON.parse(await file.text());if(data.app!=='CardNest'||!Array.isArray(data.cards))throw Error('Not a CardNest backup');if(data.cards.length>5000)throw Error('Too many cards');const clean=data.cards.map(c=>({id:String(c.id||''),cardId:String(c.cardId||''),lang:LANGUAGE_NAMES[c.lang]?c.lang:'en',name:String(c.name||'').slice(0,130),image:typeof c.image==='string'&&c.image.startsWith('https://assets.tcgdex.net/')?c.image:null,setName:String(c.setName||'').slice(0,130),number:String(c.number||'').slice(0,40),rarity:String(c.rarity||'').slice(0,80),variant:String(c.variant||'normal').slice(0,40),condition:String(c.condition||'NM').slice(0,20),quantity:Math.max(1,Math.min(999,parseInt(c.quantity)||1)),paid:c.paid===null?null:Number.isFinite(Number(c.paid))?Math.max(0,Number(c.paid)):null,notes:String(c.notes||'').slice(0,200),gbpPrice:Number.isFinite(c.gbpPrice)&&c.gbpPrice>=0?c.gbpPrice:null,sourcePrice:Number.isFinite(c.sourcePrice)?c.sourcePrice:null,sourceCurrency:String(c.sourceCurrency||'').slice(0,5),source:String(c.source||'').slice(0,60),priceAsOf:c.priceAsOf||null,updatedAt:String(c.updatedAt||''),createdAt:String(c.createdAt||'')})).filter(c=>c.id&&c.cardId&&c.name);if(!confirm(`Replace your current ${state.collection.length} entries with ${clean.length} entries from this backup?`))return;state.collection=clean;saveCollection();toast(`Restored ${clean.length} collection entries.`);}catch(e){toast(`Could not import backup: ${e.message}`,'error');}finally{$('#import-json').value='';}}
function loadOCRScript(){return new Promise((resolve,reject)=>{
 if(window.Tesseract){resolve();return;}
 const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
 s.onload=resolve;s.onerror=()=>reject(Error('The OCR library could not load. Check your connection.'));document.head.appendChild(s);
});}
function setPhoto(file){
 if(!file)return;
 if(!/^image\/(png|jpeg|webp)$/.test(file.type)){toast('Choose a JPG, PNG or WEBP image.','error');return;}
 if(file.size>12*1024*1024){toast('Maximum photo size is 12MB.','error');return;}
 if(state.photoUrl)URL.revokeObjectURL(state.photoUrl);
 state.photoUrl=URL.createObjectURL(file);state.photoFile=file;
 $('#scan-placeholder').hidden=true;const img=$('#scan-preview');img.hidden=false;img.src=state.photoUrl;
 $('#recognize-button').disabled=false;$('#scan-status').textContent='Ready. Choose the card language, then tap Read card text.';
 $('#scan-results').innerHTML='';$('#scan-ocr-details').hidden=true;
}
function normalizeOCRText(text){return String(text||'').normalize('NFKC').replace(/[|]/g,'I').replace(/[\u200b-\u200d]/g,'');}
function extractCardNumber(text){
 const t=normalizeOCRText(text).replace(/[Oo]/g,'0').replace(/(?<=\d)[Il](?=\d|\s*\/)/g,'1');
 const matches=[...t.matchAll(/(?:^|[^\d])([0-9]{1,4})\s*[\/／\\]\s*(?:[0-9]{1,4}|[A-Z]{1,5}(?:-[A-Z]{1,5})?)(?!\d)/gi)];
 return matches.length?matches[matches.length-1][1]:'';
}
function parsePhotoText(topText,bottomText=''){
 const top=normalizeOCRText(topText),bottom=normalizeOCRText(bottomText);
 const lines=top.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 const chinese=/[\p{Script=Han}]/u;
 const banned=/^(?:basic|stage|pokemon|pokémon|trainer|item|supporter|ability|weakness|retreat|resistance|illustrator|hp|rule|attack|illustration|damage|evolves|energy|vstar|vmax|special|no\.|基本|基礎|基础|進化|进化|招式|特性|弱點|弱点|撤退|抵抗|寶可夢|宝可梦|插畫|插画|身高|體重|体重)/i;
 const candidates=lines.slice(0,14).map((original,i)=>{
  const cleaned=original.replace(/(?:HP\s*\d{2,3}|\d{2,3}\s*HP)/ig,'')
   .replace(/^(?:基本寶可夢|基本宝可梦|基本ポケモン|基本|基礎|基础)\s*/i,'')
   .replace(/[^\p{L}\p{M}0-9\s'.-]/gu,' ').replace(/\s+/g,' ').trim();
  const han=(cleaned.match(/[\p{Script=Han}]/gu)||[]).length;
  const latin=(cleaned.match(/[A-Za-z]/g)||[]).length;
  const plausible=(han>=2&&han<=13)||(latin>=3&&cleaned.length<=34);
  const score=(han>=2?8:0)+(i<4?4:0)+Math.min(han,6)-(cleaned.length>21?3:0)-i*0.65;
  return {name:cleaned,score,plausible:plausible&&!banned.test(cleaned)&&!/^\d/.test(cleaned)&&!cleaned.includes('www')};
 }).filter(x=>x.plausible);
 candidates.sort((a,b)=>b.score-a.score);
 return {name:candidates[0]?.name||'',number:extractCardNumber(bottom)||extractCardNumber(top),chinese:chinese.test(candidates[0]?.name||'')};
}
function cropToCanvas(img,xRatio,yRatio,wRatio,hRatio){
 const canvas=document.createElement('canvas'),targetW=Math.min(1700,Math.max(750,img.naturalWidth*wRatio*1.7));
 const sx=img.naturalWidth*xRatio,sy=img.naturalHeight*yRatio,sw=img.naturalWidth*wRatio,sh=img.naturalHeight*hRatio;
 canvas.width=Math.round(targetW);canvas.height=Math.round(targetW*sh/sw);
 const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('Image processing is unavailable');
 ctx.filter='grayscale(1) contrast(1.55) brightness(1.1)';ctx.drawImage(img,sx,sy,sw,sh,0,0,canvas.width,canvas.height);
 return canvas;
}
async function scanCanvases(url){
 const image=new Image();image.src=url;
 await new Promise((resolve,reject)=>{if(image.complete&&image.naturalWidth){resolve();return;}image.onload=resolve;image.onerror=()=>reject(Error('Could not open the photo'));});
 return {top:cropToCanvas(image,.045,.015,.91,.38),bottom:cropToCanvas(image,.045,.65,.91,.34)};
}
async function recognizePhoto(){
 if(!state.photoFile)return;
 const btn=$('#recognize-button'),status=$('#scan-status');btn.disabled=true;
 let worker=null;
 try{
  status.textContent='Loading card reader. Chinese language packs can take a minute the first time...';
  await loadOCRScript();
  const language=$('#scan-language').value;
  const langs=language==='zh-tw'?['chi_tra','eng']:language==='zh-cn'?['chi_sim','eng']:language==='en'?['eng']:['chi_tra','chi_sim','eng'];
  const crops=await scanCanvases(state.photoUrl);
  let stage='name';
  worker=await window.Tesseract.createWorker(langs,1,{logger:m=>{
   if(m.status==='recognizing text'){status.textContent=`Reading ${stage==='name'?'card name':'collector number'}... ${Math.round((m.progress||0)*100)}%`;}
   else if(m.status==='loading language traineddata'||m.status==='loading tesseract core')status.textContent='Loading OCR language models. This may take a minute...';
  }});
  const top=await worker.recognize(crops.top);
  stage='number';const bottom=await worker.recognize(crops.bottom);
  let topText=top?.data?.text||'',bottomText=bottom?.data?.text||'';
  let parsed=parsePhotoText(topText,bottomText);
  if(!parsed.name&&!parsed.number){stage='full card';const whole=await worker.recognize(state.photoFile);topText+='\n'+(whole?.data?.text||'');parsed=parsePhotoText(topText,bottomText);}
  $('#scan-name').value=parsed.name;$('#scan-number').value=parsed.number;
  $('#scan-ocr-raw').textContent=`CARD NAME AREA:\n${topText.trim()||'(none)'}\n\nCOLLECTOR NUMBER AREA:\n${bottomText.trim()||'(none)'}`;
  $('#scan-ocr-details').hidden=false;
  if(parsed.name||parsed.number){
   status.textContent=`Read ${parsed.name?`“${parsed.name}”`:'no clear name'}${parsed.number?` · Card #${parsed.number}`:''}. Searching for matching prints — please check the artwork.`;
   await searchCards('scan',parsed.name,parsed.number);
  }else{
   status.textContent='Couldn’t confidently read the card. Try a brighter, straight-on photo or enter the collector number manually.';
   toast('No confident text match. Manual search is ready.','error');
  }
 }catch(e){
  status.textContent=`Scanner could not finish: ${e.message}. Try selecting one Chinese language or search by card number.`;
  toast('Could not read the photo. Manual card search is still available.','error');
 }finally{if(worker)await worker.terminate().catch(()=>{});btn.disabled=false;}
}
function attachEvents(){document.addEventListener('error',e=>{if(e.target instanceof HTMLImageElement && e.target.closest('.card-image-frame,.collection-thumb,.modal-card-art')){const holder=e.target.parentElement;e.target.remove();holder.insertAdjacentHTML('beforeend',blankImage);}},true);document.addEventListener('click',e=>{const n=e.target.closest('[data-nav]');if(n){e.preventDefault();nav(n.dataset.nav);return;}const search=e.target.closest('[data-search]');if(search){nav('explore');$('#explore-query').value=search.dataset.search;searchCards('explore',search.dataset.search);return;}const card=e.target.closest('[data-cardid]');if(card){showCard(card.dataset.cardid,null,card.dataset.cardlang||'en');return;}const more=e.target.closest('[data-loadmore]');if(more){state.resultViews[more.dataset.loadmore]+=20;renderResults(more.dataset.loadmore);return;}const edit=e.target.closest('[data-editid]');if(edit){const c=state.collection.find(x=>x.id===edit.dataset.editid);if(c)showCard(c.cardId,c.id,c.lang||'en');return;}const del=e.target.closest('[data-deleteid]');if(del){const c=state.collection.find(x=>x.id===del.dataset.deleteid);if(c&&confirm(`Remove ${c.name} from your collection?`)){state.collection=state.collection.filter(x=>x.id!==c.id);saveCollection();toast('Card removed.');}return;}});
 $('#top-search').onclick=()=>{nav('explore');$('#explore-query').focus();};
 $('#explore-search-form').onsubmit=e=>{e.preventDefault();searchCards('explore',$('#explore-query').value);};
 $('#scan-search-form').onsubmit=e=>{e.preventDefault();searchCards('scan',$('#scan-name').value,$('#scan-number').value);};
 $('#photo-button').onclick=()=>$('#scan-file').click();
 $('#scan-file').onchange=e=>setPhoto(e.target.files?.[0]);
 $('#recognize-button').onclick=recognizePhoto;
 const zone=$('#drop-zone');zone.onclick=()=>$('#scan-file').click();zone.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('#scan-file').click();}};['dragenter','dragover'].forEach(t=>zone.addEventListener(t,e=>{e.preventDefault();zone.classList.add('dragging');}));['dragleave','drop'].forEach(t=>zone.addEventListener(t,e=>{e.preventDefault();zone.classList.remove('dragging');}));zone.addEventListener('drop',e=>setPhoto(e.dataTransfer?.files?.[0]));
 $('#modal-close').onclick=closeModal;$('#card-modal').addEventListener('click',e=>{if(e.target===$('#card-modal'))closeModal();});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#card-modal').hidden)closeModal();});
 $('#collection-query').oninput=renderCollection;$('#collection-sort').onchange=renderCollection;$('#refresh-prices').onclick=refreshPrices;
 $('#export-json').onclick=exportJSON;$('#export-csv').onclick=exportCSV;$('#import-json-button').onclick=()=>$('#import-json').click();$('#import-json').onchange=e=>importJSON(e.target.files?.[0]);
 $('#clear-collection').onclick=()=>{if(confirm('Delete every locally saved card? Export a backup first. This cannot be undone.')&&confirm('Are you sure you want to clear the entire binder?')){state.collection=[];saveCollection();toast('Local collection cleared.');}};
}
function init(){const date=new Date();$('#today').textContent=date.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'});attachEvents();renderStats();nav(location.hash?.slice(1)||'home');exchangeRates();if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(()=>{});}
document.addEventListener('DOMContentLoaded',init);