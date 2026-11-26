/* YoruBay phone surface. Optional story presentation, not a separate simulation engine. */
(() => {
  'use strict';
  const Core = window.BAOPhoneUICore;
  const Puzzles = window.BAOPhoneInteractionCore;
  if (!Core || typeof App === 'undefined' || window.BAOPhoneUI) return;
  let dmPhotos=null, xPhotosCleanup=()=>{};
  let imageCollectionCleanup = () => {};
  let root = null, screen = null, config = null, page = 'lock', subpage = '';
  let clock = null, callTimer = null, callStart = 0, messageTimers = [], messageFade = null;
  let audio = null, trackIndex = -1, playing = false, position = 0, expanded = false, shuffle = false, loop = false;
  const backgroundInert = new Map();
  let prevFocus = null, selfDragging = null, activeThread = '';
  let ownerState=null, ownerCharacter=null, eventNotice='';
  const itemsFor = app => Puzzles?.visibleItems(config,ownerState?.phoneInteractions,app) || config[app==='kakao'?'threads':app];
  const accessFor = target => Puzzles?.access(config,ownerState?.phoneInteractions,target) || {exists:true,locked:false,hidden:false};
  const selectedThread = () => config.threads.find(item => item.id === activeThread);
  const threadName = thread => thread?.name || thread?.participants.map(id => config.contacts.find(c => c.id === id)?.name || id).join('、') || displayName();
  const $ = (tag, cls = '', value) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (value !== undefined) node.textContent = String(value ?? '');
    return node;
  };
  const add = (parent, ...children) => { children.filter(Boolean).forEach(child => parent.append(child)); return parent; };
  const button = (label, action, cls = '') => {
    const el = $('button', cls, label);
    el.type = 'button'; el.dataset.phoneAction = action; return el;
  };
  const image = (src, cls, fallback = '♪') => {
    const url = Core.media(src);
    if (!url) return $('div', cls + ' bp-image-fallback', fallback);
    const el = $('img', cls); el.src = url; el.alt = ''; el.loading = 'lazy'; el.addEventListener('error', () => el.replaceWith($('div', cls + ' bp-image-fallback', fallback)), {once:true}); return el;
  };
  const displayName = () => config.contactName || config.instagram.callerName || '聯絡人';
  const phoneSource = () => {
    const state = window.GameState?.current;
    if (!state || !App.activeCharacter) return null;
    const source = window.BAOPhonePlayerCore?.resolve(App.activeCharacter.phone_ui, state)
      || (!window.BAOPhonePlayerCore ? Core.normalize(App.activeCharacter.phone_ui) : null);
    if (!source) return null;
    const extra = state.modules?.phone_ui;
    const dynamic = state.phoneUI;
    const combine = value => window.BAOPhoneStoryCore?.mergeDisplay(value, dynamic) || Core.normalize(value);
    if (extra && typeof extra === 'object' && !Array.isArray(extra)) {
      return combine({ ...source, ...extra, interactions:source.interactions, weather: { ...source.weather, ...extra.weather },
        instagram: { ...source.instagram, ...extra.instagram }, spotify: { ...source.spotify, ...extra.spotify } });
    }
    return combine(source);
  };
  // Resolve the same target for mounting, initial send and a retry after the
  // Phone overlay has closed. Do not depend on mutable overlay navigation.
  function chatPhotoTarget(source,threadId,state) {
    if(!source?.apps.includes('kakao'))return null;
    const thread=threadId ? source.threads.find(t=>t.id===threadId) : null;
    if(threadId){
      const access=Puzzles?.access(source,state?.phoneInteractions,{app:'kakao',id:threadId});
      if(!thread || access?.locked || access?.hidden)return null;
    }
    const name=thread?.name || thread?.participants.map(id=>source.contacts.find(c=>c.id===id)?.name || id).join('、') || source.contactName || source.instagram.callerName || '聯絡人';
    if(thread?.participants.length>1)return window.BAOPhoneStoryCore?.groupPhotoTarget(thread,name,source.contacts);
    if(thread ? thread.participants.length!==1 : !source.contactName)return null;
    const senderId=thread?.participants[0] || name;
    return {threadId,name,senderId,prefix:'【KakaoTalk｜對 '+name+' 發送訊息'+(threadId?'｜聊天室 ID：'+threadId:'')+'】',key:JSON.stringify([threadId,senderId])};
  }
  const noticesFor = (source, state) => (window.BAOPhoneStoryCore?.notifications?.(state?.phoneUI) || []).filter(item => {
    if (!source?.apps.includes(item.app)) return false;
    if (!item.targetId) return true;
    const access=Puzzles?.access(source,state?.phoneInteractions,{app:item.app,id:item.targetId});
    return !access || (access.exists && !access.hidden);
  });
  const currentNotices = () => noticesFor(config,ownerState);
  function markNotices(predicate) {
    if (ownerState !== window.GameState?.current || ownerCharacter !== App.activeCharacter || App.__requestPending) return false;
    const before=ownerState.phoneUI;
    const items=window.BAOPhoneStoryCore?.notifications?.(before) || [];
    if (!items.some(item=>!item.read && predicate(item))) return true;
    ownerState.phoneUI={...before,notifications:items.map(item=>predicate(item)?{...item,read:true}:item)};
    try { if(App.saveStory(false)===false)throw new Error('save'); }
    catch (_) { ownerState.phoneUI=before; window.BAOFeedback?.notify?.('故事儲存失敗，這次已讀狀態沒有保存。','error');return false; }
    makeLauncher();return true;
  }
  function renderNotices(parent) {
    const items=currentNotices().filter(item=>!item.read);
    if (!items.length) return;
    const section=$('section','bp-notifications');section.setAttribute('aria-label','手機新動態');
    section.append($('strong','','新動態 · '+items.length));
    items.slice(-6).reverse().forEach(item=>{
      const locked=item.targetId && accessFor({app:item.app,id:item.targetId}).locked;
      section.append(button(locked?'🔒 有一項鎖定內容更新':item.label,'notice:'+item.id,'bp-notification'));
    });
    parent.append(section);
  }
  function openNotice(id) {
    const item=currentNotices().find(item=>item.id===id);
    if(!item)return;
    if(item.targetId){enterTarget(item.app,item.targetId);return;}
    if(!markNotices(notice=>notice.app===item.app && !notice.targetId))return;
    clearTimers();stopMedia();page=item.app;subpage='';
    if(item.app==='kakao'){activeThread='';subpage='chat';}
    render();
  }
  function emptyState(area,title,copy) {
    const box=$('section','bp-empty');
    add(box,$('h3','',title),$('p','bp-muted',copy),button('回到故事繼續','return-story','bp-empty-action'));
    area.append(box);
  }
  const visible = () => !!phoneSource();
  const notifyStageVisibility = open => {
    document.getElementById('chat-view')?.dispatchEvent(new CustomEvent(
      'bao:phone-stage-visibility',
      { detail:{ open:Boolean(open) } }
    ));
  };
  function makeLauncher() {
    if(root && (ownerState!==window.GameState?.current || ownerCharacter!==App.activeCharacter))close();
    const existing = document.getElementById('bao-phone-launch');
    const enabled = visible() && document.getElementById('chat-view')?.classList.contains('active');
    if (!enabled) { existing?.remove(); if (root) close(); return; }
    const source=phoneSource();
    const unread=noticesFor(source,window.GameState?.current).filter(item=>!item.read).length;
    if (existing) { existing.textContent='📱 手機介面'+(unread?' · '+unread+' 則新動態':'');existing.dataset.unread=String(unread);return; }
    const main = document.querySelector('#chat-view .chat-main');
    if (!main) return;
    const launch = button('📱 手機介面'+(unread?' · '+unread+' 則新動態':''), 'launch', 'bao-phone-launch secondary');
    launch.dataset.unread=String(unread);
    launch.id = 'bao-phone-launch'; launch.setAttribute('aria-label', '開啟作品手機介面');
    launch.addEventListener('click', open);
    const host = main.querySelector('.chat-topline') || main;
    host.prepend(launch);
  }
  function commitOpen(target,password,status) {
    if(!Puzzles)return true;
    const hasRules=!!config.interactions;
    const fail=text=>{if(status)status.textContent=text;else window.BAOFeedback?.notify?.(text,'error');return false;};
    if(ownerState!==window.GameState?.current || ownerCharacter!==App.activeCharacter)return fail('故事已切換，請重新開啟手機。');
    if(App.__requestPending)return fail('故事仍在回覆中，請稍後再操作機關。');
    const result=Puzzles.open(config,ownerState.phoneInteractions,target,password);
    if(!result.ok)return fail(result.error);
    if(!result.changed)return true;
    const had=Object.prototype.hasOwnProperty.call(ownerState,'phoneInteractions'),before=ownerState.phoneInteractions;
    ownerState.phoneInteractions=result.progress;
    try {
      if(App.saveStory(false)===false)throw new Error('save');
    } catch (_) {
      if(had)ownerState.phoneInteractions=before;else delete ownerState.phoneInteractions;
      if(hasRules || target.app==='x')return fail('故事儲存失敗，這次已讀與解鎖沒有生效，請重試。');
      return true;
    }
    eventNotice=result.notifications.join('；');
    return true;
  }
  function enterTarget(app,id) {
    const target={app,id},access=accessFor(target);
    if(!access.exists || access.hidden)return;
    if(!access.locked && !commitOpen(target))return;
    if(!access.locked && !markNotices(item=>item.app===app && item.targetId===id))return;
    page=app;
    if(app==='kakao'){activeThread=id;subpage='chat';}else subpage=id;
    render();
  }
  function renderGate(area,target) {
    const access=accessFor(target);
    if(!access.locked)return false;
    if(!area.querySelector('.bp-app-header'))area.append(appHeader('已鎖定'));
    add(area,$('h1','','🔒 已鎖定'),$('p','bp-document',access.hint || '找到線索後再來看看。'));
    if(access.password){
      const form=$('form','bp-unlock-form');form.dataset.phoneForm='unlock';form.dataset.targetApp=target.app;form.dataset.targetId=target.id;
      const label=$('label','','故事密碼');
      const input=$('input');input.type='password';input.name='password';input.maxLength=128;input.required=true;input.autocomplete='off';input.setAttribute('aria-label','故事密碼');
      label.append(input);const submit=$('button','','解鎖');submit.type='submit';
      const status=$('p','bp-unlock-status');status.setAttribute('role','status');
      add(form,label,submit,status);area.append(form);
    }else add(area,$('p','bp-muted','需要先讀取其他線索，才能開啟這份內容。'));
    return true;
  }
  function clearTimers() {
    window.clearInterval(clock); window.clearInterval(callTimer); clock = null; callTimer = null;
    messageTimers.forEach(id => window.clearTimeout(id)); messageTimers = [];
    window.clearTimeout(messageFade); messageFade = null;
  }
  function stopMedia() {
    if (audio) { audio.pause(); audio.src = ''; audio = null; }
    if (root) root.querySelectorAll('video').forEach(v => { v.pause(); v.removeAttribute('src'); v.load(); });
    playing = false; position = 0; trackIndex = -1; expanded = false;
  }
  function close() {
    dmPhotos?.cleanup(); dmPhotos=null;xPhotosCleanup();xPhotosCleanup=()=>{};
    imageCollectionCleanup(); imageCollectionCleanup=()=>{};
    const wasOpen = Boolean(root);
    clearTimers(); stopMedia(); root?.remove(); root = null; screen = null;ownerState=null;ownerCharacter=null;eventNotice='';
    backgroundInert.forEach((value, node) => { node.inert = value; });
    backgroundInert.clear();
    if (wasOpen) notifyStageVisibility(false);
    if (prevFocus?.isConnected) prevFocus.focus(); prevFocus = null;
  }
  function enterHome() {
    clearTimers(); stopMedia(); page = 'home'; subpage = ''; render();
  }
  function open() {
    config = phoneSource();
    if (!config) return;
    close(); config = phoneSource();
    if (!config) return;
    ownerState=window.GameState?.current;ownerCharacter=App.activeCharacter;eventNotice=Puzzles?.validate(config).length?'這份作品的手機機關設定有誤，請作者檢查條件與引用。':'';
    prevFocus = document.activeElement; page = 'lock'; subpage = ''; activeThread = '';
    const overlay = $('div', 'bao-phone-overlay');
    overlay.id = 'bao-phone-stage';
    overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', '作品手機介面');
    const frame = $('div', 'bp-frame');
    screen = $('div', 'bp-screen');
    const dismiss=button('×','close','bp-close');dismiss.setAttribute('aria-label','關閉手機');
    add(frame, screen, dismiss); add(overlay, frame); document.body.append(overlay); root = overlay;
    for (const node of document.body.children) {
      if (node === overlay) continue;
      backgroundInert.set(node, node.inert);
      node.inert = true;
    }
    overlay.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const items = [...overlay.querySelectorAll('button,input,textarea,select,a[href],[tabindex]')]
        .filter(node => !node.disabled && node.tabIndex >= 0 && node.getClientRects().length);
      const first = items[0], last = items[items.length - 1];
      if (!first) return;
      if (event.shiftKey && (document.activeElement === first || !overlay.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !overlay.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    });
    notifyStageVisibility(true);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.addEventListener('click', onAction);
    overlay.addEventListener('submit', onSubmit);
    let startY = null;
    overlay.addEventListener('pointerdown', e => { if (page === 'lock') startY = e.clientY; });
    overlay.addEventListener('pointerup', e => {
      if (page === 'lock' && startY !== null && startY - e.clientY > 48) enterHome();
      startY = null;
    });
    clock = window.setInterval(updateClock, 1000);
    render(); dismiss.focus({preventScroll:true});
  }
  function updateClock() {
    if (!root || document.hidden) return;
    const now = new Date();
    const time = config.storyTime || now.toLocaleTimeString(config.locale, {hour:'2-digit',minute:'2-digit',hour12:false});
    const date = config.storyDate || new Intl.DateTimeFormat(config.locale, {month:'long',day:'numeric',weekday:'long'}).format(now);
    root.querySelectorAll('[data-phone-clock]').forEach(node => { if (node.textContent !== time) node.textContent = time; });
    root.querySelectorAll('[data-phone-date]').forEach(node => { if (node.textContent !== date) node.textContent = date; });
  }
  const wallpaper = node => {
    node.classList.add('bp-wallpaper');
    if (config.wallpaper) node.style.backgroundImage = 'linear-gradient(180deg,rgba(14,17,27,.16),rgba(10,16,33,.48)),url("' + config.wallpaper + '")';
  };
  function statusbar(dark = false) {
    const bar = $('div', 'bp-statusbar' + (dark ? ' bp-status-dark' : ''));
    const time = $('span', '', ''); time.dataset.phoneClock = '';
    add(bar, time, $('span', '', '▂▄▆  ▰')); return bar;
  }
  function handle() { const node=button('', 'home', 'bp-home-handle');node.setAttribute('aria-label','返回手機桌面');return node; }
  function render() {
    dmPhotos?.cleanup(); dmPhotos=null;xPhotosCleanup();xPhotosCleanup=()=>{};
    imageCollectionCleanup(); imageCollectionCleanup=()=>{};
    if (!screen || !config) return;
    screen.replaceChildren();
    screen.className = 'bp-screen bp-' + page;
    if (page === 'lock') renderLock();
    else if (page === 'home') renderHome();
    else if (page === 'instagram') renderInstagram();
    else if (page === 'spotify') renderSpotify();
    else renderBasicApp();
    if (page !== 'instagram' || subpage !== 'video') add(screen, handle());
    root.querySelector('.bp-event-notice')?.remove();
    if(eventNotice){const notice=$('div','bp-event-notice'+(page==='kakao' && subpage==='chat'?' bp-chat-notice':''));notice.setAttribute('role','status');
      const dismiss=button('×','dismiss-notice');dismiss.setAttribute('aria-label','關閉手機通知');add(notice,$('span','',eventNotice),dismiss);root.querySelector('.bp-frame').append(notice);}
    updateClock();
    if (!clock) clock=window.setInterval(updateClock,1000);
  }
  function renderLock() {
    wallpaper(screen); add(screen, statusbar());
    const stack = $('div', 'bp-lock-main');
    const stamp = $('div', 'bp-lock-clock'); stamp.dataset.phoneClock = '';
    const date = $('div', 'bp-lock-date'); date.dataset.phoneDate = '';
    add(stack, date, stamp, $('div', 'bp-lock-label', config.userName));
    add(screen, stack, $('div', 'bp-lock-hint', '向上滑動解鎖'));
    renderNotices(screen);
  }
  function renderHome() {
    wallpaper(screen); add(screen, statusbar());
    const widgets = $('div', 'bp-widgets');
    const weather = $('section', 'bp-widget');
    add(weather, $('div','bp-widget-label', '天氣 · ' + (config.weather.place || '—')),
      $('div','bp-temp',config.weather.temp || '—'),
      $('div','',config.weather.desc || ' '),
      $('div','bp-muted','最高 ' + (config.weather.high || '—') + '  最低 ' + (config.weather.low || '—')));
    const agenda = $('section', 'bp-widget');
    add(agenda, $('div','bp-widget-label','行程'));
    (config.events.length ? config.events.slice(0,2) : [{time:'—',title:'沒有行程'}]).forEach(ev =>
      add(agenda,$('div','bp-agenda', (ev.time || '') + '  ' + (ev.title || ''))));
    add(widgets,weather,agenda);
    const unread=currentNotices().filter(item=>!item.read).length;
    screen.classList.toggle('bp-has-notifications',unread>0);
    if(unread)widgets.append(button('查看新動態 · '+unread,'notifications','bp-notification-summary'));
    add(screen,widgets);
    const grid = $('div', 'bp-apps');
    const apps = [
      ['phone','☎','電話'],['kakao','●','KakaoTalk'],['x','𝕏','X'],['instagram','◎','Instagram'],
      ['spotify','♫','Spotify'],['photos','✿','相簿'],['notes','▤','備忘錄']
    ].filter(([id]) => config.apps.includes(id));
    apps.forEach(([id,glyph,label]) => {
      const wrap = $('div','bp-app-wrap');
      const icon = button(glyph,'app:'+id,'bp-icon bp-icon-'+id);
      icon.setAttribute('aria-label',label);
      add(wrap, icon, $('span','bp-app-name',label)); grid.append(wrap);
    });
    add(screen,grid);
    const dock = $('div','bp-dock');
    apps.slice(0,4).map(([id,glyph])=>[id,glyph]).forEach(([id,glyph]) => {
      const b = button(glyph,'app:'+id,'bp-icon bp-icon-'+id);
      b.setAttribute('aria-label',apps.find(app=>app[0]===id)[2]);
      dock.append(b);
    });
    add(screen,dock);
  }
  function appHeader(title, dark=false) {
    const header = $('header','bp-app-header');
    add(header,button('‹','back','bp-back'),$('strong','',title));
    return header;
  }
  function renderBasicApp() {
    const dark = page === 'x';
    add(screen,statusbar(dark));
    const area = $('div','bp-app-page '+(dark?'bp-dark-app':''));
    if (page === 'notifications') {
      add(area,appHeader('手機新動態'));
      if(currentNotices().some(item=>!item.read))renderNotices(area);
      else emptyState(area,'目前沒有未讀動態','故事裡實際收到的新訊息或文件，會在這裡提醒你。');
    } else if (page === 'phone') {
      add(area,appHeader('最近通話'),$('h1','','最近通話'));
      if(!config.calls.length)emptyState(area,'目前沒有通話紀錄','故事中發生的通話會顯示在這裡，不需要另外設定。');
      config.calls.forEach(group => {
        add(area,$('h4','bp-group-heading',group.group));
        group.items.forEach(call => {
          const row = $('div','bp-list-row');
          const missed = /未接|miss|부재중/.test(call.type);
          add(row,$('span','bp-call-dot'+(missed?' bp-red':''),missed?'●':'↗'),
            $('div','bp-flex',call.name || displayName() || '未知'),
            $('small','bp-muted',(call.count ? '('+call.count+') ' : '') + call.time));
          area.append(row);
        });
      });
      const tabs = $('div','bp-phone-tabs');
      ['常用聯絡人','最近通話','聯絡人','撥號鍵盤'].forEach(x => tabs.append($('span','',x)));
      area.append(tabs);
    } else if (page === 'kakao') {
      const chat = subpage === 'chat', profile = subpage === 'profile';
      if (chat && selectedThread() && renderGate(area,{app:'kakao',id:activeThread})) {
        // Locked threads never mount messages or a composer.
      } else if (chat) {
        add(area,appHeader(threadName(selectedThread())),$('div','bp-thread'));
        area.classList.add('bp-chat-page');
        const thread = area.querySelector('.bp-thread');
        if(!(selectedThread()?.messages || config.chat).length)emptyState(thread,'目前沒有訊息','你可以在下方明確傳送訊息，或回到故事繼續互動。');
        (selectedThread()?.messages || config.chat).forEach(item => {
          const row = $('div','bp-chat-row '+(item.from === 'me'?'bp-mine':''));
          const sender = item.senderName || config.contacts.find(c=>c.id===item.senderId)?.name || item.senderId;
          if (item.senderId) row.dataset.photoSenderId=item.senderId;
          if (item.from !== 'me' && sender) row.append($('small','bp-sender',sender));
          add(row,$('span','bp-bubble',item.text),$('small','bp-muted',item.time || ''));
          thread.append(row);
        });
        const form = $('form','bp-composer'); form.dataset.phoneForm = 'message';
        const input = $('input'); input.name='text'; input.maxLength=1600; input.placeholder='傳給 '+threadName(selectedThread())+'…'; input.setAttribute('aria-label','手機訊息'); input.required=true;
        const send = $('button','', '傳送至故事'); send.type='submit';
        add(form,input,send); area.append(form);
        const selected=selectedThread();
        if(window.BAOPhoneDMPhotos){
          const threadId=selected?.id || '',target=chatPhotoTarget(config,threadId,ownerState);
          if(target){
            const active=()=>{
              if(!root || ownerState!==GameState.current || ownerCharacter!==App.activeCharacter || page!=='kakao' || subpage!=='chat' || activeThread!==threadId)return false;
              const live=chatPhotoTarget(phoneSource(),threadId,GameState.current);
              return live?.key===target.key && live?.prefix===target.prefix;
            };
            dmPhotos=window.BAOPhoneDMPhotos.mount({form,thread,target,active,refresh:render});
          }
        }
        window.setTimeout(()=>{ if (thread.isConnected) thread.scrollTop = thread.scrollHeight; },0);
      } else if (profile) {
        add(area,appHeader('個人檔案'),image(config.instagram.avatar,'bp-profile-avatar',config.userName.slice(0,1)||'●'),
          $('h2','bp-centered',config.userName || '我'));
      } else {
        add(area,appHeader('聯絡人'),$('h1','','聯絡人'));
        const mine = button('', 'kakao-profile','bp-friend');
        add(mine,image(config.instagram.avatar,'bp-friend-avatar',config.userName.slice(0,1)||'我'),
          $('span','',config.userName || '我')); area.append(mine);
        add(area,$('h4','bp-group-heading','聯絡人'));
        if (config.chat.length || config.contactName || !config.threads.length) {
          const friend = button('', 'kakao-chat','bp-friend');
          add(friend,image(config.instagram.avatar,'bp-friend-avatar',displayName().slice(0,1)||'●'),
            $('span','',displayName())); area.append(friend);
        }
        itemsFor('kakao').forEach((thread,index) => {
          const locked=accessFor({app:'kakao',id:thread.id}).locked;
          const friend=button('', 'thread:'+index,'bp-friend');
          add(friend,$('span','bp-friend-avatar bp-image-fallback',thread.participants.length>2?'群':threadName(thread).slice(0,1)),
            add($('span','bp-track-meta'),$('strong','',threadName(thread)),
              $('small','bp-muted',locked?'🔒 已鎖定':thread.messages.at(-1)?.text || '尚無訊息')));
          area.append(friend);
        });
      }
    } else if (page === 'photos' || page === 'notes') {
      const photos = page === 'photos';
      const items = itemsFor(page);
      add(area,appHeader(photos ? '相簿' : '備忘錄'));
      const selected = subpage ? items.find(item=>item.id===subpage) : null;
      if(selected && renderGate(area,{app:page,id:selected.id})){
        // Do not mount locked text or request locked images.
      } else if (selected) {
        add(area,$('h1','',selected.title || (photos?'照片':'筆記')));
        if (photos) add(area,image(selected.src,'bp-photo-full','照片'),$('p','bp-document',selected.caption),$('small','bp-muted',ownerState?.phoneUI?.photos?.some(item=>item.id===selected.id)?'故事事件取得':'作者預先提供'));
        else add(area,$('p','bp-document',selected.text));
      } else {
        const list=$('div',photos?'bp-photo-grid':'bp-notes-list');
        if (!items.length) emptyState(list,photos?'尚無照片':'尚無筆記',photos?'故事中實際收到的照片會出現在這裡。':'故事中實際取得或更新的筆記會出現在這裡。');
        items.forEach((item,index)=>{
          const row=button('', 'document:'+index,photos?'bp-photo-item':'bp-note-item');
          const locked=accessFor({app:page,id:item.id}).locked;
          if (photos) row.append(locked?$('div','bp-photo-thumb bp-image-fallback','🔒'):image(item.src,'bp-photo-thumb','照片'));
          add(row,$('strong','',item.title || (photos?'照片':'筆記')));
          if(photos && !locked)row.append($('small','bp-muted',ownerState?.phoneUI?.photos?.some(photo=>photo.id===item.id)?'故事事件取得':'作者預先提供'));
          if (!photos || locked) row.append($('small','bp-muted',locked?'🔒 已鎖定':item.text.slice(0,100)));
          list.append(row);
        });
        area.append(list);
        if(photos && window.BAOImageGeneration){
          const collection=$('section','image-generation');area.append(collection);
          imageCollectionCleanup=window.BAOImageGeneration.mountCollection(collection,{phone:true});
        }
      }
    } else if (page === 'x') {
      renderX(area);
    }
    add(screen,area);
  }
  function renderX(area) {
    const items=itemsFor('x');
    // An invisible parent must not swallow replies that are visible on their own.
    const ids=new Set(items.map(item=>item.id));
    const lookup=id=>items.find(item=>item.id===id);
    const opened=subpage.startsWith('post:') ? lookup(subpage.slice(5)) : null;
    const postLabel=tweet=>tweet.authorName || config.contacts.find(c=>c.id===tweet.authorId)?.name || tweet.authorId || config.userName || '使用者';
    const postHandle=tweet=>tweet.authorHandle || (tweet.authorId ? '@'+tweet.authorId : config.twitterHandle || '@user');
    const repliesFor=tweet=>items.filter(item=>item.replyTo===tweet.id);
    const countFor=tweet=>{
      const actual=repliesFor(tweet).length;
      return actual ? String(Math.max(actual,Number(tweet.replies)||0)) : (tweet.replies || '0');
    };
    const cards=new Map(),Story=window.BAOPhoneStoryCore,photos=window.BAOPhoneDMPhotos;
    const publicPost=(source,id)=>source && Story?.xPublicPost(source.tweets,id,postId=>{
      const access=Puzzles?.access(source,ownerState?.phoneInteractions,{app:'x',id:postId});
      return !access || (access.exists && !access.locked && !access.hidden);
    });
    const active=()=>root && ownerState===GameState.current && ownerCharacter===App.activeCharacter && page==='x';
    const photoRows=()=>{
      if(!active() || !Story)return [];
      const live=phoneSource();
      return Story.xPhotoRows(Chat.messages,live?.tweets||[],id=>!!publicPost(live,id)).map(row=>{
        const post=live.tweets.find(t=>t.id===row.postId);
        return {...row,senderName:postLabel(post)};
      });
    };
    const mountPosts=()=>{if(photos?.mountXPosts)xPhotosCleanup=photos.mountXPosts({cards,rows:photoRows,
      active:row=>active() && photoRows().some(now=>now.postId===row.postId && now.message.id===row.message.id && now.signature===row.signature),refresh:render});};
    const composer=(post=null)=>{
      const form=$('form','bp-x-composer');form.dataset.phoneForm=post?'x-reply':'x-publish';
      const input=$('textarea');input.name='text';input.rows=2;input.maxLength=1200;
      input.placeholder=post?'回覆這則貼文…':'分享故事中的生活…';
      input.setAttribute('aria-label',post?'回覆 X 貼文':'發布 X 貼文');input.required=true;
      const send=$('button','',post?'傳送至故事':'發布至故事內 X');send.type='submit';
      add(form,input,send);area.append(form);
      if(photos && (!post || publicPost(config,post.id))){
        const location=subpage;
        dmPhotos=photos.mount({form,thread:area,target:{x:true,replyTo:post?.id||''},
          active:()=>active() && subpage===location && (!post || !!publicPost(phoneSource(),post.id)),refresh:render});
      }
    };
    const renderPost=(tweet,reply=false,openButton=false)=>{
      const row=$('article','bp-tweet'+(reply?' bp-x-comment':''));
      const name=postLabel(tweet);
      const byline=$('div','bp-x-byline');
      add(byline,$('strong','',name),$('small','bp-muted',postHandle(tweet)+' · '+(tweet.date || '')));
      const head=$('div','bp-x-post-header');
      add(head,image(tweet.avatar || (tweet.authorId && config.contacts.find(c=>c.id===tweet.authorId)?.avatar),'bp-x-avatar',name.slice(0,1)||'X'),byline);
      row.append(head);
      if(accessFor({app:'x',id:tweet.id}).locked){
        add(row,$('p','bp-muted','🔒 這則貼文尚未解鎖'));
      } else {
        add(row,$('p','bp-x-post-body',tweet.text),
          $('div','bp-muted bp-x-stats','♡ '+(tweet.likes || '0')+'    ↩ '+countFor(tweet)+'    ↻ '+(tweet.reposts || '0')));
        const source={witness:'目擊者敘述',media:'媒體資訊',hearsay:'轉述／傳聞',unknown:'來源未明'}[tweet.sourceKind];
        if(source)row.append($('small','bp-x-source',source));
        if(publicPost(config,tweet.id))cards.set(tweet.id,row);
      }
      if(openButton)row.append(button((reply?'查看這則回覆及後續留言 · ':'查看貼文與留言 · ')+countFor(tweet),'x-post:'+tweet.id,'bp-x-open'));
      return row;
    };
    if(subpage.startsWith('post:') && opened){
      add(area,appHeader('貼文與回覆',true),renderPost(opened,false,false));
      const responses=repliesFor(opened);
      const heading=$('h3','bp-x-feed-heading','回覆 · '+responses.length);
      area.append(heading);
      if(!responses.length)area.append($('p','bp-muted bp-x-no-replies','目前還沒有回覆。'));
      // Every reply is addressable, including replies to replies. Opening it
      // records only that specific post as read through the existing save flow.
      responses.forEach(item=>area.append(renderPost(item,true,true)));
      if(!accessFor({app:'x',id:opened.id}).locked){
        composer(opened);
      }else renderGate(area,{app:'x',id:opened.id});
      mountPosts();return;
    }
    add(area,appHeader('X · 動態',true));
    const banner=$('div','bp-x-banner');
    const profile=$('div','bp-x-profile');
    const multiAccount=items.some(tweet=>tweet.authorId || tweet.authorName || tweet.authorHandle || tweet.replyTo);
    if(multiAccount){
      add(profile,$('h2','','世界動態'),$('div','bp-muted','故事中的公開貼文與討論'));
    }else{
      add(profile,image(config.instagram.avatar,'bp-profile-avatar',(config.userName || 'X').slice(0,1)),
        $('h2','',(config.userName || '個人檔案')+' 🔒'),
        $('div','bp-muted',config.twitterHandle || '@user'));
    }
    add(area,banner,profile);
    composer();
    const roots=items.filter(item=>!item.replyTo || !ids.has(item.replyTo));
    if(!roots.length)emptyState(area,'目前沒有貼文','故事中出現的新貼文會顯示在這裡。');
    roots.forEach(tweet=>area.append(renderPost(tweet,false,true)));
    mountPosts();
  }
  function renderInstagram() {
    add(screen,statusbar(true));
    const area=$('div','bp-insta');
    if (subpage !== 'video') {
      add(area,image(config.instagram.avatar,'bp-insta-avatar',config.instagram.callerName.slice(0,1)||'●'),
        $('h2','',config.instagram.callerName || displayName()),
        $('p','','Instagram 視訊通話'),$('p','bp-call-ringing','來電中…'));
      const actions=$('div','bp-call-actions');
      add(actions,button('✕','hangup','bp-round bp-danger'),button('✓','accept','bp-round bp-accept'));
      area.append(actions);
    } else {
      if (config.instagram.video) {
        const video=$('video','bp-call-video');
        video.src=config.instagram.video; video.autoplay=true; video.loop=true; video.muted=true; video.playsInline=true;
        video.setAttribute('playsinline','');
        video.addEventListener('click',()=>{video.muted=false; void video.play().catch(()=>{});});
        area.append(video);
        void video.play().catch(()=>{});
      }
      const name=$('div','bp-video-heading');
      const timer=$('span','', '00:00'); timer.dataset.phoneDuration='';
      add(name,$('strong','',config.instagram.callerName || displayName()),timer);
      area.append(name);
      const self=$('div','bp-self-video'); self.setAttribute('aria-label','我的畫面');
      if(config.instagram.selfVideo) {
        const video=$('video');video.src=config.instagram.selfVideo;video.muted=true;video.loop=true;video.autoplay=true;video.playsInline=true;
        self.append(video);void video.play().catch(()=>{});
      } else self.textContent='我';
      self.addEventListener('pointerdown',startDrag);
      area.append(self);
      const float=$('div','bp-video-messages');float.setAttribute('aria-live','polite');
      area.append(float);
      const actions=$('div','bp-video-actions');
      [['⇄','flip'],['🎤','mute'],['▣','camera'],['✕','hangup']].forEach(([glyph,action])=>actions.append(button(glyph,action,'bp-round'+(action==='hangup'?' bp-danger':''))));
      area.append(actions);
      const form=$('form','bp-video-form');form.dataset.phoneForm='video';
      const input=$('input'); input.name='text'; input.placeholder='輸入訊息…';input.setAttribute('aria-label','視訊文字訊息');input.maxLength=1000;input.required=true;
      const send=$('button','', '➤');send.type='submit';add(form,input,send);area.append(form);
      callStart=Date.now(); callTimer=window.setInterval(()=>{
        if (!root || !root.querySelector('[data-phone-duration]')) return;
        const sec=Math.floor((Date.now()-callStart)/1000);
        root.querySelector('[data-phone-duration]').textContent=String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');
      },1000);
      let total=0;
      config.instagram.messages.forEach(msg=>{total+=msg.delay * 1000;
        messageTimers.push(window.setTimeout(()=>pushVideoMessage(msg.text,msg.from),total));
      });
    }
    add(screen,area);
  }
  function pushVideoMessage(text,from) {
    const host=root?.querySelector('.bp-video-messages');
    if (!host) return;
    const el=$('p','bp-video-msg', (from==='me'?'我: ':config.instagram.callerName+': ')+text);
    host.append(el);
    while(host.childElementCount>3) host.firstElementChild.remove();
    messageTimers.push(window.setTimeout(()=>el.remove(),6500));
  }
  function startDrag(e) {
    if (e.button !== 0 || !e.currentTarget) return;
    const node=e.currentTarget, box=node.getBoundingClientRect(), parent=node.parentElement.getBoundingClientRect();
    selfDragging={node,offsetX:e.clientX-box.left,offsetY:e.clientY-box.top,parent};
    node.setPointerCapture(e.pointerId);
    node.addEventListener('pointermove',dragSelf); node.addEventListener('pointerup',endDrag,{once:true});
    node.addEventListener('pointercancel',endDrag,{once:true});
  }
  function dragSelf(e) {
    if (!selfDragging || e.currentTarget!==selfDragging.node) return;
    const {node,parent,offsetX,offsetY}=selfDragging;
    const left=Math.max(0,Math.min(parent.width-node.offsetWidth,e.clientX-parent.left-offsetX));
    const top=Math.max(0,Math.min(parent.height-node.offsetHeight,e.clientY-parent.top-offsetY));
    node.style.left=left+'px';node.style.top=top+'px';node.style.right='auto';
  }
  function endDrag(e) {e.currentTarget.removeEventListener('pointermove',dragSelf);selfDragging=null;}
  function renderSpotify() {
    add(screen,statusbar(true));
    const area=$('div','bp-spotify');
    if (expanded && trackIndex>=0) {
      add(area,appHeader('正在播放'),image(currentTrack().cover || config.spotify.cover,'bp-now-cover','♫'));
      add(area,$('h2','',currentTrack().title),$('p','bp-muted',currentTrack().artist));
      const seek=$('input','bp-seek');seek.type='range';seek.min='0';seek.max=String(currentTrack().duration);seek.value=String(Math.floor(position));seek.dataset.phoneSeek='';
      area.append(seek);
      const progress=$('div','bp-progress-time');
      add(progress,$('span','bp-current-time',fmtTime(position)),$('span','',fmtTime(currentTrack().duration)));
      area.append(progress);
      const controls=$('div','bp-player-actions');
      [['⤨','shuffle'],['⏮','previous'],[playing?'❚❚':'▶','toggle'],['⏭','next'],['↻','loop']].forEach(([glyph,action])=>controls.append(button(glyph,action,'bp-player-button'+(action==='toggle'?' bp-play-main':''))));
      area.append(controls);
    } else {
      const cover=image(config.spotify.cover,'bp-playlist-cover','♫');
      add(area,cover,$('h1','',config.spotify.playlistName || '我的播放清單'),
        $('p','bp-muted',(config.spotify.creator||config.userName||'我')+' · '+config.spotify.tracks.length+' 首'));
      const controls=$('div','bp-spotify-tools');
      add(controls,$('span','', '↓   ↗   ···'),button('▶','play-first','bp-spotify-play'));area.append(controls);
      config.spotify.tracks.forEach((track,i) => {
        const row=button('','track:'+i,'bp-track'+(trackIndex===i?' bp-track-current':''));
        add(row,$('span','bp-track-icon',trackIndex===i?'♫':'♪'),
          add($('span','bp-track-meta'),$('strong','',track.title),$('small','bp-muted',track.artist)),
          $('span','bp-muted','···'));
        area.append(row);
      });
      if(trackIndex>=0) {
        const mini=$('div','bp-mini');
        const launch=button('', 'expand','bp-mini-open');
        add(launch,image(currentTrack().cover || config.spotify.cover,'bp-mini-cover','♫'),
          add($('span','bp-track-meta'),$('strong','',currentTrack().title),$('small','',currentTrack().artist)));
        add(mini,launch,button(playing?'❚❚':'▶','toggle','bp-mini-toggle'));
        const bar=$('div','bp-mini-progress');
        const fill=$('div','bp-mini-fill');fill.style.width=(position/currentTrack().duration*100)+'%';
        bar.append(fill);mini.append(bar);area.append(mini);
      }
    }
    add(screen,area);
  }
  function currentTrack() { return config.spotify.tracks[trackIndex] || {title:'',artist:'',duration:180}; }
  function fmtTime(s) { const sec=Math.max(0,Math.floor(s||0));return Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0'); }
  function updateProgress() {
    if (!root || page!=='spotify') return;
    const track=currentTrack();
    root.querySelectorAll('[data-phone-seek]').forEach(x=>{ if(document.activeElement!==x) x.value=String(Math.floor(position)); });
    const text=root.querySelector('.bp-current-time');if(text) text.textContent=fmtTime(position);
    const fill=root.querySelector('.bp-mini-fill');if(fill) fill.style.width=(position/track.duration*100)+'%';
  }
  function selectTrack(index, autoplay = true) {
    if (!config.spotify.tracks.length) return;
    trackIndex=(index+config.spotify.tracks.length)%config.spotify.tracks.length;
    const track=currentTrack();if(audio) {audio.pause();audio.src='';audio=null;}
    position=0;playing=autoplay;
    if(track.audio) {
      audio=new Audio(track.audio);audio.preload='metadata';audio.loop=loop;
      audio.addEventListener('ended',()=>nextTrack());
      audio.addEventListener('timeupdate',()=>{position=audio.currentTime;updateProgress();});
      if(autoplay) void audio.play().catch(()=>{playing=false;render();});
    } else if(autoplay) {
      // Simulate progress for tracks without audio; never call a provider.
    }
    window.clearInterval(messageFade);
    messageFade=window.setInterval(()=>{
      if(!playing || !root || page!=='spotify') return;
      if(!audio) {position+=1;if(position>=currentTrack().duration) nextTrack();else updateProgress();}
    },1000);
    render();
  }
  function nextTrack(direction=1) {
    if(!config.spotify.tracks.length)return;
    if(loop && direction===1 && position>=currentTrack().duration) {position=0;if(audio){audio.currentTime=0;void audio.play().catch(()=>{});} updateProgress();return;}
    const index=shuffle?Math.floor(Math.random()*config.spotify.tracks.length):(trackIndex+direction+config.spotify.tracks.length)%config.spotify.tracks.length;
    selectTrack(index,true);
  }
  function toggleTrack() {
    if(trackIndex<0){selectTrack(0,true);return;}
    playing=!playing;
    if(audio){if(playing) void audio.play().catch(()=>{playing=false;render();});else audio.pause();}
    render();
  }
  function sendToStory(text, medium, post=null, dm=null) {
    if (!App.config || typeof App.sendMessage !== 'function' || (dm && !dm.current())) return;
    if (App.__requestPending) { window.BAOFeedback?.notify?.('故事仍在回覆中，請稍後再傳送。','error');return; }
    const composer=document.getElementById('user-input');
    if (!composer) return;
    if (composer.value.trim() && !window.confirm('目前故事輸入框有尚未送出的內容，要用手機訊息取代嗎？')) return;
    if(window.BAOStoryImages?.hasDraft?.()){(dm?.error || window.alert)('故事輸入框已有待送照片，請先處理，以免傳錯對象。');return;}
    let xPrefix='';
    if(medium==='X' && (dm?.image || !post)){
      xPrefix=window.BAOPhoneStoryCore.xPublishPrefix('player-x-'+crypto.randomUUID(),post?.id||'');
      if(!xPrefix){(dm?.error || window.alert)('無法識別公開貼文，請重新開啟 X。');return;}
    }
    let nextText='';
    if(xPrefix){nextText=xPrefix+text;}
    else if(medium==='X' && post){
      const author=post.authorName || post.authorHandle || config.userName || '使用者';
      const quoted=post.text.replace(/\s+/g,' ').slice(0,120);
      nextText='【X｜回覆貼文 ID：'+post.id+'｜發文者：'+author+'｜原文：'+quoted+'】'+text;
    }else{
      const recipient=medium.startsWith('Instagram') ? (config.instagram.callerName||displayName()) : threadName(selectedThread());
      const threadContext=medium==='KakaoTalk' && selectedThread() ? '｜聊天室 ID：'+selectedThread().id : '';
      nextText=(dm?.group ? dm.prefix : '【'+medium+'｜對 '+recipient+' 發送訊息'+threadContext+'】')+text+(dm?.receipt || '');
    }
    if(dm?.image){
      const state=GameState.current,card=App.activeCharacter,threadId=activeThread;
      const originalTarget=medium==='KakaoTalk'?chatPhotoTarget(phoneSource(),threadId,state):null;
      const postFingerprint=t=>JSON.stringify([t.id,t.authorId,t.authorName,t.from,t.replyTo,t.text]);
      const originalPost=post && postFingerprint(post);
      const valid=()=>{
        if(GameState.current!==state || App.activeCharacter!==card)return false;
        const live=phoneSource();
        if(medium==='X'){
          if(!live?.apps.includes('x'))return false;
          if(!post)return true;
          const target=window.BAOPhoneStoryCore.xPublicPost(live.tweets,post.id,id=>{
            const access=Puzzles?.access(live,state.phoneInteractions,{app:'x',id});
            return !access || (access.exists && !access.locked && !access.hidden);
          });
          return !!target && postFingerprint(target)===originalPost;
        }
        const target=chatPhotoTarget(live,threadId,state);
        return !!originalTarget && target?.key===originalTarget.key && target?.prefix===originalTarget.prefix;
      };
      try{
        if(dm.confirmedRoute && dm.confirmedRoute===BAOStoryImagesCore.routeKey(App.config.api))
          App.config.api.visionConfirmedRoute=dm.confirmedRoute;
        window.BAOStoryImages.stagePhoneImage(dm.image,{text:nextText,valid});
      }catch(error){dm.error(error.message);return;}
    }
    composer.value=nextText;
    if(dm){
      const before=Chat.messages.at(-1)?.id;
      dm.error(dm.x?'等待公開貼文回覆…':dm.group?'等待群聊回覆…':'等待私訊回覆…');
      void Promise.resolve(App.sendMessage()).finally(()=>{
        if(!dm.current())return;
        if(Chat.messages.at(-1)?.role==='assistant' && Chat.messages.at(-1).id!==before){
          config=phoneSource();render();
        }else{
          close(); // The story composer owns the recoverable text/image draft.
        }
      });
    }else{
      close();
      void App.sendMessage();
    }
  }
  function onSubmit(e) {
    const form=e.target.closest('form[data-phone-form]');
    if (!form)return;
    e.preventDefault();
    if(form.dataset.phoneForm==='unlock'){
      const target={app:form.dataset.targetApp,id:form.dataset.targetId};
      if(commitOpen(target,form.elements.namedItem('password').value,form.querySelector('.bp-unlock-status'))){markNotices(item=>item.app===target.app && item.targetId===target.id);render();}
      return;
    }
    const input=form.elements.namedItem('text');const value=input?.value.trim();
    if(form.dataset.phoneForm==='message' && dmPhotos){
      const pending=dmPhotos;
      if(pending.busy){pending.error('請等照片處理完成。');return;}
      if(!value && !pending.image)return;
      void pending.ready.then(()=>{
        if(pending===dmPhotos && pending.current())sendToStory(value || (pending.group?'傳給群組一張照片。':'傳給你一張照片。'),'KakaoTalk',null,pending);
      });
      return;
    }
    if(['x-reply','x-publish'].includes(form.dataset.phoneForm) && dmPhotos?.x){
      const pending=dmPhotos;
      if(pending.busy){pending.error('請等照片處理完成。');return;}
      if(!value && !pending.image)return;
      const post=form.dataset.phoneForm==='x-reply'?config.tweets.find(item=>subpage==='post:'+item.id):null;
      if(form.dataset.phoneForm==='x-reply' && (!post || post.id!==pending.replyTo))return;
      void pending.ready.then(()=>{
        if(pending===dmPhotos && pending.current())sendToStory(value || '分享一張照片。','X',post,post && !pending.image?null:pending);
      });return;
    }
    if(!value)return;
    if(form.dataset.phoneForm==='x-reply'){
      const post=config.tweets.find(item=>subpage==='post:'+item.id);
      if(post && !accessFor({app:'x',id:post.id}).locked)sendToStory(value,'X',post);
      return;
    }
    sendToStory(value,form.dataset.phoneForm==='video'?'Instagram 視訊':'KakaoTalk');
  }
  function onAction(e) {
    const target=e.target.closest('[data-phone-action]');if(!target || target.disabled)return;
    const action=target.dataset.phoneAction;
    if (action==='launch')return open();
    if (action==='close')return close();
    if (action==='return-story'){close();document.getElementById('user-input')?.focus();return;}
    if (action.startsWith('notice:'))return openNotice(action.slice(7));
    if (action==='dismiss-notice'){eventNotice='';root?.querySelector('.bp-event-notice')?.remove();return;}
    if (action==='unlock')return enterHome();
    if (action==='home')return enterHome();
    if (action==='notifications'){page='notifications';subpage='';render();return;}
    if (action==='back') {
      if(page==='spotify' && expanded){expanded=false;return render();}
      if(['kakao','photos','notes','x'].includes(page) && subpage){subpage='';return render();}
      return enterHome();
    }
    if (action.startsWith('app:')) {
      const next=action.slice(4);
      if(!config.apps.includes(next))return;
      if(['x','phone','instagram'].includes(next) && !markNotices(item=>item.app===next && !item.targetId))return;
      page=next;subpage='';render();return;
    }
    if (action==='kakao-profile'){subpage='profile';return render();}
    if (action==='kakao-chat'){if(!markNotices(item=>item.app==='kakao' && !item.targetId))return;activeThread='';subpage='chat';return render();}
    if (action.startsWith('thread:')) {
      const thread=itemsFor('kakao')[Number(action.slice(7))];
      if(thread)enterTarget('kakao',thread.id);return;
    }
    if (action.startsWith('document:') && ['photos','notes'].includes(page)) {
      const item=itemsFor(page)[Number(action.slice(9))];
      if(item)enterTarget(page,item.id);return;
    }
    if (action.startsWith('x-post:')){
      const id=action.slice(7);
      const post=itemsFor('x').find(item=>item.id===id);
      if(!post)return;
      const access=accessFor({app:'x',id});
      if(!access.locked && !commitOpen({app:'x',id}))return;
      page='x';subpage='post:'+id;render();return;
    }
    if (action==='hangup')return enterHome();
    if (action==='accept'){clearTimers(); subpage='video';return render();}
    if (action==='flip'){const self=root?.querySelector('.bp-self-video');if(self)self.classList.toggle('bp-self-flipped');return;}
    if (action==='mute') {root?.querySelectorAll('.bp-call-video').forEach(v=>v.muted=!v.muted);target.classList.toggle('bp-selected');return;}
    if (action==='camera'){root?.querySelector('.bp-self-video')?.classList.toggle('bp-video-hidden');target.classList.toggle('bp-selected');return;}
    if (action==='play-first'){selectTrack(0,true);return;}
    if (action.startsWith('track:')){selectTrack(Number(action.slice(6)),true);return;}
    if (action==='expand'){expanded=true;return render();}
    if (action==='toggle'){toggleTrack();return;}
    if (action==='previous'){nextTrack(-1);return;}
    if (action==='next'){nextTrack(1);return;}
    if (action==='shuffle'){shuffle=!shuffle;target.classList.toggle('bp-selected');return;}
    if (action==='loop'){loop=!loop;if(audio)audio.loop=loop;target.classList.toggle('bp-selected');}
  }
  document.addEventListener('keydown', e => {if(e.key==='Escape'&&root&&!document.querySelector('[data-image-dialog]')){e.preventDefault();close();}});
  document.addEventListener('input', e => {
    if(e.target?.matches?.('[data-phone-seek]') && trackIndex>=0){
      position=Math.min(currentTrack().duration,Math.max(0,Number(e.target.value)||0));
      if(audio)audio.currentTime=position;updateProgress();
    }
  });
  if (typeof App.wrapRenderChatShell === 'function') {
    App.wrapRenderChatShell('phone-ui:launcher', function(next,...args){const result=next(...args);makeLauncher();return result;});
  }
  if (typeof App.wrapShowView === 'function') {
    App.wrapShowView('phone-ui:close-on-exit', function(next,...args){
      if(args[0] !== 'chat') close();
      const result=next(...args);
      window.setTimeout(makeLauncher,0);
      return result;
    });
  }
  const refreshFromState = () => {
    makeLauncher();
    if (!root) return;
    if(ownerState!==window.GameState?.current || ownerCharacter!==App.activeCharacter){close();return;}
    const updated = phoneSource();
    if (!updated) { close(); return; }
    config = updated;
    if(dmPhotos && !dmPhotos.x && !dmPhotos.current()){render();return;}
    // Keep active media and focused messaging surfaces intact.
    if ((page === 'photos' || page === 'notes') || page === 'home' || page === 'lock' || page === 'phone' || page === 'x' ||
        (page === 'kakao' && subpage !== 'chat')) render();
  };
  window.BAOPhoneUI=Object.freeze({open,close,refresh:makeLauncher,refreshFromState});
})();