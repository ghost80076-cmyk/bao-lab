"""Explicit editorial decisions; never change the archived author export."""
import hashlib

DECISIONS = {
    'police-staff': {
        'status': 'resolved', 'authority': [107], 'affected': [0, 107],
        'adopted': '全市警局編制約 3,000 人：警察 2,500、行政 500。',
        'reason': '機構專頁明確定義全市管轄與人員構成；不杜撰總部／分局差異來保留 12,000。'},
    'bloody-july-date': {
        'status': 'resolved', 'authority': [96, 49, 99, 110, 113, 115, 117, 118],
        'affected': [0, 53, 63],
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
        'status': 'unresolved', 'authority': [52, 61, 97], 'affected': [52, 61, 97],
        'adopted': None,
        'reason': '統一事件年份後仍須交叉檢查角色當時年齡、就學、任職與親屬事件；不能只做數字替換。'},
    'registration-law-date': {
        'status': 'unresolved', 'authority': [0, 96, 113], 'affected': [0, 96, 113],
        'adopted': None,
        'reason': '總覽稱 10 年前推出登記法，事件與幫派專頁稱 15 年前事件後強制實施；是否初版／修法無證據，不自行補設。'}
}

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
    return value, ids


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
