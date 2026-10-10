(() => {
  'use strict';
  if (window.BAOSameModelStateMerge || !window.App || !window.Chat || !window.API ||
      !window.WorldStateEngine || !window.GameState || !window.BAOHelperData) return;

  const OPEN = '<BAO_STATE>';
  const CLOSE = '</BAO_STATE>';
  // Retain all unprocessed turns in the local story; cap only what each request sends.
  const MAX_MERGED_BACKLOG = 4;
  const normalizeUrl = value => String(value || '').trim().replace(/\/+$/, '');
  const clip = (value, max = 6000) => {
    const text = String(value || '');
    return text.length > max ? `${text.slice(0, max)}…` : text;
  };
  const queueFor = owner => {
    if (!owner) return [];
    if (!Array.isArray(owner.pendingStateTurns)) owner.pendingStateTurns = [];
    return owner.pendingStateTurns;
  };
  const intervalFor = config => {
    if (typeof WorldStateEngine.interval === 'function') return Math.max(1, Number(WorldStateEngine.interval(config) || 1));
    const configured = Number(config?.cost?.stateInterval || 0);
    if (configured > 0) return Math.max(1, configured);
    return config?.narrativeMode === 'world' ? 2 : 3;
  };
  const explicitSeparateStateRoute = config => {
    if (String(config?.cost?.stateApiMode || '').trim() === 'same') return false;
    const route = config?.cost?.stateApi;
    return Boolean(route?.model && route?.baseUrl);
  };
  const eligible = config => {
    if (!config || !GameState.current || !WorldStateEngine.enabled?.(config)) return false;
    if (explicitSeparateStateRoute(config)) return false;
    // stateModel without an explicit stateApi is a legacy/stale field. "Same"
    // mode means the story model owns the state appendix regardless of that
    // leftover value; otherwise old saves can silently route status to a model
    // name that does not belong to the current provider endpoint.
    const mainModel = String(config?.api?.model || '').trim();
    return Boolean(mainModel);
  };
  const taskRequest = config => Boolean(config?.__connectionTest || config?.__memoryTask || config?.__stateTask ||
    config?.__storyTool || config?.__auxiliaryTask);
  const latestUserText = () => {
    for (let index = Chat.messages.length - 1; index >= 0; index -= 1) {
      if (Chat.messages[index]?.role === 'user') return String(Chat.messages[index].content || '');
    }
    return '';
  };
  const requestContainsLatestUser = messages => {
    const latest = latestUserText().trim();
    if (!latest || !Array.isArray(messages)) return false;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index]?.role !== 'user' || typeof messages[index].content !== 'string') continue;
      const sent = messages[index].content.trim();
      // Prompt orchestration may append a platform turn anchor after the raw
      // player text. Treat an exact player-text prefix followed by a newline as
      // the same turn, while keeping a boundary so "abc" never matches
      // unrelated "abcd..." content.
      return sent === latest ||
        sent.startsWith(`${latest}\n`) ||
        sent.endsWith(latest) ||
        sent.includes(`【玩家最新輸入】\n${latest}`);
    }
    return false;
  };
  const isMainStoryRequest = (config, messages) => {
    if (taskRequest(config) || !eligible(App.config) || !requestContainsLatestUser(messages)) return false;
    const main = App.config?.api || {};
    return String(config?.model || '') === String(main.model || '') &&
      normalizeUrl(config?.baseUrl) === normalizeUrl(main.baseUrl) &&
      String(config?.protocol || main.protocol || 'openai') === String(main.protocol || 'openai');
  };
  const dueNow = config => queueFor(GameState.current).length + 1 >= intervalFor(config);

  const selectedDefinitions = knownText => {
    const definitions = (GameState.current?.moduleDefinitions || []).filter(def => def?.tracking !== 'manual');
    const lastRelevant = new Set(GameState.current?.lastRelevantModules || []);
    const score = def => {
      let value = 0;
      if (def.tracking === 'high') value += 100;
      if (def.context === 'core') value += 80;
      if (lastRelevant.has(def.id)) value += 60;
      if (window.BAOWorldModules?.relevanceScore) value += Math.min(40, BAOWorldModules.relevanceScore(def, knownText) * 5);
      return value;
    };
    return definitions.map(def => ({ def, score: score(def) }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(item => item.def);
  };
  const statusSchema = () => {
    const fields = window.BAOCharacterStatus?.configFor?.(App.activeCharacter)?.fields || [];
    return fields.filter(field => field?.track).slice(0, 24).map(field => ({
      key: field.key,
      type: field.type,
      ...(Number.isFinite(field.min) ? { min: field.min } : {}),
      ...(Number.isFinite(field.max) ? { max: field.max } : {})
    }));
  };
  const buildContract = (config, userText) => {
    const owner = GameState.current;
    const pending = queueFor(owner);
    const priorTurns = pending.slice(0, MAX_MERGED_BACKLOG);
    const knownText = [userText, ...priorTurns.flatMap(turn => [turn.player, turn.assistant])].join('\n');
    const defs = selectedDefinitions(knownText);
    let snapshot = {};
    try { snapshot = WorldStateEngine.stateSnapshot?.(defs, knownText) || {}; } catch {}
    const prior = priorTurns.length ? priorTurns.map((turn, index) =>
      `舊待補第 ${index + 1} 輪\n玩家：${clip(turn.player)}\n故事：${clip(turn.assistant)}`).join('\n\n') : '無';
    const moduleSchema = window.BAOHelperData.moduleSchemas?.(defs) || {};
    const fields = statusSchema();
    const contract = [
      '【BAO_STATE_V1｜同模型合併狀態】',
      '你仍然首先是故事作者。請先完整輸出正常故事正文，不要縮短、改寫成報告，也不要在正文提到這段機器規則。',
      '只有在故事正文全部完成之後，才追加一個狀態 PATCH。狀態 PATCH 是為了避免再發第二次 API 請求。',
      `固定格式：\n${OPEN}\n{\"time\":\"\",\"location\":\"\",\"events\":[\"\"],\"npcs\":[{\"npc_id\":\"npc-1\",\"name\":\"\",\"aliases\":[\"\"],\"role\":\"\",\"appearance\":\"\",\"appearance_change\":false,\"outfit\":\"\",\"mood\":\"\",\"location\":\"\",\"relationship\":\"\",\"presence\":\"present\"}],\"modules\":{\"module_id\":{}},\"character_statuses\":{\"角色名\":{\"field_key\":\"value\"}},\"world_clock\":{\"advance_minutes\":0,\"schedule\":[{\"label\":\"\",\"in_minutes\":0}],\"resolve\":[\"wc-1\"],\"cancel\":[\"wc-2\"]}}\n${CLOSE}`,
      '這是 PATCH，不是完整資料庫。只寫本輪或下列待補輪次中有明確依據的變化；沒有變化輸出 {}。未知、推測、玩家心理、未發生的下一幕都不要寫。',
      'npcs 只更新有明確變化的人物；presence 只能是 present、away、unknown。不要因轉場自動認定人物仍在場。',
      '更新既有 NPC 時沿用目前狀態的 npc_id；新 NPC 不填 npc_id，由系統建立。新 NPC 可填 aliases、固定 appearance 與當前 outfit。既有 appearance 必須沿用；只有故事明確造成長期外貌變化時才同時回傳 appearance_change:true。只有明確換裝才更新 outfit。first_seen 由系統建立，不得輸出。別名對應到既有人物時使用正式姓名，不能重複建檔。',
      'modules 只使用允許的 module_id 與欄位；character_statuses 只使用允許的 field_key。無法確定的欄位直接省略。',
      'world_clock 是可選 PATCH：只有明確經過時間才寫 advance_minutes；只有明確日期、期限、約定、旅程耗時或倒數才 schedule。不得自行創造劇情。resolve/cancel 只能使用目前狀態已有的 wc-* ID。',
      '即使狀態附錄無法完成，也優先保留完整故事正文；不要因狀態附錄而拒絕或省略正文。',
      `【目前狀態】\n${clip(JSON.stringify(snapshot), 12000)}`,
      `【可更新世界模組】\n${clip(JSON.stringify(moduleSchema), 5000)}`,
      `【可更新人物狀態欄位】\n${clip(JSON.stringify(fields), 3500)}`,
      `【先前尚未成功整理的輪次】\n${prior}`,
      '本輪玩家最新輸入已在本次請求上方，不要重複敘述；你即將產生的本輪故事正文也屬於狀態判斷依據。'
    ].join('\n\n');
    return { contract, defs, priorCount: priorTurns.length, actionBaseline: window.BAOGameplayUICore?.captureActionVersions(owner) };
  };
  const appendContract = (messages, contract) => {
    const copy = (messages || []).map(message => ({ ...message }));
    for (let index = copy.length - 1; index >= 0; index -= 1) {
      if (copy[index]?.role !== 'user' || typeof copy[index].content !== 'string') continue;
      copy[index].content = `${copy[index].content}\n\n${contract}`;
      return copy;
    }
    return messages;
  };
  const visibleText = raw => {
    const text = String(raw || '');
    const upper = text.toUpperCase();
    const marker = OPEN.toUpperCase();
    const open = upper.lastIndexOf(marker);
    if (open >= 0) return text.slice(0, open).trimEnd();
    const max = Math.min(marker.length - 1, text.length);
    for (let length = max; length > 0; length -= 1) {
      if (upper.endsWith(marker.slice(0, length))) return text.slice(0, -length).trimEnd();
    }
    return text;
  };
  const splitFinal = raw => {
    const text = String(raw || '');
    const upper = text.toUpperCase();
    const open = upper.lastIndexOf(OPEN);
    if (open < 0) return { narration: text.trim(), stateText: '', hasState: false };
    const start = open + OPEN.length;
    const close = upper.indexOf(CLOSE, start);
    return {
      narration: text.slice(0, open).trim(),
      stateText: text.slice(start, close >= 0 ? close : text.length).trim(),
      hasState: true
    };
  };

  const mergedByStory = new WeakMap();
  const sameModelStateWrapper = async (next, config, messages, ...rest) => {
    if (!isMainStoryRequest(config, messages) || !dueNow(App.config)) return next(config, messages, ...rest);
    const owner = GameState.current;
    const userText = latestUserText();
    const { contract, defs, priorCount, actionBaseline } = buildContract(App.config, userText);
    const prepared = appendContract(messages, contract);
    const originalDelta = config?.onDelta;
    let previousVisible = '';
    const effective = { ...config, __sameModelStateMerged: true };
    if (typeof originalDelta === 'function') {
      effective.onDelta = (_delta, fullText) => {
        const nextVisible = visibleText(fullText);
        const safeDelta = nextVisible.startsWith(previousVisible) ? nextVisible.slice(previousVisible.length) : nextVisible;
        previousVisible = nextVisible;
        originalDelta(safeDelta, nextVisible);
      };
    }
    const result = await next(effective, prepared, ...rest);
    if (GameState.current !== owner) return result;
    const split = splitFinal(result?.text || '');
    if (split.hasState && !split.narration) throw new Error('模型只回傳狀態資料，沒有故事正文。');
    // An opening marker without its closing marker is a truncated appendix.
    // Never apply a partial PATCH or charge for a silent second request.
    const upper = String(result?.text || '').toUpperCase();
    const stateComplete = split.hasState && upper.lastIndexOf(CLOSE) > upper.lastIndexOf(OPEN);
    let parsed = null;
    if (stateComplete) {
      try { parsed = WorldStateEngine.parse?.(split.stateText) || null; } catch {}
    }
    const stateIssue = !split.hasState ? 'missing_appendix'
      : !stateComplete ? 'incomplete_appendix'
        : !parsed ? 'invalid_json' : '';
    mergedByStory.set(owner, { userText, narration: split.narration, hasState: split.hasState, parsed, defs, priorCount, stateIssue, actionBaseline });
    return { ...result, text: split.narration || String(result?.text || '') };
  };
  if (typeof API.wrapSend === 'function') {
    API.wrapSend('same-model-state-merge:main-story', sameModelStateWrapper);
  } else {
    // Compatibility fallback for a mixed-cache page where this module is newer than api.js.
    const rawSend = API.send.bind(API);
    API.send = (config, messages, ...rest) => sameModelStateWrapper(rawSend, config, messages, ...rest);
  }

  const originalUpdate = WorldStateEngine.update.bind(WorldStateEngine);
  const mark = (owner, phase, message, diagnostic = '') => {
    if (!owner || GameState.current !== owner) return;
    owner.stateTracker = {
      ...(owner.stateTracker || {}),
      phase,
      message,
      diagnostic,
      pending: queueFor(owner).length,
      checkedAt: new Date().toISOString(),
      ...(phase === 'updated' || phase === 'unchanged' ? { successAt: new Date().toISOString() } : {})
    };
    WorldStateEngine.markPersistenceHint?.();
  };
  const enqueue = (owner, playerText, assistantText) => {
    const pending = queueFor(owner);
    pending.push({ player: String(playerText || ''), assistant: String(assistantText || '') });
    WorldStateEngine.markPersistenceHint?.();
    return pending;
  };
  WorldStateEngine.update = async function(config, playerText, assistantText) {
    if (!eligible(config)) return originalUpdate(config, playerText, assistantText);
    const owner = GameState.current;
    if (!owner) return null;
    const scenePatch = this.syncExplicitScene?.(assistantText) || null;
    window.BAOStatusUsageIntegrity?.registerNamedNPCs?.(assistantText);
    const pending = queueFor(owner);
    const due = pending.length + 1 >= intervalFor(config);
    if (!due) {
      enqueue(owner, playerText, assistantText);
      mark(owner, 'waiting', `${scenePatch ? '已同步回覆明示的時間／地點；' : ''}同模型合併模式：累積 ${pending.length}／${intervalFor(config)} 輪，尚未要求狀態附錄。`);
      return scenePatch;
    }

    const merged = mergedByStory.get(owner);
    mergedByStory.delete(owner);
    const matchesTurn = merged && String(merged.userText || '') === String(playerText || '') &&
      String(merged.narration || '') === String(assistantText || '');
    if (!matchesTurn || !merged?.hasState || !merged?.parsed) {
      enqueue(owner, playerText, assistantText);
      const reason = !matchesTurn ? 'turn_mismatch' : (merged.stateIssue || 'invalid_json');
      const why = {
        turn_mismatch: '狀態附錄與本輪故事沒有對上',
        missing_appendix: '模型未附帶狀態資料',
        incomplete_appendix: '模型輸出的狀態資料不完整',
        invalid_json: '模型回傳的狀態格式無法解析'
      }[reason] || '狀態資料無法使用';
      mark(owner, 'failed', `${scenePatch ? '時間／地點已同步；' : ''}${why}，故事已保留；不會補發第二次 API，待下一次狀態批次再整理。`, reason);
      return scenePatch;
    }

    const clean = window.BAOHelperData.stateUpdate(merged.parsed, merged.defs || []);
    if (!clean) {
      enqueue(owner, playerText, assistantText);
      mark(owner, 'failed', `${scenePatch ? '時間／地點已同步；' : ''}本輪故事已保留，但狀態附錄格式無法套用；不會補發第二次 API，待下一次狀態批次再整理。`, 'invalid_patch');
      return scenePatch;
    }
    if (GameState.current !== owner) return null;
    GameState.applyUpdate(window.BAOGameplayUICore?.reconcileActionUpdate(owner, clean, merged.actionBaseline) || clean);
    pending.splice(0, Math.min(merged.priorCount || 0, pending.length));
    WorldStateEngine.markPersistenceHint?.();
    const changed = Object.keys(clean).some(key => key === 'character_statuses'
      ? Object.keys(clean[key] || {}).length
      : key === 'npcs' || key === 'events'
        ? (clean[key] || []).length
        : key === 'modules'
          ? Object.keys(clean[key] || {}).length
          : true);
    mark(owner, changed ? 'updated' : 'unchanged', changed
      ? '故事與狀態已由同一個模型、同一次 API 請求完成。'
      : '同一次故事請求已檢查狀態，本輪沒有可確認的變化。');
    return Object.keys(clean).length ? clean : (scenePatch || {});
  };

  window.BAOSameModelStateMerge = { eligible, dueNow, visibleText, splitFinal, intervalFor, isMainStoryRequest };
})();
