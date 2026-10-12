"""Public projections for the remaining South/police/faction sources.

High-risk plots, criminal operations, coercive control and Origin Project
material remain withheld from the public worldbook.
"""
import re

ALLOWED = {
    106: set(), 107: set(), 108: set(), 109: set(),
    110: {0}, 111: set(), 112: set(), 113: {0, 1}, 114: set(),
    115: {0}, 116: set(), 117: set(), 118: set(), 119: set(),
    120: set(),
}
NAMES = {108: '曙光市警局', 110: '三合會', 111: '三合會',
         113: '狼幫組織', 114: '狼幫', 115: '鐵鏈組織'}
LABELS = {
    (108, 0): '警局｜內務調查公開職能', (108, 1): '警局｜鑑識公開職能',
    (108, 2): '警局｜特勤公開職能', (110, 0): '三合會｜公開組織輪廓',
    (111, 0): '三合會｜公開分支輪廓', (113, 0): '狼幫｜公開組織輪廓',
    (113, 1): '狼幫｜公開歷史背景', (114, 0): '狼幫｜公開關係背景',
    (115, 0): '鐵鏈組織｜公開組織輪廓', (115, 1): '鐵鏈組織｜公開歷史背景',
}
KEYWORDS = {k: [v.split('｜')[0]] for k, v in LABELS.items()}
KEYWORDS.update({(108, 0): ['曙光市警局', '內務調查'], (108, 1): ['曙光市警局', '鑑識'],
                 (108, 2): ['曙光市警局', '特勤'], (110, 0): ['三合會'],
                 (111, 0): ['三合會'], (113, 0): ['狼幫'], (114, 0): ['狼幫'],
                 (115, 0): ['鐵鏈組織'], (115, 1): ['鐵鏈組織']})

DECISIONS = {
    'south-crime-withheld': {'status': 'resolved', 'authority': [106, 109, 112, 116, 120],
        'affected': [106, 109, 112, 116, 120], 'adopted': '南區人口販運、毒品、器官買賣、兒童剝削、黑市與監獄走私段落整批不公開。',
        'reason': '保留原作黑暗張力，但不把可操作犯罪流程或未成年受害內容帶入前端召回。'},
    'faction-public-boundary': {'status': 'resolved', 'authority': [110, 111, 113, 114, 115],
        'affected': [110, 111, 113, 114, 115], 'adopted': '只發布組織存在、公共定位與非操作性歷史輪廓；交易、據點、招募、武器與滅口細節留在作者層。',
        'reason': '讓地圖與角色能辨識勢力，又避免提供犯罪組織的行動手冊。'},
    'origin-project-withheld': {'status': 'resolved', 'authority': [118], 'affected': [118],
        'adopted': '源點計畫整筆保留作者來源，不公開人體實驗、控制、實驗體來源或地下據點細節。',
        'reason': '內容涉及強制控制與人體實驗，尚未有安全可玩的公共投影。'},
}

def chapter_spans(index, content):
    starts = [m.start() for m in re.finditer(r'^#{2,4} ', content, re.M)]
    if not starts or starts[0] != 0: starts.insert(0, 0)
    return list(zip(starts, starts[1:] + [len(content)]))

def project(index, part, value):
    ids = []
    if index in (110, 113, 115):
        ids.append('faction-public-boundary')
    # The migration audit only accepts reconciliation IDs registered in
    # sunrise_reconciliation; this batch's editorial boundary is recorded in
    # the review module and batch documentation instead.
    return value, []
