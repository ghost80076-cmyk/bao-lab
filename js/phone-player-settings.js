/* Per-story player phone options. Available in existing and new stories; never edits cards. */
(() => {
  'use strict';
  if (window.BAOPhonePlayerSettings || !window.BAOPhonePlayerCore ||
      !window.BAOPhoneUICore || typeof App === 'undefined') return;
  const Core=window.BAOPhonePlayerCore;
  const $=(tag,cls,text) => {
    const node=document.createElement(tag);
    if(cls) node.className=cls;
    if(text!==undefined) node.textContent=String(text);
    return node;
  };
  const clone = value => {
    try { return structuredClone(value); }
    catch (_) { return JSON.parse(JSON.stringify(value)); }
  };
  const active = () => !!window.GameState?.current &&
    !!App.activeCharacter && !!document.getElementById('chat-view')?.classList.contains('active');
  let modal=null;
  const close = () => {modal?.close?.();modal?.remove();modal=null;};
  function refresh() {
    const current=document.getElementById('bao-phone-player-entry');
    const tool=document.getElementById('bao-phone-player-tool-entry');
    if(!active()) {current?.remove();tool?.remove();close();return;}
    const main=document.querySelector('#chat-view .chat-main .chat-topline');
    const aside=document.querySelector('#chat-view .chat-layout > aside');
    const scene=aside?.querySelector('[data-chat-tool-body="scene"]') || aside;
    for(const [id,target] of [['bao-phone-player-entry',main],['bao-phone-player-tool-entry',scene]]){
      if(!target)continue;
      let button=document.getElementById(id);
      if(!button) {
        button=$('button','secondary bao-phone-player-entry','📱 手機設定');
        button.id=id;button.type='button';
        button.dataset.searchKeywords='手機 互動 UI 畫面 開啟 關閉 電話 社群';
        button.addEventListener('click',open);
      }
      if(button.parentElement!==target)target.append(button);
    }
  }
  function open(){
    if(!active())return;
    if(App.__requestPending){window.BAOFeedback?.notify?.('目前正在產生故事，請完成本輪再修改手機設定。','error');return;}
    close();
    const state=GameState.current;
    const character=App.activeCharacter;
    const previous=Core.read(state.phoneSurface);
    const authored=window.BAOPhoneUICore.normalize(character?.phone_ui);
    const effective=Core.resolve(character?.phone_ui,state);
    const current=effective||authored||window.BAOPhoneUICore.defaultConfig();
    modal=$('dialog','bao-phone-settings-dialog');
    modal.setAttribute('aria-label','故事手機介面設定');
    const heading=$('div','bp-settings-heading');
    const title=$('h2','', '📱 故事裡的手機');
    const x=$('button','bp-settings-close','✕');x.type='button';x.setAttribute('aria-label','關閉設定');
    x.addEventListener('click',close);
    heading.append(title,x);
    const description=$('p','bp-settings-intro','在故事裡用手機傳訊息給角色、查看通話與社群動態。傳訊息會交給目前的故事 AI 處理，不會連接真實通訊帳號。');
    const form=$('form','bp-settings-form');
    form.addEventListener('submit',event => {event.preventDefault();save(event,state,character);});
    const on=field('在這個故事中開啟手機','checkbox','enabled',previous?.enabled??Boolean(authored));
    const owner=field('這是誰的手機？（可留白）','text','userName',previous?.userName??current.userName,'例：你的人物姓名','填故事中的手機持有人。留白表示未指定，不會自動認定是玩家。');
    const contact=field('想傳訊息給誰？（可留白）','text','contactName',previous?.contactName??current.contactName,'例：角色姓名「阿晴」','填故事中的角色姓名，不需要電話或真實帳號；填名稱不會自動建立新角色。');
    const handle=field('故事內的 X 顯示帳號（可留白）','text','twitterHandle',previous?.twitterHandle??current.twitterHandle,'例：@rain','只影響手機內的貼文顯示，不需要登入真實 X 帳號。');
    const advanced=$('details','bp-settings-advanced');
    const summary=$('summary','', '更多設定與匯入資料（可略過）');
    const note=$('p','', '一般遊玩不需要填寫資料代碼。只有作者提供手機資料，或你熟悉 JSON 格式時，才需要使用下方欄位。留白會沿用作品內容。');
    const input=$('textarea');input.name='data';input.rows=5;input.maxLength=20000;input.spellcheck=false;
    input.placeholder='在這裡貼上作者提供的手機資料 JSON（最多 20,000 字元）';
    input.id='bp-phone-data';input.setAttribute('aria-label','匯入手機資料 JSON');
    const dataLabel=$('label','bp-settings-field');dataLabel.htmlFor=input.id;dataLabel.textContent='匯入手機資料 JSON（進階）';
    if(previous?.data) input.value=JSON.stringify(previous.data,null,2);
    advanced.append(summary,handle,note,dataLabel,input);
    const msg=$('p','bp-settings-error');msg.dataset.phoneSettingsError='';msg.setAttribute('role','status');
    const actions=$('div','bp-settings-actions');
    const reset=$('button','secondary','恢復作品預設');reset.type='button';
    reset.addEventListener('click',()=>{
      if(!canSave(state,character,msg))return;
      const old=state.phoneSurface;
      delete state.phoneSurface;
      if(App.saveStory(false)===false) {
        state.phoneSurface=old;msg.textContent='故事儲存失敗，沒有變更手機設定。';return;
      }
      close();window.BAOPhoneUI?.refresh?.();
    });
    const saveBtn=$('button','primary','儲存手機設定');saveBtn.type='submit';
    actions.append(reset,saveBtn);
    const startHint=$('p','bp-settings-hint','只要勾選並儲存，就能開啟手機；下面都可以留白。名稱只設定這個故事，其他故事與作者作品不會被修改。');
    form.append(on,startHint,owner,contact,advanced,msg,actions);
    modal.append(heading,description,form);
    modal.addEventListener('close',()=>{modal?.remove();modal=null;});
    document.body.append(modal);modal.showModal();
  }
  function field(title,type,name,value,placeholder='',help='') {
    const label=$('label','bp-settings-field');
    const text=$('span','',title);const input=$('input');
    input.type=type;input.name=name;
    if(type==='checkbox') input.checked=Boolean(value);
    else{input.value=String(value||'');input.maxLength=80;input.placeholder=placeholder;}
    label.append(input,text);
    if(type!=='checkbox'){label.replaceChildren(text,input);}
    if(help){const hint=$('small','bp-settings-field-help',help);hint.id='bp-phone-help-'+name;input.setAttribute('aria-describedby',hint.id);label.append(hint);}
    return label;
  }
  function canSave(state,character,status){
    if(state!==GameState.current || character!==App.activeCharacter){
      status.textContent='故事已經切換，請重新開啟設定。';return false;
    }
    if(App.__requestPending){status.textContent='請在本輪故事回覆完成後再修改設定。';return false;}
    return true;
  }
  function save(event,state,character) {
    const form=event.currentTarget,status=form.querySelector('[data-phone-settings-error]');
    status.textContent='';
    if(!canSave(state,character,status))return;
    let data=null;
    const raw=form.elements.namedItem('data').value.trim();
    if(raw){
      try{data=JSON.parse(raw);}
      catch(_){status.textContent='自訂手機資料不是有效 JSON，請檢查格式。';return;}
      if(!data || typeof data!=='object' || Array.isArray(data)){
        status.textContent='自訂手機資料必須是 JSON 物件。';return;
      }
    }
    const snapshot=Object.prototype.hasOwnProperty.call(state,'phoneSurface')?clone(state.phoneSurface):undefined;
    const next={
      version:1,enabled:form.elements.namedItem('enabled').checked,
      userName:form.elements.namedItem('userName').value,
      contactName:form.elements.namedItem('contactName').value,
      twitterHandle:form.elements.namedItem('twitterHandle').value,data
    };
    if(!Core.write(state,next)){status.textContent='手機設定無效，未儲存。';return;}
    if(App.saveStory(false)===false){
      if(snapshot===undefined) delete state.phoneSurface;
      else state.phoneSurface=snapshot;
      status.textContent='故事儲存失敗，沒有變更手機設定。';
      return;
    }
    close();window.BAOPhoneUI?.refresh?.();
    window.BAOFeedback?.notify?.('已儲存到目前故事。');
  }
  const shell = function(next,...args){
    const result=next(...args);window.setTimeout(refresh,0);return result;
  };
  if(typeof App.wrapRenderChatShell==='function'){
    App.wrapRenderChatShell('phone-player:settings',shell);
  }
  if(typeof App.wrapShowView==='function'){
    App.wrapShowView('phone-player:settings',function(next,...args){
      const result=next(...args);if(args[0]!=='chat')close();window.setTimeout(refresh,0);return result;
    });
  }
  window.BAOPhonePlayerSettings=Object.freeze({open,close,refresh});
})();
