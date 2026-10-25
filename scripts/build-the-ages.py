"""Rebuild the technical adapter while preserving the author's original rules and data."""
import json, re
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
def load(p): return json.loads((ROOT / p).read_text())
def write(p, value): (ROOT / p).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
source = load('docs/sources/the-ages/authorAsset.original.json')
engine = ''.join(re.search(r'<script type="text/plain" id="tg-src\d">([\s\S]*?)</script>', rule['replace']).group(1) for rule in source['rules'])
# All changes are host I/O, lifecycle and iframe layout. Game tables and calculations are intact.
engine = engine.replace('localStorage.', 'TGStorage.').replace('[data-lt="send"]', '[data-tg-unused-send]')
engine = re.sub(r'function ta\(\)\{[^\n]*', 'function ta(){return null}', engine)
engine = re.sub(r'function sendBtn\(\)\{[^\n]*', 'function sendBtn(){return null}', engine)
engine = re.sub(r'function inject\(txt\)\{[^\n]*', "function inject(txt){window.BAOTheAges.draft(txt);U.ring=1;toast('指令已填入夜灣輸入框，請按送出。')}", engine)
engine = re.sub(r'function pageText\(\)\{[^\n]*', "function pageText(){var feed=window.BAOTheAges.getState();return feed?feed.protocol.text:''}", engine)
engine = engine.replace("pageText().indexOf('[[TGQ:')<0", "!window.BAOTheAges.getState().protocol.hasGameCommands")
# The platform always requires manual submission; hide the obsolete Luna auto-send toggle.
engine=engine.replace("B('opt','fill',(o.opt.fill?'☑':'☐')+' 只填入不送出（按了之後自己按送出）',{free:1})", "'<span class=\"tg-note\">夜灣：需要 AI 演出的動作只填入指令，請自行按送出。</span>'")
# The iframe cannot observe the parent's manual-send event. Pass only a turn count.
engine = engine.replace('if(document.body)boot();else document.addEventListener("DOMContentLoaded",boot);', '''var started=false,lastManual=0;
function bridgeUpdate(){var feed=window.BAOTheAges.getState();if(!feed)return;
if(!started){started=true;TGData=feed.storage||{};lastManual=feed.protocol.manualTurns;boot()}
if(s&&s.tut===4&&feed.protocol.manualTurns>lastManual){s.tut=5;sv();render()}
lastManual=feed.protocol.manualTurns;scan();
var note=document.getElementById('tg-bridge-note');if(note)note.textContent=(!feed.receipts?'請在自訂介面進階設定開啟「允許讀取遊戲回執」，面板才能確認結算。 ':'')+(!feed.persistent?'尚未開啟「保存冒險進度」；離開前請先在系統頁匯出存檔。':'冒險進度會跟隨本故事保存。')}
window.addEventListener('bao:the-ages-state',bridgeUpdate);bridgeUpdate();''')
# No localStorage/eval or parent-DOM access inside the opaque frame.
preamble = '''<section id="tg-bridge-note" role="status">請啟用互動腳本與保留互動介面。</section><script>
var TGData={};var TGStorage={getItem:function(k){return TGData[k]||null},setItem:function(k,v){TGData[k]=String(v);window.BAOTheAges.save(TGData)},removeItem:function(k){delete TGData[k];window.BAOTheAges.save(TGData)}};
'''
css = '''<style>html,body{background:#17130d;color:#e9dfc8}#tg-bridge-note{padding:10px;font:13px/1.6 sans-serif;color:#ead29b}#tg-root{position:relative!important;top:auto!important;right:auto!important;left:auto!important;bottom:auto!important;width:100%!important;max-height:none!important;border:0!important}#tg-root .tg-body{max-height:none!important}#tg-root.tg-min{position:relative!important;width:100%!important}#tg-ring{display:none!important}</style>'''
replacement = preamble + engine.replace('</script', '<\\/script') + '</script>' + css
assert len(replacement) < 200000
regex = {'characterId':'shikong-zhimen','regex_scripts':[{'scriptName':'時空之門｜原作冒險面板（夜灣適配）','findRegex':r'^[\s\S]*\[\[TG_PANEL\]\][\s\S]*$','replaceString':replacement,'disabled':False}]}
write('data/characters/general/shikong-zhimen.regex.json',regex)
card=load('docs/sources/the-ages/character.original.json')
card['meta'].update(author='齊格飛',author_id='chicofy',avatar='assets/characters/the-ages/cover.png')
card['content']['greeting']='[[TG_PANEL]]\n\n'+card['content']['greeting'].replace('按下去就會送出','按下後會填入夜灣輸入框，再由你按送出')
card['content']['greeting']=card['content']['greeting'].replace('**怎麼玩**','**怎麼玩**\n點故事上方的「啟用冒險面板」，確認後即可建立角色。面板按鈕只填入指令，仍由你按送出。')
# Render the authored opening through the native safe HTML reader without rewriting its text.
opening=card['content']['greeting']
opening=re.sub(r'!\[\]\((https://[^)]+)\)', r'<img src="\1" alt="新手訓練中心" style="width:100%">', opening)
opening=re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', opening)
card['content']['greeting']='\n'.join('<p>'+block.replace('\n','<br>')+'</p>' for block in opening.split('\n\n'))
# Preserve prompt mechanics; only replace platform-specific visual primitives.
for key in ['system_prompt','author_instructions']:
    text=card['content'][key]
    text=text.replace('class="hc-quote"','class="tg-quote"').replace('class="hc-st"','class="tg-st"').replace('class="hc-p"','class="tg-p"').replace('class="hc-d"','class="tg-d"')
    text=text.replace('<hc-collapse title="📜 {稱號}{角色名}｜{職業}">','<details><summary>📜 {稱號}{角色名}｜{職業}</summary>').replace('</hc-collapse>','</details>')
    card['content'][key]=text
card['content']['author_instructions']='【夜灣操作適配】原文所稱面板自動送出，在夜灣一律改為填入輸入框、由玩家按送出。面板內無需AI演出的一般動作仍自行結算。求助與操作說明以這項平台差異為準，其餘規則不變。\n\n'+card['content']['author_instructions']
card['content']['creator_notes']+='\n\n【夜灣技術適配】保留原始世界書101則與遊戲引擎，原檔見 docs/sources/the-ages。面板改用故事隔離的存檔、遊戲回執橋接及玩家手動送出；開啟保存冒險進度後，面板存檔跟隨故事備份。作者原始 hc-btn 行動建議由夜灣轉為填入草稿的按鈕。舊轉換備註所述未附面板已於此版本補齊。'
card['gameplay']['initial_state']['time']='第1天 08:00'
card['gameplay']['initial_state']['location']='新手訓練中心・時空之門落點'
card['gameplay']['initial_state']['worldbookLibrary']['installed'][0]['meta']['author']='齊格飛'
card['presentation']['supported_display']['ui']=True
write('data/characters/general/shikong-zhimen.json',card)
catalog=load('data/characters.json')
entry={**card['meta'],'file':'data/characters/general/shikong-zhimen.json','title':card['meta']['name'],'supported_modes':card['gameplay']['supported_modes'],'supported_display':card['presentation']['supported_display'],'published_at':'2026-10-25T14:30:00Z','updated_at':'2026-10-25T15:15:00Z','published_version':2,'version_published_at':'2026-10-25T15:15:00Z','discovery':{'category':'world','rating':'general'}}
catalog=[e for e in catalog if e['id']!=entry['id']];catalog.append(entry);write('data/characters.json',catalog)
