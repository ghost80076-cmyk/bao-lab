"""Batch route the pinned public source, deduplicate templates, emit native drafts.

Routing is not a claim that every paragraph has been editorially reviewed.
No unpublished source prose is emitted. Native drafts do not enable themselves.
"""
import collections
import json
import pathlib
import re
import sys
import zipfile
from sunrise_reconciliation import DECISIONS, digest, reconciled_source

ROOT = pathlib.Path(__file__).resolve().parents[1]
GROUPS = {
    'npc-template': ([7, 178], 'authoring-template', ['profile', 'npc_rules', 'initial_state.npcs']),
    'location-template': ([175], 'authoring-template', ['world', 'lore']),
    'status-panel': ([131], 'native-mapping', ['initial_state', 'world_modules', 'ui']),
    'quests': ([176, 177], 'native-mapping', ['world_modules.quests', 'world_clock']),
    'skills': ([147], 'native-mapping', ['world_modules.skills']),
    'inventory': ([157, 158, 163, 164], 'native-mapping', ['world_modules.inventory', 'world_modules.equipment']),
    'economy': ([132, 133, 134, 135, 136, 137], 'native-mapping', ['world_modules.economy']),
    'factions': ([139, 140], 'native-mapping', ['world_modules.factions']),
    'reputation': ([141, 142, 150, 151], 'native-mapping', ['world_modules.reputation']),
    'cases': ([159, 160], 'native-mapping', ['world_modules.quests', 'lore', 'world_clock']),
    'encounters': ([161, 162], 'native-mapping', ['world_clock', 'dynamic_prompts']),
    'awakening': ([169, 170], 'native-mapping', ['creation_options', 'world_modules.skills']),
    'modes': ([179, 180], 'authoring-template', ['creation_options', 'dynamic_prompts']),
    'scene-style': ([171, 172], 'authoring-template', ['narrative_profile']),
}


def build(export_path):
    with zipfile.ZipFile(export_path) as archive:
        source = json.loads(archive.read(next(n for n in archive.namelist() if '囚徒' in n and n.endswith('.json'))))
    pins = json.loads((ROOT / 'data/sunrise-migration-coverage.json').read_text())
    if source['worldbook']['visibility'] != '公開' or source['worldbook']['id'] != pins['source_worldbook_id'] or len(source['entries']) != len(pins['entries']):
        raise ValueError('Unexpected source')
    overrides = {i: (name, route, targets) for name, (ids, route, targets) in GROUPS.items() for i in ids}
    inventory, hashes, templates = [], collections.defaultdict(list), collections.defaultdict(list)
    for i, entry in enumerate(source['entries']):
        content = entry['content']
        if digest(content) != pins['entries'][i]['source_sha256']:
            raise ValueError(f'Pinned source changed: {i}')
        default = {'角色': ('characters', 'character-reference', ['profile', 'lore']),
                   '地點': ('locations', 'world-reference', ['world', 'lore']),
                   '事件': ('events', 'scenario-reference', ['lore']),
                   '規則': ('rules', 'mixed-rules-review', ['world_modules', 'lore']),
                   '自訂': ('custom', 'mixed-rules-review', ['profile'])}[entry['category']]
        group, route, targets = overrides.get(i, default)
        record = {'source_index': i, 'source_sha256': digest(content), 'category': entry['category'],
                  'group': group, 'route': route, 'targets': targets,
                  'editorial_status': 'needs-content-review',
                  'publication_status': pins['entries'][i]['status']}
        normalized = reconciled_source(i, content)
        if normalized != content:
            record['normalized_draft_sha256'] = digest(normalized)
            record['decisions'] = [key for key, d in DECISIONS.items() if d['status'] == 'resolved' and i in d['affected']]
        inventory.append(record)
        hashes[digest(content)].append(i)
        if group == 'npc-template':
            headings = re.findall(r'^### (.+)$', content, re.M)
            for heading in headings:
                templates[heading].append(i)
    return {'schema': 'yorubay-source-integration-plan', 'version': 1,
            'source_worldbook_id': pins['source_worldbook_id'],
            'summary': {'source_entries': len(inventory), 'routes': dict(collections.Counter(e['route'] for e in inventory)),
                        'native_or_template_sources': sum(e['route'] in ('native-mapping', 'authoring-template') for e in inventory)},
            'entries': inventory,
            'exact_duplicate_groups': [indices for indices in hashes.values() if len(indices) > 1],
            'template_merge': {'sources': [7, 178], 'shared_sections': len([v for v in templates.values() if len(v) == 2]),
                               'decision': '合併為一份作者人物模板；個別角色資料另存，不向聊天重複注入兩份模板。'},
            'conflicts': [{'id': key, **value} for key, value in DECISIONS.items()]}


def native_draft():
    # Valid native module definitions, empty state. No invented quests/NPCs/wealth.
    fields = {'status': [('energy', '體力', 'meter'), ('ability_reserve', '異能餘量', 'meter')],
              'economy': [('balance', '資產', 'number')],
              'reputation': [('public', '公開聲望', 'number')]}
    modules = []
    for key in ['status', 'inventory', 'skills', 'quests', 'factions', 'economy', 'equipment', 'reputation']:
        item = {'id': key, 'kind': 'collection' if key in ['inventory', 'skills', 'quests', 'factions', 'equipment'] else 'object',
                'tracking': 'medium', 'context': 'core' if key in ['status', 'economy'] else 'relevant'}
        if key in fields:
            item['fields'] = [{'key': k, 'label': label, 'type': t} for k, label, t in fields[key]]
        modules.append(item)
    return {'schema': 'yorubay-native-authoring-draft', 'version': 1, 'world': 'sunrise-city',
            'status': 'authoring-draft', 'source_groups': list(GROUPS),
            'character_fragment': {'world_modules': modules,
                                   'initial_state': {'modules': {m['id']: [] if m['kind'] == 'collection' else {} for m in modules}}},
            'constraints': ['套用到作者作品後才生效，不自動修改任何故事或全站設定。',
                            '模板不是已登場人物；秘密不可填入公開名冊。',
                            '任務接受、進度、獎勵、失敗依確認事件更新；期限使用世界時鐘。',
                            '百分比不等於程式亂數，數值公式與遊戲模式仍須另外實作及驗證。']}


if __name__ == '__main__':
    plan = build(sys.argv[1])
    for name, value in [('sunrise-integration-plan.json', plan), ('sunrise-native-blueprint.json', native_draft())]:
        (ROOT / 'data' / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(plan['summary'], ensure_ascii=False))
