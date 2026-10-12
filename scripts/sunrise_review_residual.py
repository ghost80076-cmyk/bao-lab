"""Author-only ledger for the ten residual sources omitted by earlier batches."""
import re
INDICES = (7, 30, 31, 32, 52, 58, 65, 69, 71, 74)
ALLOWED = {i: set() for i in INDICES}
NAMES = {}
LABELS = {}
KEYWORDS = {}
DECISIONS = {'residual-withheld': {'status': 'resolved', 'authority': list(INDICES), 'affected': list(INDICES), 'adopted': '模板、秘密真相、依戀／控制劇情、夜店人物細節與前端規則全部留在作者層。', 'reason': '內容涉及未公開真相、情感控制、黑幫案件、成人夜店人物或重複全域系統，沒有適合直接公開召回的安全投影。'}}
def chapter_spans(index, content):
    starts = [m.start() for m in re.finditer(r'^#{1,4} ', content, re.M)]
    if not starts or starts[0] != 0: starts.insert(0, 0)
    return list(zip(starts, starts[1:] + [len(content)]))
