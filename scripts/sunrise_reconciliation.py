"""Explicit editorial decisions; never change the archived author export."""
import hashlib
import re
from sunrise_character_review import DECISIONS as CHARACTER_DECISIONS, project

DECISIONS = {
    'work-population': {
        'status': 'resolved', 'authority': ['author-mother-draft'], 'affected': [0],
        'adopted': '《失序之城》配套採人口500萬、全市5%異能者。',
        'reason': '以本次作者母稿為作品版本；來源800萬版本仍保存在原始匯出。'},
    'work-security-grades': {
        'status': 'resolved', 'authority': ['author-mother-draft'], 'affected': [98, 104],
        'adopted': '北山S級、南區F級；其他區域沿用母稿。',
        'reason': '配套可選包與角色卡不能送入不同的治安分級。'},
    'district-census': {
        'status': 'unresolved', 'authority': [0, 1, 2, 98, 99, 101, 104],
        'affected': [0, 1, 2, 98, 99, 101, 104], 'adopted': None,
        'reason': '片區人口及異能者比例不能組成500萬／5%的全市統計；發布資料標待核，不虛構配平。'},
    'police-staff': {
        'status': 'resolved', 'authority': [107], 'affected': [0, 107],
        'adopted': '全市警局編制約 3,000 人：警察 2,500、行政 500。',
        'reason': '機構專頁明確定義全市管轄與人員構成；不杜撰總部／分局差異來保留 12,000。'},
    'bloody-july-date': {
        'status': 'resolved', 'authority': [96, 49, 99, 110, 113, 115, 117, 118],
        'affected': [0, 53, 63, 96],
        'adopted': '血色七月在故事開場基準時間的 15 年前；煉律審查系統在事件後 3 個月成立。',
        'reason': '完整事件專頁、學院、地區與多個組織的相對成立年表相互支持；不用現實年份代替故事年份。'},
    'prison-schedule': {
        'status': 'resolved', 'authority': [119], 'affected': [119, 138],
        'adopted': '06:00 起床；06:30 早餐；07:00–12:00 勞動；12:00 午餐；13:00–17:00 勞動；17:00 晚餐；18:00–19:00 放風；19:00–21:00 牢房自由時間；21:00 熄燈就寢。',
        'reason': '採具體監獄專頁作息；規則頁不再另設 08:00 開工、23:00 就寢與 22:00 查房。'},
    'bloody-july-cause': {
        'status': 'unresolved', 'authority': [0, 96], 'affected': [0, 96],
        'adopted': None,
        'reason': '總覽稱警方射殺少年；事件專頁以學生失蹤及抗議為起因。公開摘要不指定起因，完整事件劇情仍待整理。'},
    'absolute-case-year': {
        'status': 'unresolved', 'authority': [159], 'affected': [159],
        'adopted': None,
        'reason': '案件號與內文含 2017 年，但故事開場曆年未定；不把玩家真實年份套入，也不直接改案件 ID。'},
    'participant-ages': {
        'status': 'unresolved', 'authority': [8, 16, 17, 19, 43, 53, 61, 75, 97], 'affected': [52, 61, 97],
        'adopted': None,
        'reason': '以角色檔案年齡反推15年前：蕭23歲（事件頁30）、林宇軒23（15）、雷震天43（20）、林雨萱20（10）、炎月夜5（4）、ゆめ5（12）、桃華若仍在世應38／當時23（25）。阿蕾西亞當時9歲，不能把18歲覺醒、20歲任職與血色七月串成同一次執勤經歷；相關事件人物段暫不發布，不擅改角色年齡。'},
    'registration-law-date': {
        'status': 'unresolved', 'authority': [0, 96, 113], 'affected': [0, 96, 113],
        'adopted': None,
        'reason': '總覽稱 10 年前推出登記法，事件與幫派專頁稱 15 年前事件後強制實施；是否初版／修法無證據，不自行補設。'}
}

DECISIONS.update(CHARACTER_DECISIONS)

HISTORY = '''## 重大歷史事件（整合摘要）

以下時間以故事開場的基準時間計算，不隨玩家現實日期變動。

十年前「覺醒潮」：大規模異能覺醒，異能者人數增加，社會秩序受到衝擊。

十五年前「血色七月」：異能者抗議與衝突、政府鎮壓及幫派崛起的重要轉捩點。起因的來源描述有歧異，本摘要不指定起因、幕後主使或角色秘密。

這是歷史背景，不是本輪新發生的事件。'''


def reconcile_chapter(index, part, value):
    ids = []
    if (index, part) == (0, 2):
        value = value.replace('曙光市警局（12,000 警力）', '曙光市警局（約 3,000 人編制：警察 2,500 人、行政人員 500 人）')
        ids = ['police-staff']
    elif (index, part) == (0, 4):
        value = HISTORY
        ids = ['bloody-july-date', 'bloody-july-cause']
    if (index, part) == (96, 0):
        value = value.replace('15年前（玩家當前時間點往前推算）', '15年前（相對故事開場基準，不隨本輪時鐘或現實日期滾動）')
        ids.append('bloody-july-date')
    if (index, part) == (0, 0):
        value = value.replace('人口 800 萬', '人口 500 萬')
        ids.append('work-population')
    if index == 98 and part == 0:
        value = value.replace('治安等級**：A 級', '治安等級**：S 級')
        ids.append('work-security-grades')
    if index == 104 and part == 0:
        value = value.replace('治安等級**：D 級', '治安等級**：F 級')
        ids.append('work-security-grades')
    if index in (0, 1, 2, 98, 99, 101, 104):
        before = value
        value = re.sub(r'\*\*常住人口：[0-9.]+ 萬\*\*', '**常住人口：統計尚待確認**', value)
        value = re.sub(r'\*\*人口\*\*：約 [0-9.]+ 萬人[^\n]*', '**人口**：片區統計尚待確認', value)
        value = re.sub(r'異能者比例(?:\*\*)?[:：] ?[0-9]+%[^\n]*', '異能者比例：片區統計尚待確認', value)
        if before != value: ids.append('district-census')
    value, character_ids = project(index, part, value)
    return value, ids + character_ids


def reconciled_source(index, value):
    """Reusable full-source normalization for future reviewed chapters, not publication."""
    if index == 0:
        value = value.replace('曙光市警局（12,000 警力）', '曙光市警局（約 3,000 人編制：警察 2,500 人、行政人員 500 人）')
        value = value.replace('五年前「血色七月」', '十五年前「血色七月」')
    if index == 53:
        value = value.replace('5年前：「血色七月」事件', '15年前：「血色七月」事件')
    if index == 63:
        value = value.replace('血色七月後3個月（10年前）', '血色七月後3個月（相對故事開場為14年9個月前）')
    if index == 138:
        start = value.index('### 作息時間表')
        end = value.index('### 禁止行為', start)
        value = value[:start] + '### 作息時間表\n' + DECISIONS['prison-schedule']['adopted'] + '\n\n' + value[end:]
    return value


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()
