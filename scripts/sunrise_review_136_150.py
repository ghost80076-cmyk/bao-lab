"""Author-only ledger for prison, crime and duplicate system sources."""
import re

ALLOWED = {i: set() for i in range(136, 151)}
# Source 138 already has two non-sensitive institutional chapters published
# by the earlier prison review; preserve those chapters and defer the rest.
ALLOWED[138] = {4, 5}
NAMES = {}
LABELS = {}
KEYWORDS = {}
DECISIONS = {
    'prison-crime-systems-withheld': {
        'status': 'resolved', 'authority': list(range(136, 143)) + list(range(147, 151)),
        'affected': list(range(136, 143)) + list(range(147, 151)),
        'adopted': '監獄灰色產業、通緝追殺、勢力關係、技能、成癮與身份系統留在作者層。',
        'reason': '含可操作犯罪、武器／毒品、追殺與系統化數值規則，且多數機制由夜灣前端或狀態層承擔。'
    },
    'wanted-character-withheld': {
        'status': 'resolved', 'authority': list(range(143, 147)), 'affected': list(range(143, 147)),
        'adopted': '班長角色的受害者收藏、調教器具、控制與暴力細節不進公開資料。',
        'reason': '涉及露骨性剝削、非自願控制與性暴力，沒有安全的公開投影。'
    }
}

def chapter_spans(index, content):
    starts = [m.start() for m in re.finditer(r'^#{1,4} ', content, re.M)]
    if not starts or starts[0] != 0:
        starts.insert(0, 0)
    return list(zip(starts, starts[1:] + [len(content)]))
