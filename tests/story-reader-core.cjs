const assert = require("assert");
const fs = require("fs");

const js = fs.readFileSync("js/story-reader.js", "utf8");
const css = fs.readFileSync("css/story-reader.css", "utf8");
const siteUI = fs.readFileSync("js/site-ui.js", "utf8");

assert(js.includes('linchenfeng: "https://i.meee.com.tw/UHKTM1O.jpg"'), "Lin Chenfeng image override is missing");
assert(js.includes("originalContent"), "message originalContent support is missing");
assert(js.includes("message.variants"), "message variant support is missing");
assert(js.includes("data-edit"), "manual assistant edit control is missing");
assert(js.includes("data-rewrite"), "AI rewrite control is missing");
assert(js.includes("data-regenerate"), "regenerate control is missing");
assert(js.includes("data-inspire"), "action inspiration control is missing");
assert(js.includes("input.value = text"), "action inspiration must fill the composer");
assert(js.includes("BAOChatMarkup.sanitize"), "rich HTML renderer integration is missing");
assert(js.includes("return (list || []).map(message => ({ role: message.role, content:"), "context should strip UI metadata before API calls");
assert(css.includes("#chat-view .message.assistant .bubble:not(.authored-rich-message)"), "plain text contrast rule is missing");
assert(css.includes("aside:not(.story-character-visual)"), "mobile artwork must remain visible behind the reader");
assert(css.includes("position:absolute"), "mobile background artwork layout is missing");
assert(siteUI.includes('loadBAOScript("js/story-reader.js")'), "story reader is not loaded by site-ui");

console.log("story-reader-core: ok");
