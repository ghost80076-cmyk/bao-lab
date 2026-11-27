/* Opt-in phone events from the existing main-story response; never a second model request. */
(() => {
  'use strict';
  const Core = window.BAOPhoneStoryCore;
  if (!Core || !window.BAOPhoneUICore || typeof App === 'undefined' || typeof Chat === 'undefined' || window.BAOPhoneStoryBridge) return;
  const activePhone = () => window.BAOPhonePlayerCore?.resolve(App.activeCharacter?.phone_ui,window.GameState?.current)
    || (!window.BAOPhonePlayerCore ? window.BAOPhoneUICore.normalize(App.activeCharacter?.phone_ui) : null);
  const enabled = () => !!window.GameState?.current && !!activePhone();
  const callPatch=(patch,user)=>{
    if(!Core.isCall(user))return patch;
    const state=GameState.current,display=Core.mergeDisplay(activePhone(),state?.phoneUI);
    const scope=Core.callScope(user,display,id=>{
      const access=window.BAOPhoneInteractionCore?.access(display,state?.phoneInteractions,{app:'kakao',id});
      return !access || (access.exists&&!access.locked&&!access.hidden);
    });
    return scope?Core.restrictVoiceReply(patch,scope):null;
  };
  const originalAdd = Chat.add.bind(Chat);
  // Called by App only AFTER its in-flight story / message-signature guard.
  // Invalid, empty or non-phone updates leave the original prose untouched.
  Chat.add = function(role, content) {
    if (role !== 'assistant' || !enabled() || !window.GameState?.current ||
        this.messages.at(-1)?.role !== 'user') return originalAdd(role, content);
    const parsed = Core.extract(content);
    const user=this.messages.at(-1);
    const source=Core.xPlayerIntent(user) ? Core.mergeDisplay(activePhone(),GameState.current.phoneUI) : null;
    const voiceScope=window.BAOStoryNativeTurn?.phoneReplyScope?.();
    const patch=Core.isCall(user) ? callPatch(parsed.patch,user) : voiceScope ? Core.restrictVoiceReply(parsed.patch,voiceScope) : source?.apps.includes('x') ? Core.withXPlayerPost(parsed.patch,user,source.tweets,id=>{
      const access=window.BAOPhoneInteractionCore?.access(source,GameState.current.phoneInteractions,{app:'x',id});
      return !access || (access.exists && !access.locked && !access.hidden);
    }) : parsed.patch;
    const message = originalAdd(role, parsed.text);
    if (patch) {
      message.phonePatch = patch;
      Core.apply(GameState.current, patch, message.id);
      window.BAOPhoneUI?.refreshFromState?.();
    }
    return message;
  };
  const oldRender = App.renderStoryMessage.bind(App);
  App.renderStoryMessage = function(content, role='assistant', greeting=false, ...rest) {
    const clean = enabled() && role === 'assistant' && !greeting
      ? Core.extract(content).text : content;
    return oldRender(clean, role, greeting, ...rest);
  };
  if (typeof App.wrapBuildSystemPrompt === 'function') {
    App.wrapBuildSystemPrompt('phone-ui:optional-event-contract', function(next,...args) {
      const text=next(...args);
      if (!enabled()) return text;
      const detail=window.BAOPhonePlayerCore?.ownerDescription(GameState.current,App.activeCharacter?.phone_ui,Core.mergeDisplay(activePhone(),GameState.current.phoneUI)) || '';
      // Phone contract is stable; the story owner's editable identity is a
      // dynamic prompt-cache partition rather than part of the stable prefix.
      return text + '\n\n' + Core.PROMPT +
        (detail ? '\n\n【本輪人物覆寫】\n'+detail : '');
    });
  }
  // Rebuild only from stored, selected reply evidence. The status model must
  // never invent messages, photos or calls to make a phone page look current.
  const rebuildFromHistory = (owner, messages) => {
    if (owner !== window.GameState?.current || !enabled()) return { applied: false, unconfirmed: false };
    const entries = (messages || []).filter(message => message?.role === 'assistant').flatMap(message => {
      const selected = Array.isArray(message.variants) && message.variants.length ? message.variants[message.activeVariant || 0] : null;
      const patch = Core.normalizePatch(selected ? selected.phonePatch : message.phonePatch);
      return patch ? [{ message, patch }] : [];
    });
    if (!entries.length) return { applied: false, unconfirmed: Boolean(owner.phoneUI) };
    const base = entries[0].message.revisionBase?.state;
    if (!base || base.phoneUI && base.phoneUI.version !== 1) return { applied: false, unconfirmed: true };
    const covered = new Set([...(base.phoneUI?.seenIds || []), ...entries.map(entry => entry.message.id)]);
    if ((owner.phoneUI?.seenIds || []).some(id => !covered.has(id))) return { applied: false, unconfirmed: true };
    const shadow = { phoneUI: base.phoneUI ? structuredClone(base.phoneUI) : Core.empty() };
    for (const { message, patch } of entries) Core.apply(shadow, patch, message.id);
    const read = new Map(Core.notifications(owner.phoneUI).map(item => [item.id, item.read]));
    for (const item of shadow.phoneUI.notifications || []) if (read.has(item.id)) item.read = read.get(item.id);
    owner.phoneUI = shadow.phoneUI;
    return { applied: true, unconfirmed: false };
  };
  window.BAOPhoneStoryBridge = Object.freeze({enabled, rebuildFromHistory, extractRevision: (content,user) => {if(!enabled())return {text:String(content||''),patch:null};const parsed=Core.extract(content);const preceding=user||Chat.messages.slice().reverse().find(m=>m.role==='user');return {...parsed,patch:callPatch(parsed.patch,preceding)};}});
})();
