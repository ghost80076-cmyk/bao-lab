/* KakaoTalk and X photo exchange. The story reply owns the offer;
   only a committed local image reference means the photo was delivered. */
(() => {
  'use strict';
  const assets = window.BAOImageAssets;
  const generation = window.BAOImageGeneration;
  const node = (tag, text) => {
    const element = document.createElement(tag);
    if (text) element.textContent = text;
    return element;
  };
  function exchanges(target) {
    if(target.group)return window.BAOPhoneStoryCore.groupPhotoExchanges(Chat.messages,target);
    const rows = [];
    let addressed = false, sent = null;
    for (const message of Chat.messages) {
      if (message.role === 'user') {
        addressed = typeof message.content === 'string' && message.content.startsWith(target.prefix);
        sent = addressed && message.storyImage ? {message,image:message.storyImage} : null;
        if (sent) rows.push(sent);
      } else if (addressed && message.role === 'assistant') {
        const selected = message.variants?.[message.activeVariant || 0];
        const patch = selected ? selected.phonePatch : message.phonePatch;
        const messages = target.threadId ? patch?.threads?.find(t=>t.id===target.threadId)?.messages : patch?.chat;
        const reply = messages?.findLast(m=>m.from!=='me');
        const anchor = reply && {messageId:message.id,text:reply.text};
        if(sent)sent.anchor=anchor;
        const offer = patch?.photoOffer;
        if (offer?.threadId === target.threadId && typeof offer.description === 'string') {
          rows.push({message,offer,anchor,signature:offer.kind+'|'+offer.description});
        }
        addressed = false;
      }
    }
    return rows;
  }
  function mount({form,thread,target,active,refresh}) {
    const scope = assets.scope();
    const controls = node('div');
    controls.className='bp-dm-photo-controls';
    form.after(controls);
    const file=node('input'),pick=node('button','附照片'),preview=node('img'),status=node('small');
    file.type='file';file.accept='image/jpeg,image/png,image/webp';file.hidden=true;
    pick.type='button';preview.alt=target.x?'待公開發布的 X 照片':target.group?'待傳送群聊照片':'待傳送私訊照片';preview.hidden=true;
    status.setAttribute('role','status');
    const remove=node('button','移除照片');remove.type='button';remove.hidden=true;
    const confirmRoute=node('label'), confirmed=node('input');
    confirmed.type='checkbox';confirmRoute.append(confirmed,document.createTextNode('我已確認此模型與端點支援 Vision'));
    const routeKey=BAOStoryImagesCore.routeKey(App.config.api);
    confirmRoute.hidden=true;
    controls.append(file,pick,preview,remove,confirmRoute,status);
    const caption=form.elements.namedItem('text');
    let draft=null,busy=false,dead=false,ticket=0;
    const cleanups=[];
    const current=()=>!dead && active() && form.isConnected &&
      assets.scope().storyId===scope.storyId && assets.scope().chapterId===scope.chapterId;
    function reset(){
      ++ticket;busy=false;draft=null;preview.removeAttribute('src');preview.hidden=remove.hidden=true;
      file.value='';confirmed.checked=false;confirmRoute.hidden=true;caption.required=true;status.textContent='';
    }
    pick.onclick=()=>file.click();remove.onclick=reset;
    file.onchange=async()=>{
      const selected=file.files[0];if(!selected)return;
      reset();const attempt=ticket;busy=true;status.textContent='正在處理照片…';
      try{
        const image=await BAOStoryImages.encode(selected);
        const space=await navigator.storage?.estimate?.();
        if(space?.quota && space.quota-space.usage < image.data.length*12+1024*1024)
          throw new Error('本機空間不足，請先備份並清理空間。');
        if(!current() || attempt!==ticket)return;
        confirmRoute.hidden=BAOStoryImagesCore.capability(App.config.api)!=='unknown';
        draft=image;preview.src=image.data;preview.hidden=remove.hidden=false;caption.required=false;
        status.textContent='傳送後，照片隨故事保存並交給目前的 Vision 模型。可能產生費用。'+(target.x?'範圍：故事內公開 X '+(target.replyTo?'留言':'貼文')+'，不會發到現實社群。':target.group?'收件群組：'+target.name+'（'+target.audience+'）':'收件人：'+target.name);
      }catch(error){if(current() && attempt===ticket)status.textContent=error.message;}
      finally{if(attempt===ticket)busy=false;}
    };
    let receipts=[];
    const delivery = target.x?Promise.resolve([]):assets.list(scope.storyId).then(all=>assets.visible(all,scope).filter(r=>r.dmKey===target.key));
    async function paint(){
      if(target.x)return;
      const saved=await delivery;if(!current())return;
      const history=exchanges(target).slice(-50);
      // Locate matching reply bubbles from newest to oldest, including repeated text.
      const bubbles=[...thread.querySelectorAll('.bp-chat-row:not(.bp-mine)')];
      const anchors=new Map();let cursor=bubbles.length-1;
      for(const row of history.slice().reverse()){
        if(!row.anchor || anchors.has(row.anchor.messageId))continue;
        for(let i=cursor;i>=0;i--){
          if(bubbles[i].querySelector('.bp-bubble')?.textContent===row.anchor.text && (!target.group || bubbles[i].dataset.photoSenderId===row.anchor.senderId)){
            anchors.set(row.anchor.messageId,bubbles[i]);cursor=i-1;break;
          }
        }
      }
      for(const row of history){
        const bubble=node('div');bubble.className='bp-chat-row'+(row.image?' bp-mine':'');
        if(row.image){
          const img=node('img');img.alt='你傳給'+target.name+'的照片';img.loading='lazy';
          img.src=BAOStoryImagesCore.validate(row.image).data;bubble.append(img);
        }else{
          const senderId=target.group?row.senderId:target.senderId;
          const senderName=target.group?(target.memberNames?.[senderId] || senderId):target.name;
          const record=saved.find(r=>r.messageId===row.message.id && r.dmOffer===row.signature);
          if(record){
            receipts.push(record.title);
            const thumb=generation.thumbnail(record);cleanups.push(thumb.cleanup);
            bubble.append(node('small',senderName+' 已傳送照片'),thumb.img,node('span',record.title));
            if(!record.inPhone){
              const collect=node('button','收藏至 Phone 相簿');collect.type='button';
              collect.onclick=async()=>{
                collect.disabled=true;
                try{
                  await assets.collect(record.id);collect.remove();
                }catch(error){status.textContent=error.message;collect.disabled=false;}
              };
              bubble.append(collect);
            }
          }else{
            const action=node('button','查看照片提議');action.type='button';
            action.onclick=()=>{
              const valid=()=>current() && exchanges(target).some(r=>r.message.id===row.message.id && r.signature===row.signature);
              if(!valid())return;
              const view=BAOStoryImagePrompts.dialog(senderName+' 想傳一張照片',target.group?'確認費用後才生成。預覽後選擇傳送，照片才會出現在 '+target.name+'（'+target.audience+'）。':'確認費用後才生成。預覽後選擇傳送，照片才會出現在這段私訊。');
              view.overlay.style.zIndex='2147482100';
              generation.attach(view,{scene:{id:row.message.id,context:row.offer.description},card:App.activeCharacter,
                output:()=>({image_prompt:row.offer.description}),profile:{value:BAOStoryImagePrompts.profileOf(App.activeCharacter)},
                dm:{...target,senderId,name:senderName,offer:row.offer,signature:row.signature,valid,delivered:refresh}});
              view.panel.append(view.status,view.close);
            };
            bubble.append(node('small',senderName+' 提議分享照片'),node('span',row.offer.description),action);
          }
        }
        bubble.classList.add('bp-dm-photo');
        const anchor=anchors.get(row.anchor?.messageId);
        if(!anchor)thread.append(bubble);
        else if(row.image)anchor.before(bubble);
        else anchor.after(bubble);
      }
    }
    const ready=paint().catch(()=>{if(current())status.textContent='無法讀取私訊照片。';});
    return {ready, current, group:target.group===true,x:target.x===true,replyTo:target.replyTo||'',prefix:target.prefix,get image(){return draft;}, get busy(){return busy;},
      get confirmedRoute(){return !confirmRoute.hidden && confirmed.checked?routeKey:'';},
      get receipt(){return receipts.length?'（這段'+(target.group?'群聊':'私訊')+'之前已收到照片：'+receipts.slice(-3).join('、')+'）':'';},
      error:text=>{status.textContent=text;},cleanup(){dead=true;cleanups.forEach(fn=>fn());}};
  }
  function mountXPosts({cards,rows,active,refresh}) {
    const scope=assets.scope(),cleanups=[];let dead=false;
    const current=()=>!dead && assets.scope().storyId===scope.storyId && assets.scope().chapterId===scope.chapterId;
    const paint=async()=>{
      const saved=assets.visible(await assets.list(scope.storyId),scope);
      if(!current())return;
      for(const row of rows()){
        const card=cards.get(row.postId);
        if(!card?.isConnected)continue;
        const box=node('div');box.className='bp-x-photo';
        if(row.image){
          try{const img=node('img');img.src=BAOStoryImagesCore.validate(row.image).data;img.alt='你公開發布的 X 照片';img.loading='lazy';box.append(img);}catch(_){continue;}
        }else{
          const record=saved.find(r=>r.dmKey===row.key && r.messageId===row.message.id && r.dmOffer===row.signature);
          if(record){
            const thumb=generation.thumbnail(record);cleanups.push(thumb.cleanup);
            box.append(node('small','已公開發布照片'),thumb.img,node('span',record.title));
            if(!record.inPhone){
              const collect=node('button','收藏至 Phone 相簿');collect.type='button';
              collect.onclick=async()=>{if(!current() || !active(row))return;collect.disabled=true;try{await assets.collect(record.id);collect.remove();}catch(error){collect.disabled=false;collect.textContent=error.message;}};
              box.append(collect);
            }
          }else{
            const action=node('button','查看公開照片提議');action.type='button';
            action.onclick=()=>{
              const valid=()=>current() && card.isConnected && active(row);
              if(!valid())return;
              const senderName=row.senderName || row.senderId;
              const view=BAOStoryImagePrompts.dialog(senderName+' 想在 X 分享照片','僅限故事內公開貼文或留言。確認費用後生成，預覽後必須再確認發布。');
              view.overlay.style.zIndex='2147482100';
              generation.attach(view,{scene:{id:row.message.id,context:row.offer.description},card:App.activeCharacter,
                output:()=>({image_prompt:row.offer.description}),profile:{value:BAOStoryImagePrompts.profileOf(App.activeCharacter)},
                dm:{x:true,key:row.key,senderId:row.senderId,name:senderName,offer:row.offer,signature:row.signature,valid,delivered:refresh}});
              view.panel.append(view.status,view.close);
            };
            box.append(node('small','尚未公開的照片提議'),node('span',row.offer.description),action);
          }
        }
        card.append(box);
      }
    };
    void paint().catch(()=>{if(current())for(const card of cards.values())if(card.isConnected)card.append(node('small','無法讀取本機公開照片。'));});
    return ()=>{dead=true;cleanups.forEach(fn=>fn());};
  }
  window.BAOPhoneDMPhotos=Object.freeze({mount,mountXPosts});
})();
