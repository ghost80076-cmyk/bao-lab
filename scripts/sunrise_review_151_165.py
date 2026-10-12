"""Author-only ledger for procedural crime and duplicate encounter systems."""
import re

ALLOWED = {i: set() for i in range(151, 166)}
NAMES = {}
LABELS = {}
KEYWORDS = {}
DECISIONS = {
    'procedural-systems-withheld': {
        'status': 'resolved', 'authority': list(range(151, 166)),
        'affected': list(range(151, 166)),
        'adopted': '身份、審訊、越獄、偵查、武器、案件、奇遇、異寶與秘境規則留在作者層。',
        'reason': '本批主要是可操作的犯罪／執法／越獄流程或獨立數值系統，且會與夜灣前端的狀態、時間、事件與召回層重複。'
    }
}

def chapter_spans(index, content):
    starts = [m.start() for m in re.finditer(r'^#{1,4} ', content, re.M)]
    if not starts or starts[0] != 0:
        starts.insert(0, 0)
    return list(zip(starts, starts[1:] + [len(content)]))
