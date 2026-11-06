/* Single catalog for player story presets and author card presets. Field semantics are shared; ownership is separate. */
(function(root, factory) {
  const api = Object.freeze(factory());
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BAOCharacterStatusTemplates = api;
})(typeof window !== 'undefined' ? window : null, function() {
  'use strict';
  const TEMPLATES = {
    general: { label: "一般狀態", fields: [
      { key: "condition", label: "身體狀態", type: "text", context: "core", default: "正常", description: "傷勢、疲勞與會影響後續行動的明確狀態。" },
      { key: "energy", label: "精力", type: "meter", context: "core", default: 100, min: 0, max: 100, description: "依故事中明確的消耗與恢復調整。" },
      { key: "mood", label: "當前情緒", type: "text", context: "relevant", default: "平穩", description: "只根據已表現出的言行更新，不推斷隱藏心理。" }
    ] },
    relationship: { label: "關係互動", fields: [
      { key: "affinity", label: "好感", type: "meter", context: "relevant", default: 0, min: -100, max: 100, description: "只依已發生的關係互動小幅調整。" },
      { key: "trust", label: "信任", type: "meter", context: "relevant", default: 0, min: -100, max: 100, description: "記錄有明確依據的信任或戒備變化。" },
      { key: "relationship_state", label: "關係狀態", type: "tags", context: "core", default: ["未定義"], description: "已成立的關係、承諾、衝突或界線。" }
    ] },
    fantasy: { label: "奇幻", fields: [
      { key: "mana", label: "魔力", type: "meter", context: "core", default: 100, min: 0, max: 100, description: "追蹤明確發生的施法消耗與恢復。" },
      { key: "magic_state", label: "魔法狀態", type: "text", context: "relevant", default: "穩定", description: "法術、詛咒、祝福與魔法反應。" },
      { key: "fantasy_traits", label: "種族／魔法特徵", type: "tags", context: "relevant", default: [], description: "已揭露的種族特徵、契約或印記。" }
    ] },
    vampire: { label: "吸血鬼", fields: [
      { key: "hunger", label: "飢渴", type: "meter", context: "core", default: 20, min: 0, max: 100, description: "依故事中明確的飢渴、進食與克制變化調整。" },
      { key: "fangs", label: "獠牙顯露", type: "boolean", context: "relevant", default: false, description: "只有明確顯露或收起時才更新。" },
      { key: "blood_state", label: "血液狀態", type: "text", context: "relevant", default: "穩定", description: "血液需求、血脈反應或已成立的血契。" }
    ] },
    cultivation: { label: "修仙", fields: [
      { key: "realm", label: "境界", type: "text", context: "core", default: "未設定", description: "只記錄已明確成立的修為境界與突破。" },
      { key: "spiritual_power", label: "靈力", type: "meter", context: "core", default: 100, min: 0, max: 100, description: "依功法、戰鬥與恢復明確調整。" },
      { key: "cultivation_state", label: "修煉狀態", type: "tags", context: "relevant", default: [], description: "內傷、心魔、瓶頸、頓悟或特殊加持。" }
    ] },
    three_realms: { label: "三界人物狀態", fields: [
      { key: "body_condition", label: "身體狀態", type: "text", context: "relevant", default: "未確認", description: "只記錄正文已確認的健康、疲勞、傷勢等狀態；未知維持未確認，不替玩家補感受。" },
      { key: "mental_condition", label: "精神狀態", type: "text", context: "relevant", default: "未確認", description: "只記錄已表達的精神狀態與可觀察反應；不推斷未揭露的隱藏心理。" },
      { key: "relationship_stage", label: "關係階段", type: "text", context: "relevant", default: "未確認", description: "依已確認互動記錄陌生、熟悉、曖昧、戀人、親密或作品既有關係；不能自動跳階，好感不代表同意。" },
      { key: "affinity_description", label: "好感描述", type: "text", context: "relevant", default: "未確認", description: "有明確關係互動依據時使用低、中、高、極高等描述；無依據維持未確認。不從既有數字猜測閾值，不把好感視為同意。" },
      { key: "current_activity", label: "目前行動", type: "text", context: "relevant", default: "未確認", description: "只記錄當前正文已成立的具體行動；離場角色的預計活動不能當成已發生。" },
      { key: "key_turns", label: "關鍵轉折", type: "text", context: "relevant", default: "未確認", description: "以一至兩條簡短文字記錄已發生、影響角色或關係的重要事件；不補造過往或未來結果。" }
    ] },
    combat: { label: "戰鬥", fields: [
      { key: "hp", label: "生命", type: "meter", context: "core", default: 100, min: 0, max: 100, description: "只依明確受到的傷害、治療與恢復更新。" },
      { key: "stamina", label: "體力", type: "meter", context: "core", default: 100, min: 0, max: 100, description: "依明確的施力、消耗與休息更新。" },
      { key: "injuries", label: "傷勢", type: "tags", context: "core", default: [], description: "記錄具體成立的受傷部位與異常狀態。" },
      { key: "guarding", label: "防禦中", type: "boolean", context: "relevant", default: false, description: "角色明確進入或解除防禦架勢時更新。" }
    ] }
  };
  // Do not permit an editor to silently rewrite another editor's template semantics.
  const frozen = Object.fromEntries(Object.entries(TEMPLATES).map(([id, template]) => [
    id, Object.freeze({ label: template.label, fields: Object.freeze(template.fields.map(field => Object.freeze({...field}))) })
  ]));
  return {TEMPLATES:Object.freeze(frozen)};
});
