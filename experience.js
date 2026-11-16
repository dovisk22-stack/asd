/* CardNest — Collector Edition presentation enhancements.
 * This module does not alter card matching, price estimates or collection data.
 */
(() => {
  'use strict';
  const q = selector => document.querySelector(selector);
  const format = value => Number.isFinite(value)
    ? new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(value) : '—';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const key = 'cardnest_collection_v1';
  const safeText = value => String(value ?? '');
  let lastCollectionSignature = null;
  const make = (tag, classname, text) => {
    const el=document.createElement(tag);
    if (classname) el.className=classname;
    if (text!==undefined) el.textContent=text;
    return el;
  };
  function buildTrustStrip(){
    const hero=q('.hero');
    if(!hero || q('.collector-strip'))return;
    const strip=make('div','collector-strip');
    [['●','Designed for collectors'],['●','English & Chinese scans'],['●','GBP value estimates']].forEach(([bullet,label],idx)=>{
      const dot=make('span','strip-bullet');dot.setAttribute('aria-hidden','true');
      const title=make('strong','',label);
      if(idx)dot.style.background=idx===1?'#bda1ff':'#8ddaff';
      strip.append(dot,title);
    });
    hero.insertAdjacentElement('afterend',strip);
  }
  function readLatest(){
    try{
      const parsed=JSON.parse(localStorage.getItem(key)||'[]');
      if(!Array.isArray(parsed))return [];
      return parsed.filter(x=>x && typeof x.name==='string' && typeof x.cardId==='string')
        .sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))).slice(0,4);
    }catch{return [];}
  }
  function renderRecent(){
    const host=q('#collector-recent');if(!host)return;
    const cards=readLatest();
    const signature=cards.map(c=>[c.id,c.updatedAt,c.quantity,c.gbpPrice].join('/')).join('|');
    if(signature===lastCollectionSignature)return;
    lastCollectionSignature=signature;host.replaceChildren();
    if(!cards.length){
      const empty=make('div','recent-empty');
      const left=make('div','recent-empty-icon','✦');
      const text=make('div');
      text.append(make('strong','', 'Your next favorite card starts here.'),make('p','', 'Scan your first card, or search the catalog to begin your binder.'));
      const button=make('button','btn btn-primary','Find a card →');
      button.type='button';button.dataset.nav='explore';
      empty.append(left,text,button);host.append(empty);
      return;
    }
    const rail=make('div','recent-grid');
    cards.forEach(card=>{
      const button=make('button','recent-item');button.type='button';
      button.setAttribute('aria-label','Open collection to find '+safeText(card.name));
      button.dataset.nav='collection';
      const art=make('div','recent-art');
      if(typeof card.image==='string' && card.image.startsWith('https://assets.tcgdex.net/')){
        const img=make('img');img.src=card.image+'/low.webp';img.loading='lazy';img.alt=card.name;
        img.onerror=()=>{art.replaceChildren(make('span','recent-placeholder','✧'));};art.append(img);
      }else art.append(make('span','recent-placeholder','✧'));
      const info=make('div','recent-details');
      info.append(make('strong','',card.name),make('small','',safeText(card.setName||'My collection')));
      const price=Number.isFinite(card.gbpPrice)?format(card.gbpPrice*Number(card.quantity||1)):'Price unavailable';
      info.append(make('em','',price));button.append(art,info);rail.append(button);
    });
    host.append(rail);
  }
  function addRecent(){
    const page=q('#page-home');const action=q('.action-grid');
    if(!page || !action || q('#collector-recent'))return;
    const section=make('section','recent-section');
    const heading=make('div','section-heading recent-heading');
    const titleGroup=make('div');
    titleGroup.append(make('span','eyebrow subtle','YOUR BINDER'),make('h2','','Recent discoveries'));
    const button=make('button','recent-see-all','View collection →');
    button.type='button';button.dataset.nav='collection';
    heading.append(titleGroup,button);
    const content=make('div');content.id='collector-recent';
    section.append(heading,content);
    action.insertAdjacentElement('afterend',section);
    renderRecent();
  }
  function trackScanner(){
    const status=q('#scan-status'),zone=q('#drop-zone'),button=q('#recognize-button');
    if(!status || !zone || !button)return;
    const normalLabel=button.textContent;
    function update(){
      const val=status.textContent||'';
      const reading=/Loading card reader|Loading OCR|Loading language|Recognizing|Reading (?:card|name|collector)|Reading [^.]|language models|Analyzing/i.test(val)
          && !/Ready|Read “|Read no clear|Couldn't|Couldn’t|could not|couldn’t finish|Searching|matches|no confident/i.test(val);
      zone.dataset.stage=reading?'reading':'ready';
      zone.setAttribute('aria-busy',reading?'true':'false');
      button.textContent=reading?'✧  Reading your card…':normalLabel;
      if(!reading && /could not|couldn’t|couldn't/i.test(val)){zone.classList.add('scan-error');setTimeout(()=>zone.classList.remove('scan-error'),950);}
    }
    const observer=new MutationObserver(update);
    observer.observe(status,{characterData:true,childList:true,subtree:true});
    update();
  }
  function highlightNavigation(){
    const nav=q('.mobile-nav');if(!nav)return;
    // A subtle touch response, no new navigation event handlers.
    nav.addEventListener('pointerdown',event=>{
      const button=event.target.closest('button');
      if(button && !reduced){button.classList.remove('nav-pulse');void button.offsetWidth;button.classList.add('nav-pulse');}
    });
  }
  function shortcuts(){
    window.addEventListener('keydown',e=>{
      const target=e.target;
      const editing=target && (target.matches?.('input,select,textarea') || target.isContentEditable);
      if(editing)return;
      if((e.key==='/' || ((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k')) && !q('#card-modal:not([hidden])')){
        e.preventDefault();
        q('#top-search')?.click();
        setTimeout(()=>q('#explore-query')?.focus(),80);
      }
    });
  }
  function init(){
    buildTrustStrip();
    addRecent();
    trackScanner();
    highlightNavigation();
    shortcuts();
    const cardcount=q('#home-cardcount');
    if(cardcount){
      new MutationObserver(()=>renderRecent()).observe(cardcount,{childList:true,characterData:true,subtree:true});
    }
    document.addEventListener('click',e=>{
      if(e.target.closest('[data-nav="home"]'))setTimeout(renderRecent,75);
    });
  }
  document.addEventListener('DOMContentLoaded',init);
})();