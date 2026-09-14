const assert = require("assert");
const fs = require("fs");
const css = fs.readFileSync("css/responsive-polish.css", "utf8");
const html = fs.readFileSync("index.html", "utf8");
assert(css.includes("overflow-x:hidden"));
assert(css.includes("white-space:nowrap"));
assert(css.includes("overflow-x:auto"));
assert(html.includes('href="css/responsive-polish.css"'));
console.log("responsive-polish-core: ok");
