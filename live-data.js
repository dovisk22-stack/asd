/* CardNest Clear Edition — real catalog previews and transparent source prices.
   Source data: TCGdex API (card records & Cardmarket/TCGplayer market snapshots)
   and Frankfurter (reference GBP FX). This module has no write access to collection.
*/
(() => {
'use strict';
const node=(tag,cls,text)=>{
 const el=document.createElement(tag);
 if(cls)el.className=cls;
 if(text!==undefined)el.textContent=String(text);
 return el;
};
const selector=q=>document.querySelector(q);
const curr=(value,unit)=>{
 if(!Number.isFinite(value))return '—';
 return new Intl.NumberFormat('en-GB',{style:'currency',currency:unit||'GBP'}).format(value);
};
const good=val=>{
 if(val===null||val===undefined||String(val).trim()==='')return null;
 const num=Number(val);
 return Number.isFinite(num)&&num>0?num:null;
};
const formatDate=x=>{
 if(!x)return 'date unavailable';
 const num=typeof x==='number'?x:null;
 const date=new Date(num===null?x:(num<1e11?num*1000:num));
 return Number.isFinite(date.getTime())?date.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'date unavailable';
};
function pricePoint(card,provider,variant){
 const cm=card?.pricing?.cardmarket||{},tcg=card?.pricing?.tcgplayer||{};
 if(provider==='cm'){
  if(variant==='holo'){
   const value=good(cm['trend-holo'])??good(cm['avg-holo']);
   const compare=good(cm['avg7-holo'])??good(cm['avg30-holo']);
   return value===null?null:{provider:'Cardmarket',currency:'EUR',value,date:cm.updated,compare,compareLabel:'7/30d avg'};
  }
  if(variant!=='normal')return null;
  const value=good(cm.trend)??good(cm.avg);
  return value===null?null:{provider:'Cardmarket',currency:'EUR',value,date:cm.updated,
   compare:good(cm.avg7)??good(cm.avg30),compareLabel:'7/30d avg'};
 }
 const lookup={normal:['normal','unlimited'],holo:['holofoil','holo','unlimited-holofoil'],
  reverse:['reverse','reverse-holofoil'],first:['1st-edition','1st-edition-holofoil']};
 for(const key of lookup[variant]||['normal']){
  const row=tcg[key],value=good(row?.marketPrice);
  if(value!==null)return {provider:'TCGplayer',currency:'USD',value,date:tcg.updated,
   compare:good(row?.lowPrice),compareLabel:'listed low'};
 }
 return null;
}
function quoteRow(point){
 const row=node('div','market-row');
 const source=node('div','market-source');
 source.append(node('strong','',point.provider),node('small','',point.compareLabel+' · '+formatDate(point.date)));
 const figure=node('div','market-price');
 const rate=state.fx?.[point.currency];
 const converted=rate ? point.value*rate : null;
 figure.append(node('strong','',converted!==null?curr(converted,'GBP'):curr(point.value,point.currency)));
 const detail=curr(point.value,point.currency)+(point.compare!==null?' · '+point.compareLabel+' '+curr(point.compare,point.currency):'');
 figure.append(node('small','',detail));
 row.append(source,figure);return row;
}
function renderMarket(){
 const modal=selector('#modal-price');
 if(!modal||!state.detail)return;
 let mount=selector('#market-comparison');
 if(!mount){
  mount=node('div','market-comparison');mount.id='market-comparison';
  modal.insertAdjacentElement('afterend',mount);
 }
 mount.replaceChildren();
 const head=node('div','market-heading');
 head.append(node('strong','','Compare market sources'));
 const dataLink=node('a','','About price data');
 dataLink.href='https://tcgdex.dev/markets-prices';
 dataLink.target='_blank';dataLink.rel='noopener noreferrer';
 head.append(dataLink);mount.append(head);
 const variant=selector('#variant-picker')?.value||'normal';
 const points=[pricePoint(state.detail,'cm',variant),pricePoint(state.detail,'tcg',variant)].filter(Boolean);
 if(!points.length){
  const empty=node('p','market-foot','No marketplace reference is available for this finish. CardNest will not guess a price.');
  mount.append(empty);return;
 }
 points.forEach(p=>mount.append(quoteRow(p)));
 const note=node('p','market-foot','Prices are external market references, not UK sold listings or guaranteed values. The same card may sell differently by language, edition, condition or grading.');
 mount.append(note);
}
const oldUpdate=updateModalQuote;
updateModalQuote=function(){
 oldUpdate();
 try{renderMarket();}catch(error){console.warn('Price sources unavailable',error);}
};
function addSourcesNote(){
 const info=selector('#fx-status')?.closest('.settings-card');
 if(!info||selector('#data-source-explainer'))return;
 const block=node('div','data-source-note');block.id='data-source-explainer';
 block.append(node('span','','Data: '));
 const links=[
  ['TCGdex card database','https://tcgdex.dev/'],
  ['Cardmarket & TCGplayer references','https://tcgdex.dev/markets-prices'],
  ['Frankfurter FX','https://frankfurter.dev/']
 ];
 links.forEach(([label,url],index)=>{
  if(index)block.append(node('span','',' · '));
  const a=node('a','',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';block.append(a);
 });
 info.querySelector('div:nth-child(2)')?.append(block);
}
function catalogSection(){
 const home=selector('#page-home'),foot=home?.querySelector('.footnote');
 if(!home||selector('#catalog-discover'))return;
 const section=node('section','catalog-discover');section.id='catalog-discover';
 const heading=node('div','section-heading');
 const title=node('div');
 title.append(node('span','eyebrow subtle','REAL CARD ARTWORK'),node('h2','','From the catalog'));
 const source=node('span','catalog-source');
 source.append('Card data: ');
 const link=node('a','','TCGdex');link.href='https://tcgdex.dev/';
 link.target='_blank';link.rel='noopener noreferrer';
 source.append(link);heading.append(title,source);
 const gallery=node('div','catalog-gallery');gallery.id='catalog-gallery';
 gallery.append(node('div','catalog-fallback','Loading card artwork…'));
 section.append(heading,gallery);
 if(foot)foot.insertAdjacentElement('beforebegin',section);
 else home.append(section);
}
async function renderCatalog(){
 const gallery=selector('#catalog-gallery');if(!gallery)return;
 const names=['Pikachu','Charizard','Mew'];
 try{
  // Separate short searches avoid an all-cards dump in the mobile browser.
  const results=await Promise.allSettled(names.map(name=>findCatalogCards('en','name',name,160)));
  const cards=[];
  for(const response of results){
   if(response.status!=='fulfilled')continue;
   const useful=response.value.filter(card=>card?.image&&card?.id&&card?.name);
   const positions=[0,Math.floor(useful.length*.55)];
   for(const i of positions){
    const card=useful[i];
    if(card&&!cards.some(x=>x.id===card.id))cards.push(card);
    if(cards.length>=6)break;
   }
   if(cards.length>=6)break;
  }
  if(!cards.length)throw Error('No cards returned');
  gallery.replaceChildren();
  if(!selector('.hero-real-card'))fillHeroCard(cards[0]);
  cards.slice(0,6).forEach(c=>{
   const button=node('button','catalog-card');button.type='button';
   button.dataset.cardid=c.id;button.dataset.cardlang=c.lang||'en';
   button.setAttribute('aria-label','View '+c.name+' number '+c.localId);
   const img=node('img');img.loading='lazy';img.decoding='async';img.alt=c.name;
   img.src=c.image+'/low.webp';
   button.append(img,node('strong','',c.name),node('small','','#'+c.localId));
   gallery.append(button);
  });
 }catch(error){
  gallery.replaceChildren(node('p','catalog-fallback','The card catalog is temporarily unavailable. You can still scan or search your own cards.'));
 }
}
function fillHeroCard(card){
 const host=selector('.hero-art');if(!host||!card?.image)return;
 const button=node('button','hero-real-card');button.type='button';
 button.dataset.cardid=card.id;button.dataset.cardlang=card.lang||'en';
 button.setAttribute('aria-label','View '+card.name+' card details');
 const img=node('img');img.src=card.image+'/high.webp';img.alt=card.name;
 const caption=node('div','hero-card-info');
 caption.append(node('span','','From the catalog'),node('strong','',card.name),
  node('small','',card.set?.name||'Pokémon TCG'));
 button.append(img,caption);host.replaceChildren(button);
}
async function renderHeroArt(){
 try{
  const card=await fetchCard('swsh3-136',false,'en');
  if(card?.image)fillHeroCard(card);
 }catch{/* The live catalog gallery supplies the featured card when possible. */}
}
function init(){
 catalogSection();
 addSourcesNote();
 renderCatalog();
 renderHeroArt();
}
document.addEventListener('DOMContentLoaded',init);
})();