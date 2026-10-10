"""Compile reviewed event instructions into bounded, opt-in native profiles."""
import argparse
import hashlib
import json
import pathlib
import re

BOOK_ID = 'b43bd078-1b19-46e8-bfc8-952660be367d'
KINDS = ['fortune', 'crisis', 'emotion', 'breakthrough', 'conspiracy', 'exploration', 'social', 'resources', 'time', 'karma', 'mystery', 'fortunate-npc', 'crossover-npc']

def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()

def build(source, root):
    book = source.get('worldbook', {})
    if book.get('id') != BOOK_ID or book.get('visibility') != '公開' or len(source['entries']) != 191:
        raise ValueError('Only the reviewed public edition is supported')
    path = root / 'data/three-realms-event-director-provenance.json'
    if path.exists():
        for record in json.loads(path.read_text())['records']:
            if digest(source['entries'][record['source_index']]['content']) != record['source_sha256']:
                raise ValueError('Reviewed event source changed')
    profiles, records = [], []
    for index, kind in enumerate(KINDS, 173):
        original = source['entries'][index]
        raw = original['content']
        label = original['title'].removesuffix('系統').removesuffix('條目')
        steps = re.findall(r'【第[一二三四五六]步：([^】]+)】', raw)
        types = re.findall(r'(?m)^### [1-6]\. (.+)$', raw)
        realms = {}
        for realm in ['下界', '中界', '上界']:
            found = re.search(r'【' + realm + r'】\n(.*?)(?=\n【|\n---|\Z)', raw, re.S)
            if not found:
                raise ValueError('Reviewed realm examples changed')
            realms[realm] = found.group(1).strip()
        if len(steps) != 6 or len(types) != 6:
            raise ValueError('Reviewed six-step structure changed')
        goal = ('合理的氣運之子角色' if index == 184 else '將玩家指定的原作角色合理融入當前世界' if index == 185 else re.search(r'設計一個([^。]+)。', raw).group(1))
        notes = raw.split('## 特殊注意\n\n', 1)[1].strip()
        profile = {'id': kind, 'label': label, 'aliases': [label], 'goal': goal, 'steps': steps, 'types': types, 'realms': realms, 'notes': notes}
        if index >= 184:
            profile['category'] = 'generator'
            profile['details'] = re.findall(r'【第[一二三四五六]步：[^】]+】\n(.*?)(?=\n【第|\n---|\Z)', raw, re.S)
            profile['details'] = [part.strip() for part in profile['details']]
            if len(profile['details']) != 6:
                raise ValueError('Reviewed character fields changed')
        if index == 173:
            profile['aliases'] += ['奇遇事件', '機緣事件']
        profiles.append(profile)
        records.append({'source_index': index, 'source_title': original['title'], 'source_sha256': digest(raw), 'profile_id': kind, 'profile_sha256': digest(json.dumps(profile, ensure_ascii=False, sort_keys=True, separators=(',', ':')))})
    queries = [(43, 'relations', '整理關係網路'), (44, 'recap', '總結劇情'), (45, 'timeline', '列出重要事件'), (46, 'inventory', '整理物品清單'), (47, 'world', '說明當前世界觀'), (48, 'background', '介紹世界背景'), (51, 'npcs', '整理人物檔案')]
    for index, kind, label in queries:
        original = source['entries'][index]
        raw = original['content']
        layout = re.findall(r'(?m)^#{2,3} (.+)$', raw)
        if not layout:
            raise ValueError('Reviewed query layout changed')
        profile = {'id': 'query-' + kind, 'label': label, 'aliases': [label, '【系統指令】' + label], 'category': 'query', 'command': '【系統指令】' + label, 'layout': layout}
        if profile['category'] == 'workshop':
            profile['legacy_pattern'] = {'switch': '^【系統指令】切換到', 'fusion': '^【系統指令】融合', 'custom': '^【系統指令】自訂世界觀(?:[:：]|$)'}[kind]
        profiles.append(profile)
        records.append({'source_index': index, 'source_title': original['title'], 'source_sha256': digest(raw), 'profile_id': profile['id'], 'profile_sha256': digest(json.dumps(profile, ensure_ascii=False, sort_keys=True, separators=(',', ':')))})
    workshops = [(32, 'switch', '世界觀切換'), (49, 'fusion', '世界觀融合'), (50, 'custom', '自訂世界觀')]
    for index, kind, label in workshops:
        original = source['entries'][index]
        raw = original['content']
        layout = re.findall(r'(?m)^#{2,3} (.+)$', raw) if index != 32 else ['新世界概要', '處理方式：保留／轉換／重置／融合', '角色身份提案', '資料保留範圍', '待確認事項']
        if not layout:
            raise ValueError('Reviewed world design layout changed')
        aliases = [label]
        if index == 49:
            aliases.append('融合世界觀')
        profile = {'id': 'workshop-' + kind, 'label': label, 'aliases': aliases, 'category': 'workshop', 'layout': layout}
        if profile['category'] == 'workshop':
            profile['legacy_pattern'] = {'switch': '^【系統指令】切換到', 'fusion': '^【系統指令】融合', 'custom': '^【系統指令】自訂世界觀(?:[:：]|$)'}[kind]
        profiles.append(profile)
        records.append({'source_index': index, 'source_title': original['title'], 'source_sha256': digest(raw), 'profile_id': profile['id'], 'profile_sha256': digest(json.dumps(profile, ensure_ascii=False, sort_keys=True, separators=(',', ':')))})
    original = source['entries'][41]
    profile = {'id': 'workshop-xuanhuan', 'label': '玄幻世界構思', 'aliases': ['玄幻世界構思'], 'category': 'workshop', 'layout': ['世界背景與基調', '宗門與勢力', '修煉路線與資源', '日常與歷練', '角色身份提案', '待確認事項'], 'guidance': '以靈氣、宗門、功法、丹藥、陣法、妖獸和秘境作為可選元素，兼顧修煉、歷練、同門日常與情義。先確認是否使用三界九域及所在界域；若玩家只指定玄幻類型，提出通用草案而不把三界梯度當既定規則。保持已有境界路線，不將下界鬥氣、中界修仙、上界梯度混為同一套。場景比例只是風格方向，不宣稱百分比排程或可靠亂數。新的宗門、能力、資源、過往與人物關係都只是提案，不能直接授予或寫入存檔。'}
    profiles.append(profile)
    records.append({'source_index': 41, 'source_title': original['title'], 'source_sha256': digest(original['content']), 'profile_id': profile['id'], 'profile_sha256': digest(json.dumps(profile, ensure_ascii=False, sort_keys=True, separators=(',', ':')))})
    js = '(function(root) {\n  "use strict";\n  const profiles = ' + json.dumps(profiles, ensure_ascii=False, indent=2) + ';\n  if (typeof module === "object" && module.exports) module.exports = profiles;\n  if (root) root.BAOThreeRealmsEventProfiles = profiles;\n})(typeof window === "undefined" ? null : window);\n'
    (root / 'js/three-realms-event-profiles.js').write_text(js)
    path.write_text(json.dumps({'schema': 'yorubay-native-instruction-provenance', 'version': 1, 'source_book_id': BOOK_ID, 'source_visibility': '公開', 'records': records}, ensure_ascii=False, indent=2) + '\n')
    print('Compiled 11 event, 2 character and 7 query and 4 world-design sources into native profiles.')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=pathlib.Path)
    args = parser.parse_args()
    build(json.loads(args.source.read_text()), pathlib.Path(__file__).resolve().parents[1])
