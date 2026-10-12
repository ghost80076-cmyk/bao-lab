"""Author-only review ledger for explicit adult systems and criminal mechanics."""
import re

ALLOWED = {i: set() for i in range(121, 136)}
NAMES = {}
LABELS = {}
KEYWORDS = {}
DECISIONS = {
    'adult-explicit-systems-withheld': {
        'status': 'resolved', 'authority': list(range(121, 136)),
        'affected': list(range(121, 136)),
        'adopted': 'Rose Club 成人遊戲、性慾／開放度、犯罪欲望／暴力衝動、洗錢、監獄黑市與露骨狀態欄來源全部先留在作者原檔。',
        'reason': '本批同時含露骨性行為、非自願／剝削情節與可操作犯罪經濟；且部分狀態／UI 規則已由夜灣前端承擔，不能重複注入。'
    }
}

def chapter_spans(index, content):
    starts = [m.start() for m in re.finditer(r'^#{2,4} ', content, re.M)]
    if not starts or starts[0] != 0:
        starts.insert(0, 0)
    return list(zip(starts, starts[1:] + [len(content)]))
