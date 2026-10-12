"""Final author-only ledger for mature, minor and authoring-template sources."""
import re

ALLOWED = {i: set() for i in range(166, 183)}
NAMES = {}
LABELS = {}
KEYWORDS = {}
DECISIONS = {
    'final-sensitive-boundary': {
        'status': 'resolved', 'authority': list(range(166, 183)),
        'affected': list(range(166, 183)),
        'adopted': '異能／任務／模式模板留作者工具層；NSFW、性慾、非自願內容與未成年角色來源不公開；成人黑暗角色僅保留原始審閱索引。',
        'reason': '本批混合重複全域系統、露骨性內容、非自願性暴力、未成年角色與作者模板，沒有適合直接公開召回的安全投影。'
    }
}

def chapter_spans(index, content):
    starts = [m.start() for m in re.finditer(r'^#{1,4} ', content, re.M)]
    if not starts or starts[0] != 0:
        starts.insert(0, 0)
    return list(zip(starts, starts[1:] + [len(content)]))
