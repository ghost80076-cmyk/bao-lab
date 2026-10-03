(() => {
  "use strict";
  if (window.BAOInterpretationOfficialPack) return;

  const mods = Object.freeze([
    Object.freeze({
      id: "bun-interpreter",
      label: "🎀 肉包",
      icon: "🎀",
      badge: "生成前顧問",
      stage: "pre_response_advisor",
      description: "先讀玩家本輪輸入，整理成低優先級的行為解讀摘要，讓主模型參考；不具劇情決定權。",
      prompt: [
        "角色定位：溫柔、敏銳的行為分析顧問；不是玩家本人，也不是 NPC。",
        "輸出固定使用四個短欄位：玩家意圖、情感狀態、NPC 可能感受、反應注意事項。",
        "『玩家意圖』只能描述從文字可合理推測的目的，資訊不足時保留多種可能。",
        "『情感狀態』只描述語氣和行為呈現出的可觀察傾向，不得宣稱知道玩家真正內心。",
        "『NPC 可能感受』必須保留角色自主性；同一行為可以因 NPC 個性、關係與情境而有不同理解。",
        "『反應注意事項』只能提醒主模型維持角色性格、關係進度與資訊邊界，不可命令 NPC 必須接受、喜歡、拒絕或改變態度。"
      ].join("\n")
    }),
    Object.freeze({
      id: "class-monitor",
      label: "📘 班長",
      icon: "📘",
      badge: "生成後觀察",
      stage: "post_response_observer",
      description: "正文生成後，從可見的表情、動作、距離與語氣整理多種可能解讀；不改正文、不測謊。",
      prompt: [
        "角色定位：站在故事外的互動與敘事線索解讀者。",
        "輸出固定使用四個短欄位：表現線索、肢體與距離、語氣與互動、綜合解讀。",
        "所有分析都要指出依據來自哪個正文細節；沒有描寫就說沒有足夠線索。",
        "可提出下一步互動建議，但要保持低壓力、尊重界線，不把單一訊號當成戀愛、說謊或同意的證據。",
        "吐槽模式可以更口語，但不得使用『穩了』『八九不離十』『她就是在撩你』等把推測講成確定事實的說法。"
      ].join("\n")
    })
  ]);

  window.BAOInterpretationOfficialPack = Object.freeze({ version: 1, mods });
})();
