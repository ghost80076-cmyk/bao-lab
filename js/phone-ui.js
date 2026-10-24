/* YoruBay phone surface. Optional story presentation, not a separate simulation engine. */
(() => {
  'use strict';
  const Core = window.BAOPhoneUICore;
  if (!Core || typeof App === 'undefined' || window.BAOPhoneUI) return;
  let root = null, screen = null, config = null, page = 'lock', subpage = '';
  let clock = null, callTimer = null, callStart = 0, messageTimers = [], messageFade = null;
  let audio = null, trackIndex = -1, playing = false, position = 0, expanded = false, shuffle = false, loop = false;
  let prevFocus = null, selfDragging = null;
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
  const displayName = () => config.contactName || config.instagram.callerName || '친구';
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
      return combine({ ...source, ...extra, weather: { ...source.weather, ...extra.weather },
        instagram: { ...source.instagram, ...extra.instagram }, spotify: { ...source.spotify, ...extra.spotify } });
    }
    return combine(source);
  };
  const visible = () => !!phoneSource();
  function makeLauncher() {
    const existing = document.getElementById('bao-phone-launch');
    const enabled = visible() && document.getElementById('chat-view')?.classList.contains('active');
    if (!enabled) { existing?.remove(); if (root) close(); return; }
    if (existing) return;
    const main = document.querySelector('#chat-view .chat-main');
    if (!main) return;
    const launch = button('📱 휴대폰 · 手機介面', 'launch', 'bao-phone-launch secondary');
    launch.id = 'bao-phone-launch'; launch.setAttribute('aria-label', '開啟作品手機介面');
    launch.addEventListener('click', open);
    const host = main.querySelector('.chat-topline') || main;
    host.prepend(launch);
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
    clearTimers(); stopMedia(); root?.remove(); root = null; screen = null;
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
    prevFocus = document.activeElement; page = 'lock'; subpage = '';
    const overlay = $('div', 'bao-phone-overlay');
    overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', '作品手機介面');
    const frame = $('div', 'bp-frame');
    screen = $('div', 'bp-screen');
    add(frame, screen); add(overlay, frame); document.body.append(overlay); root = overlay;
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
    render(); frame.focus?.();
  }
  function updateClock() {
    if (!root) return;
    const now = new Date();
    const time = now.toLocaleTimeString('ko-KR', {hour:'2-digit',minute:'2-digit',hour12:false});
    const date = new Intl.DateTimeFormat('ko-KR', {month:'long',day:'numeric',weekday:'long'}).format(now);
    root.querySelectorAll('[data-phone-clock]').forEach(node => { node.textContent = time; });
    root.querySelectorAll('[data-phone-date]').forEach(node => { node.textContent = date; });
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
  function handle() { return button('', 'home', 'bp-home-handle'); }
  function render() {
    if (!screen || !config) return;
    screen.replaceChildren();
    screen.className = 'bp-screen bp-' + page;
    if (page === 'lock') renderLock();
    else if (page === 'home') renderHome();
    else if (page === 'instagram') renderInstagram();
    else if (page === 'spotify') renderSpotify();
    else renderBasicApp();
    if (page !== 'instagram' || subpage !== 'video') add(screen, handle());
    updateClock();
  }
  function renderLock() {
    wallpaper(screen); add(screen, statusbar());
    const stack = $('div', 'bp-lock-main');
    const stamp = $('div', 'bp-lock-clock'); stamp.dataset.phoneClock = '';
    const date = $('div', 'bp-lock-date'); date.dataset.phoneDate = '';
    add(stack, date, stamp, $('div', 'bp-lock-label', config.userName));
    add(screen, stack, $('div', 'bp-lock-hint', '위로 쓸어 올려 잠금 해제'));
  }
  function renderHome() {
    wallpaper(screen); add(screen, statusbar());
    const widgets = $('div', 'bp-widgets');
    const weather = $('section', 'bp-widget');
    add(weather, $('div','bp-widget-label', '날씨 · ' + (config.weather.place || '—')),
      $('div','bp-temp',config.weather.temp || '—'),
      $('div','',config.weather.desc || ' '),
      $('div','bp-muted','최고 ' + (config.weather.high || '—') + '  최저 ' + (config.weather.low || '—')));
    const agenda = $('section', 'bp-widget');
    add(agenda, $('div','bp-widget-label','오늘 일정'));
    (config.events.length ? config.events.slice(0,2) : [{time:'—',title:'일정 없음'}]).forEach(ev =>
      add(agenda,$('div','bp-agenda', (ev.time || '') + '  ' + (ev.title || ''))));
    add(widgets,weather,agenda); add(screen,widgets);
    const grid = $('div', 'bp-apps');
    const apps = [
      ['phone','☎','전화'],['kakao','●','KakaoTalk'],['x','𝕏','X'],['instagram','◎','Instagram'],
      ['spotify','♫','Spotify'],['photos','✿','사진'],['notes','▤','메모'],['maps','⌖','지도'],
      ['youtube','▶','YouTube'],['settings','⚙','설정'],['camera','◉','카메라'],['messages','▤','메시지']
    ];
    apps.forEach(([id,glyph,label]) => {
      const wrap = $('div','bp-app-wrap');
      const icon = button(glyph,'app:'+id,'bp-icon bp-icon-'+id);
      if (!['phone','kakao','x','instagram','spotify'].includes(id)) icon.disabled = true;
      add(wrap, icon, $('span','bp-app-name',label)); grid.append(wrap);
    });
    add(screen,grid);
    const dock = $('div','bp-dock');
    [['phone','☎'],['kakao','●'],['messages','▤'],['camera','◉']].forEach(([id,glyph]) => {
      const b = button(glyph,'app:'+id,'bp-icon bp-icon-'+id);
      if (!['phone','kakao'].includes(id)) b.disabled = true;
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
    if (page === 'phone') {
      add(area,appHeader('최근 통화'),$('h1','','최근 통화'));
      config.calls.forEach(group => {
        add(area,$('h4','bp-group-heading',group.group));
        group.items.forEach(call => {
          const row = $('div','bp-list-row');
          const missed = /未接|miss|부재중/.test(call.type);
          add(row,$('span','bp-call-dot'+(missed?' bp-red':''),missed?'●':'↗'),
            $('div','bp-flex',call.name || displayName() || '알 수 없음'),
            $('small','bp-muted',(call.count ? '('+call.count+') ' : '') + call.time));
          area.append(row);
        });
      });
      const tabs = $('div','bp-phone-tabs');
      ['즐겨찾기','최근 통화','연락처','키패드'].forEach(x => tabs.append($('span','',x)));
      area.append(tabs);
    } else if (page === 'kakao') {
      const chat = subpage === 'chat', profile = subpage === 'profile';
      if (chat) {
        add(area,appHeader(displayName()),$('div','bp-thread'));
        const thread = area.querySelector('.bp-thread');
        config.chat.forEach(item => {
          const row = $('div','bp-chat-row '+(item.from === 'me'?'bp-mine':''));
          add(row,$('span','bp-bubble',item.text),$('small','bp-muted',item.time || ''));
          thread.append(row);
        });
        const form = $('form','bp-composer'); form.dataset.phoneForm = 'message';
        const input = $('input'); input.name='text'; input.maxLength=1600; input.placeholder='메시지 입력…'; input.required=true;
        const send = $('button','', '전송'); send.type='submit';
        add(form,input,send); area.append(form);
        window.setTimeout(()=>{ if (thread.isConnected) thread.scrollTop = thread.scrollHeight; },0);
      } else if (profile) {
        add(area,appHeader('프로필'),image(config.instagram.avatar,'bp-profile-avatar',config.userName.slice(0,1)||'●'),
          $('h2','bp-centered',config.userName || '나'));
      } else {
        add(area,appHeader('친구'),$('h1','','친구'));
        const mine = button('', 'kakao-profile','bp-friend');
        add(mine,image(config.instagram.avatar,'bp-friend-avatar',config.userName.slice(0,1)||'나'),
          $('span','',config.userName || '나')); area.append(mine);
        add(area,$('h4','bp-group-heading','친구'));
        const friend = button('', 'kakao-chat','bp-friend');
        add(friend,image(config.instagram.avatar,'bp-friend-avatar',displayName().slice(0,1)||'●'),
          $('span','',displayName())); area.append(friend);
      }
    } else if (page === 'x') {
      add(area,appHeader('프로필',true));
      const banner=$('div','bp-x-banner');
      const profile=$('div','bp-x-profile');
      add(profile,image(config.instagram.avatar,'bp-profile-avatar',config.userName.slice(0,1)||'X'),
        $('h2','', (config.userName || '프로필') + ' 🔒'),
        $('div','bp-muted',config.twitterHandle || '@user'));
      add(area,banner,profile);
      config.tweets.forEach(tweet => {
        const row = $('article','bp-tweet');
        add(row,$('strong','',config.userName || '사용자'),
          $('small','bp-muted','  '+(config.twitterHandle || '@user')+' · '+(tweet.date || '')),
          $('p','',tweet.text),
          $('div','bp-muted','♡ '+(tweet.likes || '0')+'    ↩ '+(tweet.replies || '0')+'    ↻ '+(tweet.reposts || '0')));
        area.append(row);
      });
    }
    add(screen,area);
  }
  function renderInstagram() {
    add(screen,statusbar(true));
    const area=$('div','bp-insta');
    if (subpage !== 'video') {
      add(area,image(config.instagram.avatar,'bp-insta-avatar',config.instagram.callerName.slice(0,1)||'●'),
        $('h2','',config.instagram.callerName || displayName()),
        $('p','','Instagram 영상 통화'),$('p','bp-call-ringing','전화 오는 중…'));
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
      const self=$('div','bp-self-video'); self.setAttribute('aria-label','내 화면');
      if(config.instagram.selfVideo) {
        const video=$('video');video.src=config.instagram.selfVideo;video.muted=true;video.loop=true;video.autoplay=true;video.playsInline=true;
        self.append(video);void video.play().catch(()=>{});
      } else self.textContent='나';
      self.addEventListener('pointerdown',startDrag);
      area.append(self);
      const float=$('div','bp-video-messages');float.setAttribute('aria-live','polite');
      area.append(float);
      const actions=$('div','bp-video-actions');
      [['⇄','flip'],['🎤','mute'],['▣','camera'],['✕','hangup']].forEach(([glyph,action])=>actions.append(button(glyph,action,'bp-round'+(action==='hangup'?' bp-danger':''))));
      area.append(actions);
      const form=$('form','bp-video-form');form.dataset.phoneForm='video';
      const input=$('input'); input.name='text'; input.placeholder='메시지 보내기…';input.maxLength=1000;input.required=true;
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
    const el=$('p','bp-video-msg', (from==='me'?'나: ':config.instagram.callerName+': ')+text);
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
      add(area,appHeader('지금 재생 중'),image(currentTrack().cover || config.spotify.cover,'bp-now-cover','♫'));
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
      add(area,cover,$('h1','',config.spotify.playlistName || '내 플레이리스트'),
        $('p','bp-muted',(config.spotify.creator||config.userName||'나')+' · '+config.spotify.tracks.length+'곡'));
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
  function sendToStory(text, medium) {
    if (!App.config || typeof App.sendMessage !== 'function') return;
    if (App.__requestPending) { window.BAOFeedback?.notify?.('이전 응답을 기다려 주세요.','error');return; }
    const composer=document.getElementById('user-input');
    if (!composer) return;
    if (composer.value.trim() && !window.confirm('目前故事輸入框有尚未送出的內容，要用手機訊息取代嗎？')) return;
    const recipient=medium==='Instagram' ? (config.instagram.callerName||displayName()) : displayName();
    composer.value='【'+medium+'｜對 '+recipient+' 發送訊息】'+text;
    close();
    void App.sendMessage();
  }
  function onSubmit(e) {
    const form=e.target.closest('form[data-phone-form]');
    if (!form)return;
    e.preventDefault();
    const input=form.elements.namedItem('text');const value=input?.value.trim();
    if(!value)return;
    if(form.dataset.phoneForm==='video') pushVideoMessage(value,'me');
    sendToStory(value,form.dataset.phoneForm==='video'?'Instagram 視訊':'KakaoTalk');
  }
  function onAction(e) {
    const target=e.target.closest('[data-phone-action]');if(!target || target.disabled)return;
    const action=target.dataset.phoneAction;
    if (action==='launch')return open();
    if (action==='close')return close();
    if (action==='unlock')return enterHome();
    if (action==='home')return enterHome();
    if (action==='back') {
      if(page==='spotify' && expanded){expanded=false;return render();}
      if(page==='kakao' && subpage){subpage='';return render();}
      return enterHome();
    }
    if (action.startsWith('app:')) {
      const next=action.slice(4);
      if(!['phone','kakao','x','instagram','spotify'].includes(next))return;
      page=next;subpage='';render();return;
    }
    if (action==='kakao-profile'){subpage='profile';return render();}
    if (action==='kakao-chat'){subpage='chat';return render();}
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
  document.addEventListener('keydown', e => {if(e.key==='Escape'&&root){e.preventDefault();close();}});
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
    if (!root) return;
    const updated = phoneSource();
    if (!updated) { close(); return; }
    config = updated;
    // Keep active media and focused messaging surfaces intact.
    if (page === 'home' || page === 'lock' || page === 'phone' || page === 'x' ||
        (page === 'kakao' && subpage !== 'chat')) render();
  };
  window.BAOPhoneUI=Object.freeze({open,close,refresh:makeLauncher,refreshFromState});
})();
