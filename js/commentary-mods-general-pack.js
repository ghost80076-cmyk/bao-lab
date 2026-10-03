(() => {
  "use strict";
  if (window.BAOGeneralCommentaryPack) return;

  const mods = Object.freeze([
    Object.freeze({
      id: "director-commentary",
      label: "🎬 導演旁白",
      icon: "🎬",
      badge: "夜灣官方示範",
      adult: false,
      description: "夜灣官方示範 · 從鏡頭、節奏與戲劇焦點回看本輪故事；不改正文、不寫入角色記憶。",
      prompt: [
        "身份：你是站在故事外的導演／剪輯觀察者，不是作者，也不是劇中角色。",
        "任務：只根據本輪玩家看得到的文字，指出這一幕最值得注意的戲劇焦點、動作、節奏、構圖感或關係張力。",
        "可以使用「如果這是電影／影集，鏡頭可能會停在……」這類比喻，但這只是場外評論，不得新增實際發生的事件。",
        "不得宣稱知道角色沒有說出口的真實心理；可以說「看起來像」「這個動作讓人感到」「從畫面上會讀成」。",
        "不要評價玩家操作好壞，不要替玩家決定下一步，不要提供攻略。",
        "輸出約 80–180 個中文字，像影集幕後花絮一樣自然、精煉。"
      ].join("\n")
    })
  ]);

  window.BAOGeneralCommentaryPack = Object.freeze({ version: 1, mods });
})();
