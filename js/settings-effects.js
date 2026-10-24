/* Optional local-only settings inspector. No writes, prompt wrappers or model calls. */
(() => {
  'use strict';
  if (window.BAOSettingsEffects || !window.App || !window.BAOSettingsEffectsCore) return;
  const core = window.BAOSettingsEffectsCore;
  const esc = value => App.escapeHTML(String(value ?? ''));
  const list = value => Array.isArray(value) ? value : [];
  const labelMap = {
    density:{card:'依作品',concise:'精簡',standard:'標準',rich:'豐富'},
    paragraphs:{auto:'依場景','2-3':'2–3 段','3-5':'3–5 段','4-7':'4–7 段'},
    innerThoughts:{card:'依作品',none:'不揭露',restrained:'克制揭露',clear:'明確揭露'},
    intimacy:{card:'依作品',fade:'淡化',emotion:'重情感',continuous:'連續描寫'},
    matureDrama:{card:'依作品',mature:'成熟題材'},
    characterAgency:{card:'依作品',reserved:'慢熱回應',natural:'自然主動',active:'積極互動',autonomous:'高角色自主'},
    responseLength:{card:'依作品／回覆預設',short:'短篇幅',medium:'中篇幅',long:'長篇幅'},
    pacing:{card:'依作品',slow:'慢慢醞釀',balanced:'自然流動',brisk:'較快推進'},
    sceneFocus:{card:'依作品',protect:'保護場景投入'},
    dialogueBalance:{card:'依作品',dialogue:'對話較多',balanced:'平衡',description:'描寫較多'}
  };
  const fields = {stylePacks:'文風包',storyExtras:'故事插曲',density:'描寫密度',paragraphs:'每輪段落',
    innerThoughts:'NPC 內心揭露',physicalContinuity:'身體與空間連續性',intimacyDetailMod:'親密場景加強',
    intimacy:'親密處理方向',matureDrama:'成熟題材',characterAgency:'角色主動程度',responseLength:'每輪篇幅',
    pacing:'故事節奏',sceneFocus:'場景投入保護',storyExpectation:'場外劇情期待',dialogueBalance:'對話比例'};
  const empty = {stylePacks:[],storyExtras:[],density:'card',paragraphs:'auto',innerThoughts:'card',physicalContinuity:false,
    intimacyDetailMod:false,intimacy:'card',matureDrama:'card',characterAgency:'card',responseLength:'card',pacing:'card',
    sceneFocus:'card',storyExpectation:'',dialogueBalance:'card'};
  const styleLabels = {female_kfilm:'女性向 · 韓式電影感',male_visual:'男性向 · 視覺凝視',male_blunt:'男性向 · 直白粗獷',
    cinematic:'電影鏡頭',action_realism:'動作寫實',natural:'自然口語',tender:'細膩情感',suspense:'懸疑氛圍',literary:'文學留白',realist_subtext:'寫實留白'};
  const extraLabels = {daily:'配角日常',surroundings:'環境插曲',tension:'關係暗流',threads:'伏筆回聲'};
  // Difference against the production preference builder avoids duplicating its
  // rules here; evidence is matched only in system messages, never old dialogue.
  function contribution(prefs, key) {
    const build = window.BAONarrativeSettings?.buildPrompt;
    if (!build) return [];
    const before = new Set(build({...prefs,[key]:empty[key]}).split('\n'));
    return build(prefs).split('\n').filter(line => line && !line.startsWith('【玩家敘事偏好】') && !before.has(line));
  }
  const rows = () => {
    const config = window.App?.config || {}, state = window.GameState?.current || {};
    const character = window.App?.activeCharacter || {};
    const result = [];
    const add = (id, group, label, value, scope, source, status, detail='', expected=[], target='system') =>
      result.push({id,group,label,value,scope,source,state:status,detail,expected,target});
    const info = window.BAONarrativeSettings?.inspect?.(config);
    const prefs = info?.prefs || {};
    const narrativeScope = info?.source === 'story' ? '本故事' : '未另存偏好的故事';
    const narrativeSource = info?.source === 'story' ? '本故事已保存的偏好' : '此瀏覽器起始偏好（舊故事沿用）';
    if (info) {
      const mode = window.BAONarrativeSettings.playerPortrayal(config);
      add('playerPortrayal','敘事與指令','玩家角色演繹',({strict:'玩家主控',natural:'敘事補述',coauthor:'小說共創'})[mode],
        '本故事',info.source === 'story' && ['strict','natural','coauthor'].includes(config.narrative?.playerPortrayal) ? narrativeSource : '平台預設（未另行授權）','ready',
        '重要決策仍由玩家決定。', [window.BAONarrativeSettings.playerPortrayalRule(config)]);
      const observe = window.BAONarrativeSettings.observationAllowed(config);
      add('observationMode','敘事與指令','單輪觀賞',observe?'已開放':'關閉','本故事',info.source==='story' && Object.hasOwn(config.narrative,'observationMode')?narrativeSource:'平台預設',
        observe?'conditional':'off','開啟後仍需獨立輸入「繼續」「然後呢」或「【觀賞一輪】」；只授權該輪。',
        observe?['【本輪觀賞授權】']:[],'latest');
      for (const [key,label] of Object.entries(fields)) {
        const value = prefs[key];
        const expected = contribution(prefs,key);
        let selected = Array.isArray(value) ? value.length > 0 : value !== empty[key];
        let display = labelMap[key]?.[value] || (Array.isArray(value) ? value.map(x => (key==='stylePacks'?styleLabels:extraLabels)[x] || x).join('、') || '依作品' : typeof value==='boolean' ? (value?'開啟':'關閉') : value || '未設定');
        let status = selected?'ready':'inherited', detail = selected?'作為之後故事回覆的偏好；不重寫已存在的訊息。':'不額外加入這項要求，保留作品安排。';
        if (key==='intimacy' && prefs.intimacyDetailMod) { status='replaced'; detail='親密場景加強已開啟，使用加強規則；關閉加強後恢復這個選擇。'; }
        const source = info.source==='story' && !Object.hasOwn(config.narrative,key) ? '作品／平台預設（此項未另設）' : narrativeSource;
        add(key,'敘事與指令',label,display,narrativeScope,source,status,detail,expected);
      }
      const remaining = [...window.BAONarrativeSettings.effectiveCustomInstructions(prefs)];
      list(prefs.customInstructions).forEach((instruction,index) => {
        const classification = window.BAONarrativeSettings.classifyInstruction(instruction.text,prefs);
        const at = remaining.indexOf(instruction.text);
        const selected = instruction.enabled && at>=0 && !['conflict','redundant'].includes(classification.kind);
        if (selected) remaining.splice(at,1);
        const status = !instruction.enabled?'off':selected?'ready':'excluded';
        const detail = !instruction.enabled?'已保存，但未啟用。':selected?'會隨故事偏好加入請求。':
          ['conflict','redundant'].includes(classification.kind)?classification.message:'與其他已選指令重複，省略重複內容。';
        add('custom-'+index,'自訂長期指令','指令 '+(index+1),instruction.text,narrativeScope,narrativeSource,status,detail,selected?[instruction.text]:[]);
      });
    } else add('narrative-unavailable','敘事與指令','敘事偏好','尚未載入','本故事','設定模組','unavailable');

    const player = window.BAOPlayerSettings?.inspectPrompt?.(config);
    if (player) {
      for (const [key,label,choices] of [
        ['replyLength','預設回覆長度',{short:'短',long:'長',auto:'自動'}],
        ['pov','敘事人稱',{card:'依角色卡',first:'角色第一人稱',second:'玩家第二人稱',third:'第三人稱'}],
        ['dialogueFormat','台詞格式',{card:'依角色卡',named:'名稱標示'}],
        ['language','AI 回覆語言',{'zh-Hant':'繁體中文','zh-Hans':'簡體中文',en:'English'}]
      ]) {
        const overridden = key==='replyLength' && player.lengthOverridden;
        add(key,'瀏覽器回覆偏好',label,choices[player[key]] || String(player[key]),'此瀏覽器','回覆設定',overridden?'replaced':'ready',
        overridden?'「今晚的故事」已指定篇幅，本頁長度暫不採用。':'適用於此瀏覽器開啟的故事；讀取故事保留目前偏好，新裝置沒有偏好時由備份補入。從下次回覆使用。',overridden?[]:[player.instructions[key]]);
      }
    }
    const actor = window.BAOActorModeCore?.normalizeState?.(state.actorMode || {},character.actor_mode || {});
    const actorPrompt = actor && window.BAOActorModeCore.buildPrompt({state:actor,defaults:character.actor_mode || {},actorName:character.name || ''});
    add('actor','世界與角色','角色身份',actor?.role?.label || '未設定','本故事',state.actorMode?'本故事身份設定':'作品預設',actorPrompt?'ready':'off',
      actorPrompt?'保留角色本體，加入目前身份規則。':'需啟用、有身份內容且目前使用此身份。',actorPrompt?[actorPrompt]:[]);
    const phone = window.BAOPhonePlayerCore?.resolve?.(character.phone_ui,state);
    add('phone','世界與角色','手機介面',phone?'開啟':'關閉','本故事',state.phoneSurface?'玩家故事設定':'作品預設',phone?'ready':'off',
      phone?'介面開啟；只有實際產生可見手機事件時才更新，不增加一個模型請求。':'未加入手機事件輸出規則。',phone?[window.BAOPhoneStoryCore?.PROMPT]:[]);
    if (phone) {
      const owner = window.BAOPhonePlayerCore.ownerDescription(state,character.phone_ui);
      add('phone-owner','世界與角色','手機主人與聯絡人',`${phone.userName || '未指定主人'} · ${phone.contactName || '未指定聯絡人'}`,
        '本故事',state.phoneSurface?'玩家故事設定':'作品預設','ready','主人說明放在本輪動態資料，不改動固定手機契約。',[owner],'latest');
    }
    const wb = state.worldbookLibrary || {}, enabled = list(wb.enabled);
    add('worldbook','世界與角色','共享世界書',enabled.length?`${enabled.length} 本 · ${wb.recallMode==='off'?'動態檢索關閉':wb.recallMode==='scene'?'場景檢索':'自動檢索'}`:'未啟用','本故事','世界書選擇',enabled.length?'conditional':'off',
      enabled.length?'已啟用不代表每輪命中。關鍵詞、知情、條件與預算會影響加入；關閉動態檢索仍可保留固定條目。':'尚未選用共享世界書。');
    result.at(-1).selection = [enabled,wb.recallMode || 'auto'];
    result.at(-1).target = 'current';
    result.at(-1).anyExpected = enabled.length ? ['【已啟用的世界書固定規則與文風】','【世界書按需提供的背景資料｜'] : [];
    const modules = window.BAOWorldModules?.definitions?.(character) || [];
    add('world-modules','世界與角色','世界模組',modules.length?`${modules.length} 個模組`:'未啟用','本故事','作品與玩家模組選擇',
      modules.length?'configured':'off','各模組的核心／相關／僅顯示範圍由模組設定決定；啟用不代表每項資料都送入。');
    result.at(-1).selection = modules.map(m=>[m.id,m.context,m.tracking]);
    const contexts = {core:'每輪核心',relevant:'相關時加入',ui_only:'不加入主故事'};
    const trackingLabels = {high:'高頻追蹤',medium:'中頻追蹤',low:'低頻追蹤',manual:'手動維護'};
    for (const mod of modules) {
      add(`world-module-${mod.id}`,'世界模組範圍',mod.label || mod.id,`${contexts[mod.context] || mod.context} · ${trackingLabels[mod.tracking] || mod.tracking}`,
        '本故事','目前世界模組設定','configured','主故事加入範圍與狀態整理頻率分開；相關判定、模組數量及字數預算仍可能排除。');
      result.at(-1).selection = [mod.id,mod.context,mod.tracking,mod.triggers,mod.fields];
    }
    const trackedFields = window.BAOCharacterStatus?.configFor?.(character)?.fields || [];
    const tracking = config.narrativeMode==='world' || (typeof config.stateTracking==='boolean'?config.stateTracking:config.displayMode==='ui') || trackedFields.some(f=>f.track);
    add('state-tracking','記憶與輔助','人物／世界狀態整理',tracking?'追蹤開啟':'未啟用','本故事','敘事模式與狀態設定',tracking?'configured':'off',
      tracking?'同模型附錄或獨立整理依連線與觸發條件執行；可能另用模型額度，與狀態欄是否顯示分開。':'隱藏面板與停止追蹤是不同設定。');
    result.at(-1).selection = [tracking,config.cost?.stateInterval,config.cost?.stateApiMode,trackedFields.map(f=>[f.key,f.track,f.context])];
    for (const field of trackedFields) {
      add(`status-field-${field.key}`,'人物狀態欄位',field.label || field.key,`${contexts[field.context] || field.context} · ${field.track?'自動追蹤':'手動維護'}`,
        '本故事',field.origin==='player'?'玩家自訂欄位':'作品欄位',field.context==='ui_only' && !field.track?'display':'configured',
        '「不加入主故事」與「不追蹤」是兩件事；自動追蹤的欄位仍交給狀態整理流程。隱藏顯示不會自動停止追蹤。');
      result.at(-1).selection = [field.key,field.context,field.track,field.type,field.min,field.max];
    }
    const recallOn = config.memory?.mode!=='full' && config.memory?.episodicRecall!==false;
    add('recall','記憶與輔助','事件回憶',recallOn?'按需檢索':'不另行檢索','本故事','記憶設定',recallOn?'conditional':'off',
      config.memory?.mode==='full'?'完整原文模式不再另加事件回憶。':'只檢索有來源且符合知情邊界的相關事件，不額外呼叫模型。',recallOn?['【本輪事件回憶｜有來源的檢索資料】']:[],'latest');
    add('memory','記憶與輔助','對話記憶',({full:'完整原文',smart:'智慧整理',rounds:'固定輪數'})[config.memory?.mode] || '依故事設定',
      '本故事','記憶設定','configured',config.memory?.mode==='smart'?'達到整理條件時，可能另外呼叫記憶模型。':'控制送入的歷史範圍；不因查看這份摘要而發出請求。');
    result.at(-1).selection = [config.memory?.mode,config.memory?.maxRounds,config.memory?.maxContext,config.memory?.summaryInterval,config.memory?.summaryApiMode];
    const im = window.BAOInterpretationModsCore?.activeMods?.(state.interpretationMods || {},window.BAOInterpretationMods?.catalog?.() || []) || [];
    add('interpretation','記憶與輔助','雙向解讀',im.length?im.map(m=>m.label).join('、'):'未啟用','本故事','雙向解讀 MOD',im.length?'configured':'off',
      im.length?'一般送出依前置／後置階段最多額外 2 次請求；隱藏顧問摘要仍會生成與計費。重新生成、AI 改寫不自動執行這兩階段；本機預覽不呼叫。':'不新增解讀請求。');
    result.at(-1).selection = [im.map(m=>m.id),state.interpretationMods?.detailMode,state.interpretationMods?.monitorTone];
    const commentary = window.BAOCommentaryModsCore?.activeMods?.(state.commentaryMods || {},window.BAOCommentaryMods?.catalog?.() || [],
      {adultEnabled:Boolean(window.BAOContentPreferences?.isAdultContentEnabled?.())}) || [];
    add('commentary','記憶與輔助','場外人格 MOD',commentary.length?commentary.map(m=>m.label).join('、'):'未啟用',
      '本故事','場外人格選擇',commentary.length?'configured':'off',commentary.length?'一般故事完成後，所有啟用人格共用 1 次額外請求；重新生成、AI 改寫不自動評論，本機預覽不呼叫。':'不新增評論請求。');
    result.at(-1).selection = commentary.map(m=>m.id);
    const scene = window.BAOSceneHTML?.prefs;
    if (scene) {
      add('scene','畫面與閱讀','故事排版',({native:'原生閱讀',efficient:'節省 Token 的場景排版',free:'自由安全 HTML'})[scene.mode] || '依設定',
        '此瀏覽器','閱讀模式','configured','除了畫面呈現，也會加入輸出格式要求；與字體、配色不同。');
      add('status-display','畫面與閱讀','狀態欄顯示',({native:'夜灣原生面板',author:'作者狀態欄',hidden:'隱藏'})[scene.status] || '依設定',
        '此瀏覽器','閱讀模式','display','只選擇狀態欄如何顯示；隱藏不等於關閉狀態追蹤。');
    }
    const replacement = state.playerTextReplaceMod;
    const replaceCount = list(replacement?.rules).filter(r=>r.enabled!==false && String(r.find || '').length).length;
    add('text-replace','畫面與閱讀','顯示文字替換',replacement?.active && replaceCount?`${replaceCount} 條啟用`:'未啟用','本故事','文字替換 MOD',
      replacement?.active && replaceCount?'display':'off','只替換畫面文字，不改聊天原文、儲存內容或送給模型的劇情。');
    // Rendering-only controls are not evidence of a prompt rule being sent.
    add('site-language','畫面與閱讀','網站介面語言',({'zh-Hant':'繁體中文','zh-Hans':'简体中文',en:'English'})[window.BAOSiteI18n?.getLocale?.()] || '依網站設定',
      '此瀏覽器','網站介面設定','display','只更換選單與按鈕文字，不控制 AI 回覆語言。');
    add('appearance','畫面與閱讀','字體與閱讀外觀','使用目前閱讀設定','此瀏覽器','閱讀外觀','display','字級、配色與對話框外觀不作為故事指令送給模型。');
    let authorUI = null;
    try { authorUI = JSON.parse(localStorage.getItem('bao-lab:author-regex:v1:'+encodeURIComponent(String(character.id || '').slice(0,80))) || 'null'); } catch (_) {}
    if (authorUI && Array.isArray(authorUI.rules)) {
      add('author-regex','作者介面權限','作者正則介面',authorUI.enabled===true?'已啟用':'關閉','此瀏覽器／此作品','作者介面設定',authorUI.enabled===true?'display':'off',
        '作者正則處理顯示內容，權限本身不新增主故事規則或模型請求。');
      for (const [key,label] of Object.entries({allowScripts:'允許介面腳本',allowExternalAssets:'允許外部素材',allowStateSharing:'允許讀取故事狀態',allowUiPersistence:'允許保存介面資料'})) {
        add(`author-${key}`,'作者介面權限',label,authorUI[key]===true?'允許':'未允許','此瀏覽器／此作品','作者介面獨立權限',authorUI.enabled===true && authorUI[key]===true?'display':'off',
          authorUI.enabled===true?'只控制作者介面的這項能力；不代表其他權限一併開啟。':'目前作者介面未啟用，保留的權限選擇不生效。');
      }
    }
    return result;
  };
  const capture = (messages, {kind}={}) => {
    // Rewrite's final user message is the editing task and quoted rejected
    // reply. Dynamic evidence belongs to the preceding assembled player turn.
    const task = kind === 'rewrite' ? messages.findLastIndex(m=>m?.role==='user') : -1;
    return core.capture(rows(),task < 0 ? messages : messages.filter((_,index)=>index!==task));
  };
  const snapshot = () => {
    const prior = window.BAOContextInspector?.snapshot?.();
    return { rows:core.compare(rows(),prior?.settingsEffects),at:prior?.at || '',requestStatus:prior?.status || '',kind:prior?.kind || '',
      legacy:!App.config?.narrative };
  };
  const ensureStyles = () => {
    if (document.querySelector('link[href^="css/settings-effects.css"]')) return;
    const link=document.createElement('link');link.rel='stylesheet';link.href='css/settings-effects.css?v=1';document.head.appendChild(link);
  };
  const render = (data=snapshot(), captured=false) => {
    ensureStyles();
    const groups = new Map();
    for (const row of data.rows || []) { if(!groups.has(row.group))groups.set(row.group,[]);groups.get(row.group).push(row); }
    const request = ({pending:'請求處理中',success:'請求完成',failed:'請求失敗'})[data.requestStatus] || '尚無送出紀錄';
    const kind = ({story:'一般故事回覆',regenerate:'重新生成',rewrite:'AI 改寫'})[data.kind] || '';
    return `<details class="settings-effects" data-settings-effects><summary>${captured?'這次請求的設定核對':'設定範圍與生效狀態'}</summary>
      <div class="settings-effects-body"><p class="settings-effects-intro">${captured?'以下保留送出當時的選擇與規則核對。':'核對一般故事回覆、重新生成與 AI 改寫的最近一次請求；不含行動靈感或其他輔助任務。變更設定後，需再次送出才能核對。'}請求含此規則，不代表模型一定遵循。</p>
      <p class="settings-effects-request">${esc(data.at?`最近請求：${kind ? kind+' · ' : ''}${data.at} · ${request}`:request)}</p>
      ${!captured && data.legacy?'<p class="settings-effects-note">這份故事尚未另存敘事偏好，正沿用此瀏覽器的起始偏好；玩家演繹仍依本故事明示授權。</p>':''}
      ${[...groups].map(([group,items])=>`<details class="settings-effects-group"><summary>${esc(group)} <span>${items.length} 項</span></summary><dl>${items.map(row=>`<div class="settings-effects-row" data-setting-effect="${esc(row.id)}"><dt>${esc(row.label)}</dt><dd><strong>${esc(row.value)}</strong><div class="settings-effects-meta"><span>${esc(row.scope)}</span><span>來源：${esc(row.source)}</span></div><div class="settings-effects-badges"><span data-effect-state="${esc(row.state)}">${esc(row.stateLabel)}</span>${row.evidenceLabel!==row.stateLabel?`<span data-effect-evidence="${esc(row.evidence)}">${esc(row.evidenceLabel)}</span>`:''}</div>${row.detail?`<p>${esc(row.detail)}</p>`:''}</dd></div>`).join('')}</dl></details>`).join('')}
      ${!captured?'<button type="button" class="secondary" data-story-control-action="inspector">核對最近送出內容</button>':''}
      </div></details>`;
  };
  const renderCaptured = (captured,status,at,kind) => Array.isArray(captured)?render({rows:captured,requestStatus:status,at,kind},true):'';
  window.BAOSettingsEffects = Object.freeze({snapshot,capture,render,renderCaptured});
})();
