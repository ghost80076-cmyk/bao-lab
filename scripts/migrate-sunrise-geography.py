"""Rebuild reviewed public Sunrise geography from the pinned author export."""
import hashlib
import json
import pathlib
import re
import sys
import zipfile
from sunrise_reconciliation import reconcile_chapter
from sunrise_character_review import ALLOWED, NAMES, KEYWORDS, INSTITUTION_NAMES
from sunrise_review_29_48 import ALLOWED as NEXT_ALLOWED, NAMES as NEXT_NAMES, KEYWORDS as NEXT_KEYWORDS, CHAPTER_KEYWORDS
ALLOWED = {**ALLOWED, **NEXT_ALLOWED}
NAMES = {**NAMES, **NEXT_NAMES}
KEYWORDS = {**KEYWORDS, **NEXT_KEYWORDS}
from sunrise_review_49_60 import ALLOWED as FAMILY_ALLOWED, LABELS as FAMILY_LABELS, KEYWORDS as FAMILY_KEYWORDS, chapter_spans as family_spans
ALLOWED = {**ALLOWED, **FAMILY_ALLOWED}
from sunrise_review_61_75 import ALLOWED as REVIEW_ALLOWED, NAMES as REVIEW_NAMES, ALIASES, LABELS as REVIEW_LABELS, KEYWORDS as REVIEW_KEYWORDS, chapter_spans as review_spans
ALLOWED = {**ALLOWED, **REVIEW_ALLOWED}
NAMES = {**NAMES, **REVIEW_NAMES}
from sunrise_review_76_90 import ALLOWED as LATE_ALLOWED, NAMES as LATE_NAMES, ALIASES as LATE_ALIASES, LABELS as LATE_LABELS, KEYWORDS as LATE_KEYWORDS, chapter_spans as late_spans
ALLOWED = {**ALLOWED, **LATE_ALLOWED}
NAMES = {**NAMES, **LATE_NAMES}
from sunrise_review_91_105 import ALLOWED as NEW_ALLOWED, NAMES as NEW_NAMES, ALIASES as NEW_ALIASES, LABELS as NEW_LABELS, KEYWORDS as NEW_KEYWORDS, chapter_spans as new_spans
ALLOWED = {**ALLOWED, **NEW_ALLOWED}
NAMES = {**NAMES, **NEW_NAMES}
from sunrise_review_106_120 import ALLOWED as FINAL_ALLOWED, NAMES as FINAL_NAMES, LABELS as FINAL_LABELS, KEYWORDS as FINAL_KEYWORDS, chapter_spans as final_spans, project as final_project
ALLOWED = {**ALLOWED, **FINAL_ALLOWED}
NAMES = {**NAMES, **FINAL_NAMES}
from sunrise_review_121_135 import ALLOWED as ADULT_ALLOWED, NAMES as ADULT_NAMES, LABELS as ADULT_LABELS, KEYWORDS as ADULT_KEYWORDS, chapter_spans as adult_spans
ALLOWED = {**ALLOWED, **ADULT_ALLOWED}
NAMES = {**NAMES, **ADULT_NAMES}
ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCES = {
 76: ('76bbdae9f9249bde6eedf4616b8bde2d3e537a2357745760489215f8937fab8e', 'sunrise-professional-people', '曙光市｜人物公開參考（不代表在場）', ['炎月夜'], {0,1,2,5}),
 77: ('3a4f028c6534ff43737b11de65e377ab43ef8c2a337e60d18421858c0f0255a1', 'sunrise-professional-people', '曙光市｜人物公開參考（不代表在場）', ['影月璃', '璃夜'], {0,1,2,4,7,10}),
 78: ('ffde3be44b55b8ba6384248cc4133f8f09a6c3981d61113c49f813e3d7477cdd', 'sunrise-minor-source-hold', '曙光市｜未成年來源待審（不公開）', ['林瑀萱'], set()),
 79: ('35394a5c1397b83af414659957c707f091f4722fba05cf27c681dc9d0ce2786b', 'sunrise-minor-source-hold', '曙光市｜未成年來源待審（不公開）', ['林慧芳'], set()),
 80: ('89062fa2b03450c891d30b04297105201218540ca45861cf91ee077a486571f1', 'sunrise-minor-source-hold', '曙光市｜未成年來源待審（不公開）', ['李小雅'], set()),
 81: ('ab950b18de5ec4a07c8612231fc9809a25e8ba9740a709d0cff9a1800d766927', 'sunrise-minor-source-hold', '曙光市｜未成年來源待審（不公開）', ['王靜怡'], set()),
 82: ('3bb93d8784fe2bd557b849431dcbc38cae0bb334697903f529d822e5292de7eb', 'sunrise-minor-source-hold', '曙光市｜未成年來源待審（不公開）', ['陳俊豪'], set()),
 83: ('19e374adaddadc4c6f18c22013f8ef9cb75540cc368417ebc27fd026b86361ec', 'sunrise-minor-source-hold', '曙光市｜未成年來源待審（不公開）', ['林可欣'], set()),
 84: ('8270d72a25b27b35e36e39f6336f9ca71132d20be1252e24079728e34850ac1e', 'sunrise-prison-people', '曙光市｜第一監獄人物公開參考（不代表在場）', ['沈妤筠'], {0,1,2,4,5,6,7,9}),
 85: ('35f77ba9d6cb42df5160d68317d24f4f3c8995d7689f4b0ccf7c7967df077af2', 'sunrise-prison-people', '曙光市｜第一監獄人物公開參考（不代表在場）', ['蘇逸辰'], {0,1,2,4,5,6,7,9}),
 86: ('89182689d02a4f6904dc61adefd046bac08aced0389b7ef712b8cfb2445fda51', 'sunrise-prison-people', '曙光市｜第一監獄人物公開參考（不代表在場）', ['監獄相關人物'], {0,1,2,3,7,8,9,10,12,14}),
 87: ('6f9f1b5753a58df223ace842551962d2abc65efa373f2027c5f55508e5065768', 'sunrise-prison-people', '曙光市｜第一監獄人物公開參考（不代表在場）', ['林婉如'], {0,1,2,4,5,6}),
 88: ('c2e9b63e3d1fa160b1f9c602fb9321ae807ec23ebf182a95daff24e1354b5525', 'sunrise-eden-background', '曙光市｜伊甸園科技體驗館公開資料', ['伊甸園科技體驗館', 'Eden'], {0,1,2}),
 89: ('0c9d85c2e24cd3c40f71e9144f0bdd7fb336d321bceb608e3d288c756163e15a', 'sunrise-eden-background', '曙光市｜伊甸園科技體驗館公開資料', ['NS3', '神經連接技術'], {0,3,4}),
 90: ('6dadeeccdd1c4478290f5d9b0b6536b32d4dfcb002ae967c868f53bb29cf92c5', 'sunrise-eden-background', '曙光市｜伊甸園科技體驗館公開資料', ['伊甸園關鍵 NPC'], set()),
 91: ('62a13e08a9bd30fa40790d6a781a7af0121d9792a21e8a94f04ae8ec7ec357b9', 'sunrise-professional-people', '曙光市｜人物公開參考（不代表在場）', ['林月影'], {0,1,2,4,5,6,7,9}),
 92: ('f9396f14061bab4ca07a7e0f41e58454e487352b34eec635d90bc77e47c19f03', 'sunrise-professional-people', '曙光市｜人物公開參考（不代表在場）', ['張皓'], {0,1,2}),
 93: ('d98feba90de7093a181bde3a23a5e61f970df8c148f633cf5a02e5a12141f652', 'sunrise-withheld-author-source', '曙光市｜來源93待審（不公開）', ['蘇夢'], set()),
 94: ('3fbf54d80575bd42208cc74514a657d2fd8fe1eb5634abfb11eb2b00e0256a6e', 'sunrise-port-people', '曙光市｜港口人物公開參考（不代表在場）', ['陳國輝'], {0,1,2,4,5,6,7,9}),
 95: ('bff0f52fe811980a7195534d7eff2e79a1a6d2d6793225941c6e80cb63f881c9', 'sunrise-professional-people', '曙光市｜人物公開參考（不代表在場）', ['艾莉絲·溫特'], {0,1,4,5,6}),
 100: ('d17c2bd9fd5de10d36b7a50397019ca9819be4ff555e29ce54ed0d50381919f0', 'sunrise-withheld-author-source', '曙光市｜北山劇情來源待審（不公開）', ['北山劇情線'], set()),
 102: ('c3b3e3b0711555f629c7dee75400af4317b49fae61d9498824464d359f8b7797', 'sunrise-east-geography', '曙光市｜東區生活地理', ['東區平民區'], {1,2,4}),
 103: ('a285137b1f05eddfd125ca66ba2896c5fb169809915ed9923a0820c42704fbb4', 'sunrise-withheld-author-source', '曙光市｜東區劇情來源待審（不公開）', ['東區劇情線'], set()),
 105: ('6d1129ecc76a8a3ff1a20f8846d4409243e03cb6921d54822debdbf3b8964c24', 'sunrise-south-geography', '曙光市｜南區環境地理', ['曙光市南區'], {1,2,4}),
 61: ('a961ff5f200ee51e12b16ea47dc8228f650110e3ee8c5e5028e71a7e0faf5aac', 'sunrise-professional-people', '曙光市｜人物公開參考（不代表在場）', ['Aletheia', '阿蕾西亞'], {0, 1, 2, 6, 7}),
 62: ('f6ee228f0e58b00365dfd4b1af6f651cf7a8bdeea252f0333c792be987aa13a1', 'sunrise-veritas-institution', '曙光市｜煉律制度公開參考（虛構制度）', ['煉律審查'], {1}),
 63: ('a6bb66c1c48a567838e5d1e39ab527db5ba282efff94568ff4c3cb06ee03f05f', 'sunrise-veritas-institution', '曙光市｜煉律制度公開參考（虛構制度）', ['煉律審查'], {0, 2, 3, 4, 6, 7}),
 64: ('45c8f54c40cdf826c86e834e4b7e031b44920c0081564d4276cc5198c5b6e2b9', 'sunrise-veritas-institution', '曙光市｜煉律制度公開參考（虛構制度）', ['煉律審查'], {0, 2, 3}),
 66: ('9567e71640fc8516d6efdd34e1cedee8e9648e3f513197df4343b3467170bfc6', 'sunrise-velvet-background', '曙光市｜Velvet Eclipse公開場所資料', ['Velvet Eclipse'], {0, 2, 3, 4}),
 67: ('afcd8a36822f1a0bdb93f9ac87cc825dccfd5bb37a8657be41ba7953e9f2afae', 'sunrise-velvet-background', '曙光市｜Velvet Eclipse公開場所資料', ['Velvet Eclipse'], {5}),
 68: ('e0e721b1b19938360097560f263944d6fe96fdcee8d298a8a10046b9358a5da2', 'sunrise-professional-people', '曙光市｜人物公開參考（不代表在場）', ['黑羽璃夜', '璃夜', 'Riya Kuroha'], {0, 1, 2, 6, 7}),
 70: ('f7f871db2e4d1c8ebe2a71203387804ae680d94cf22d7ee6ff5d06b3aef7a979', 'sunrise-professional-people', '曙光市｜人物公開參考（不代表在場）', ['神代隼人', 'Hayato Kamishiro'], {0, 1, 2, 6}),
 72: ('f193c3f01e9083af0279d5dbafed9208e4d752962956fa569edc862f31efb43f', 'sunrise-professional-people', '曙光市｜人物公開參考（不代表在場）', ['清水純'], {0, 1, 2, 6}),
 73: ('7913a821b8ce9eda2c3e10fafa00d10519bfe480246139da52fe8b11f4787bc0', 'sunrise-professional-people', '曙光市｜人物公開參考（不代表在場）', ['清水純戰鬥'], {0}),
 75: ('319546ad6caf498f0f9cc68b3b94b4114b2dfb61308abd3d0933ac410661bf50', 'sunrise-professional-people', '曙光市｜人物公開參考（不代表在場）', ['炎月夜', 'Homura Tsukiyo'], {0, 1, 2}),
 50: ('18efec6495f1276dc4f93017ff5504dad73578c589ccad9c08b34f3e93f05bfa', 'sunrise-xiao-family-background', '曙光市｜蕭家公開背景', ['曙光市｜蕭家公開背景'], {0}),
 51: ('e547b9b282b02029f46eef7017b07bc081e3ef2dd9d5f2d654e8a1044c302f03', 'sunrise-xiao-family-background', '曙光市｜蕭家公開背景', ['曙光市｜蕭家公開背景'], {0, 3, 2, 11}),
 53: ('1e856b81037b3775dc7cfdd182279e727094b2538b7b36a390f9731013815787', 'sunrise-lei-family-background', '曙光市｜雷家公開背景', ['曙光市｜雷家公開背景'], {0, 16, 17, 19, 13, 15}),
 54: ('564c5924f3e0776b2469ede90ce611ab584fcab44de15642fa31b1eb1f7064cf', 'sunrise-lei-family-background', '曙光市｜雷家公開背景', ['曙光市｜雷家公開背景'], {1, 2, 4}),
 55: ('69343a7c458ea0ea37a3b36e2bcfb6632b4cd68924fdcb9eda78347bd172b18f', 'sunrise-family-industries', '曙光市｜異能者家族與產業', ['曙光市｜異能者家族與產業'], {1, 3, 4, 6, 9, 12, 16, 21}),
 56: ('601cf482f649b8f586b3e68f608816640c6315b7bebf4b56ff165b33e5888ac9', 'sunrise-family-industries', '曙光市｜異能者家族與產業', ['曙光市｜異能者家族與產業'], {1, 2, 5, 6, 10, 11}),
 57: ('436412e73d572b4d4c948ec8cd78b6553223daaa9ff60b96c38aeecbafc46b5e', 'sunrise-rose-club-background', '曙光市｜Rose Club公開場所資料', ['曙光市｜Rose Club公開場所資料'], {0, 2, 7}),
 59: ('6ce615798a99662ab3ad7949053ce31e28069d921e903474377c4aacf99cb010', 'sunrise-redlight-background', '曙光市｜紅燈區場所與公開案件', ['曙光市｜紅燈區場所與公開案件'], {2, 4, 5}),
 60: ('1ff947428ce81941bc8db8eb01964b90a1fc896d4d0be82ef51ae8c498ba5b3a', 'sunrise-redlight-background', '曙光市｜紅燈區場所與公開案件', ['曙光市｜紅燈區場所與公開案件'], {10, 11, 13, 14, 15}),
 29: ('8a9a4b46e3d55e2077be844be7eb0c28f02b8fc99a1204c5355264c862e62f52', 'sunrise-official-case-record', '曙光市｜官方案件紀錄（說法與真相分離）', ['異能分類'], {0}),
 35: ('f2f20670f786c4dbaae967974279c369a3d7945f02c374ca9447947d74d937ac', 'sunrise-mental-abilities', '曙光市｜心靈系 Mental（虛構分類）', ['異能分類'], {0, 2}),
 39: ('644975f4db70fb1a166fca06288148ab9a604ff698f0bc40887721ac41e2543e', 'sunrise-biological-abilities', '曙光市｜生物系 Biological（虛構分類）', ['異能分類'], {1, 2, 3, 4}),
 40: ('c18ebc2de2ba26b846727f593bf778dba07f0416757ba68ddfebfb82b5c009bf', 'sunrise-mutation-abilities', '曙光市｜變異系 Mutation（虛構分類）', ['異能分類'], {2, 3, 4}),
 41: ('b7fc02081be17ca013f15c8c38e0b5b63ee0554d276e61f3abca2e6c2bfd57bb', 'sunrise-special-abilities', '曙光市｜特殊系 Special（虛構分類）', ['異能分類'], {0, 1, 4, 5}),
 42: ('5d4be0d56a63ea8eee7e0b0b40b602a0bfa1f832d6a97efb4f2c2c59e244a44e', 'sunrise-forbidden-abilities', '曙光市｜禁忌系 Forbidden（虛構分類）', ['異能分類'], {0, 2, 3, 4, 6, 7}),
 43: ('7014f6b3df0da9390fafa0c681f0c722d54ea87c18a29e37b7f76c3bf91ebe2f', 'sunrise-nightlife-people', '曙光市｜夜職與街區人物公開參考（不代表在場）', ['黑羽 ゆめ', '黑羽ゆめ', 'Kuroha Yume', 'ゆめ'], {0, 1, 2}),
 44: ('13d8767086f03611c10c627703ded62a325e37700aa1da71cba08aacda3d95bc', 'sunrise-nightlife-people', '曙光市｜夜職與街區人物公開參考（不代表在場）', ['桜井 りな', '桜井りな', 'Sakurai Rina', 'りな'], {0, 1, 2, 6, 7}),
 45: ('819508e0e291d5e262569bec95cc1297cc0c2a4e92a36576790afc6b0c014c62', 'sunrise-nightlife-people', '曙光市｜夜職與街區人物公開參考（不代表在場）', ['あいり'], {0, 1, 2, 6}),
 46: ('25d00b82f18846dd69bfc67cb1999a8f6c2df95fad94d8ebdb8d7a4a16027fb2', 'sunrise-nightlife-people', '曙光市｜夜職與街區人物公開參考（不代表在場）', ['高橋 麻美', '高橋麻美', '麻美媽媽'], {0, 1, 2, 6}),
 47: ('7eee0fa4fb74a348e356cc9ffb48f1ac301559b55818f547d9be2ea7a65b2b3b', 'sunrise-nightlife-people', '曙光市｜夜職與街區人物公開參考（不代表在場）', ['琉星', 'Ryusei'], {0, 1, 2, 6, 7}),
 48: ('063e1507ef3746ee736672cf4a513011583edb5789420e7ff3239a8dd5bbaa7b', 'sunrise-nightlife-people', '曙光市｜夜職與街區人物公開參考（不代表在場）', ['田中 美咲', '田中美咲', '美咲'], {0, 1, 2, 6, 7}),
 16: ('465f4fa232ee13371b220d67bb70477037fa1125c0532d89e2798eaeffc45393', 'sunrise-family-people', '曙光市｜人物公開參考（不代表在場）', ['異能者管理局副局長', '天璇異能學院董事'], {0, 1}),
 17: ('06ab5bd2a7ced7527d05df6faa4977a8e92dad4a6e1ba3e7ab6a3af90dc101de', 'sunrise-family-people', '曙光市｜人物公開參考（不代表在場）', ['林宇軒'], {0, 1, 6}),
 18: ('eb80b7b06cf4b41b9664b89f9b5f7b9c9e2e84f255224d8e4e698adf9774afc6', 'sunrise-family-people', '曙光市｜人物公開參考（不代表在場）', ['雷辰'], {0, 1, 5, 6}),
 19: ('a988b52e6aa452731c275d7165b4d0d5a5840bb07c2c6cb221aa2d43c0253512', 'sunrise-family-people', '曙光市｜人物公開參考（不代表在場）', ['桃華'], {0, 1, 6}),
 20: ('4fd949c942212596b357e067f52fa0696caed5355f8d0e7f399559e02e05d3a7', 'sunrise-family-people', '曙光市｜人物公開參考（不代表在場）', ['星野美月'], {0, 1, 6}),
 21: ('5d08c05eb4980bcb7afccf0a6d06457d75346e5d490abea588c9a6ba7976c1a1', 'sunrise-family-people', '曙光市｜人物公開參考（不代表在場）', ['蘇晴'], {0, 1, 6, 7}),
 22: ('1a5ccd5b76161b25e31372429ea8cd9285d20c4df27a78ca3b857d1290fc0b55', 'sunrise-family-people', '曙光市｜人物公開參考（不代表在場）', ['蕭凜'], {0, 6, 7, 8, 9}),
 23: ('cd5a83ffa1af97aedd4bda77b16c58bf7a6ee09842f789422faa3a37dcf6e767', 'sunrise-family-people', '曙光市｜人物公開參考（不代表在場）', ['蕭夜'], {0, 6, 7, 8, 9}),
 24: ('fd45e2660c95e1ee2baa7be5a405362203e56120b920d68381ae0028a3265b08', 'sunrise-family-people', '曙光市｜人物公開參考（不代表在場）', ['蕭辰'], {0, 8, 6}),
 25: ('b04382f8f9e8b000c7d63d458ea61bffa4e777485228ceedecee016b62a7bb23', 'sunrise-family-people', '曙光市｜人物公開參考（不代表在場）', ['蕭星'], {0, 6, 7, 8, 9}),
 26: ('b4589c57066efd17e40a999753a9a647cb78b4b13f0a83371a2ee3b12463162a', 'sunrise-institution-people', '曙光市｜人物公開參考（不代表在場）', ['陳天行'], {0, 1, 2, 3, 4, 5, 6}),
 27: ('4e8e4b95adb36ee9aeb7e18edbe3f751077a78dd609b303e9357aec24cb15b5f', 'sunrise-dock-youth-people', '曙光市｜人物公開參考（不代表在場）', ['阿桃'], {0}),
 28: ('ea5a3ea3e880b994e4351190212824350974b1eac882fe7f9cc3b84b26786e03', 'sunrise-dock-youth-people', '曙光市｜人物公開參考（不代表在場）', ['阿桃居住', '阿桃住處'], {2}),
 96: ('9d40bd423ca93d79e41bfa1f4895b329afc1f104c08aec7cafc0af69a50062ff', 'sunrise-july-record', '曙光市｜血色七月歷史紀錄', ['血色七月'], {0}),
 97: ('e36be103f2f4ea1d499f8923ede29ebe34baaafb8e57031b25813b704b5e9c75', 'sunrise-july-record', '曙光市｜血色七月歷史紀錄', ['血色七月影響', '登記法強制實施'], {1}),
 113: ('a5273301706733d42dbe76f3681e6045fbd1529ffe73d28ea94fcfac847c4499', 'sunrise-wolf-background', '曙光市｜狼幫組織背景', ['狼幫'], {0,1}),
 3: ('a2d2c9cdf2b336667de052d4d3ecfd827ce1764517e621c2eb3d50f558715b95', 'sunrise-container-dock', '曙光市｜貨櫃碼頭基本資料', ['貨櫃碼頭', '1-5 號碼頭', '1–5 號碼頭'], {1}),
 4: ('3975be8f58ac20bb707ce5ab0562133ec9c90dea76e4da0cee9c0eb513e5d069', 'sunrise-container-risk', '曙光市｜貨櫃碼頭環境風險', ['貨櫃碼頭風險', '3 號碼頭', '3號碼頭'], {2}),
 36: ('8e7301af3578a01d3209bab38cb8ce3892df0544528d0ad638815ed22f1049d3', 'sunrise-elemental-abilities', '曙光市｜元素系異能（虛構設定）', ['元素系'], set(range(6))),
 37: ('1db2cff707f0ccfaec98a2275fd006ad2a07e695eb19314c079c1d4865e4a343', 'sunrise-physical-abilities', '曙光市｜身體系異能（虛構設定）', ['身體系'], {1,2,3,4}),
 38: ('4ebe6251aff288281e388d3ed69ac9bae76e3a98ddd93462fa9846c9c2bae5d5', 'sunrise-space-abilities', '曙光市｜空間系異能（虛構設定）', ['空間系'], {0,2}),
 1: ('4afe97b2b9e99ad7fdf29129928b34797f9eb2785824951a057f54a90ee3ce2d', 'sunrise-cbd-geography', '曙光市｜中央商業區', ['中央商業區', 'CBD'], {0,1,2,3,4,5,6,7}),
 2: ('10747da3b24eaaf9eae18e17053e2a6e6042311248d24c236f441c90bfa1396e', 'sunrise-port-geography', '曙光市｜港口生活地理', ['港口工業區'], {0,6}),
 98: ('32830cfa8926ca78c672907c94d35eda8fcf8d6dd9bc611c216bc2a851b437a1', 'sunrise-north-geography', '曙光市｜北山生活地理', ['北山住宅區'], {0,1,3}),
 99: ('bb5a9058afb79975f44f3a48b271a429ad6cb5d670e18664c2da3c2abda7d112', 'sunrise-north-geography', '曙光市｜北山生活地理', ['北山住宅區'], {1}),
 101: ('4f8800d5b5662b9469326ae47d49eb8c5a6aa80360c51542eb1b883fd88e0011', 'sunrise-east-geography', '曙光市｜東區生活地理', ['東區平民區'], {0,1,3,4}),
 104: ('8e68738d0be6e1a39ed1cddca66c55eb1b7fe7c0f8e6fb67eb3c48fb3925a933', 'sunrise-south-geography', '曙光市｜南區環境地理', ['曙光市南區', '南區貧民窟'], {0,1}),
 49: ('b0095ba3033e5691bf22a91d0bc8e0e75df959cba6a3cec98ef7f2a5c412d478', 'sunrise-academy-background', '曙光市｜天璇學院基本資料', ['天璇異能學院'], {0,2,3}),
 107: ('ae9a5ecf3cc6cd2347e81e38f05d00159180e2f2a46c0fe1013bd8379678577b', 'sunrise-police-background', '曙光市｜警局基本資料', ['曙光市警局'], {0}),
 117: ('c00a586d409b6aafe79ee808a51c6c8da3aa68a94685ac46af01ca410c2ad946', 'sunrise-triumph-background', '曙光市｜凱旋企業公開背景', ['凱旋企業集團'], {0,5}),
 119: ('008d68578c55d678edf854d2414dbd52233b7631048e07dae1c80febe09222c6', 'sunrise-prison-background', '曙光市｜第一監獄設施與生活', ['曙光市第一監獄'], {0,3,4}),
 120: ('3bf1f5a14ff484b98b3858b4b09300059ffcab21e059cb28f6a49dfc5fca0226', 'sunrise-prison-background', '曙光市｜第一監獄設施與生活', ['曙光市第一監獄'], {1}),
 121: ('d201b9a8ae3b9ae3f135c269bb645f2df9e3a0606cd84d0b19319e3e38e8a099', 'sunrise-prison-economy-hold', '曙光市｜第一監獄經濟來源（不公開）', ['曙光市第一監獄'], set()),
 122: ('609bfa350609eda0b16f250fa35641488ad73294c29bc270fe2185f20cec422d', 'sunrise-rose-club-scenario-hold', '曙光市｜Rose Club 成人場景來源（不公開）', ['Rose Club'], set()),
 123: ('05c9e994faab1d931d056b8284b5828061b32cb6dd23bf55723014f230bd9055', 'sunrise-rose-club-rules-hold', '曙光市｜Rose Club 遊戲規則來源（不公開）', ['Rose Club'], set()),
 124: ('801a4b1539715ac7285a57e95d1e6145d94453b973058c7966d93e6571caaf43', 'sunrise-adult-state-hold', '曙光市｜成人狀態來源（不公開）', ['成人狀態'], set()),
 125: ('f39969316795d9b2c62471685eb304e756eb0d4fdb8b84d81166ea8262159bd1', 'sunrise-adult-state-hold', '曙光市｜成人狀態來源（不公開）', ['性慾值'], set()),
 126: ('87ba64694ed0adaea854cb4d70496e70200e4d4dd212aa0d8db913a2f3c90834', 'sunrise-adult-state-hold', '曙光市｜成人狀態來源（不公開）', ['開放度'], set()),
 127: ('fa13b33677f37dfe2f19805c6fc106ffc172037bf4641b5b524476c789bdc450', 'sunrise-adult-state-hold', '曙光市｜成人狀態來源（不公開）', ['成人狀態'], set()),
 128: ('e56b3692b544f2c6589801a578f500921e3805a8fed9388b1ac747e0250dc7f3', 'sunrise-crime-state-hold', '曙光市｜犯罪衝動來源（不公開）', ['犯罪欲望'], set()),
 129: ('7760f98bc7582a5d89a4a0afedfd0d662b4bd2a3e29f910ea3524b211aedf8fa', 'sunrise-crime-state-hold', '曙光市｜犯罪衝動來源（不公開）', ['暴力衝動'], set()),
 130: ('b1778409c56af0d24c1f9a73f6df9a0c896d9059e9c4cd4ab1e084b3b15b1d9b', 'sunrise-crime-state-hold', '曙光市｜犯罪衝動來源（不公開）', ['犯罪欲望'], set()),
 131: ('f45d9d11c13c06b33a186e3a2857d31795d93434cfa82bc3a1c3a17504c6a8f9', 'sunrise-state-schema-hold', '曙光市｜狀態欄來源（不公開）', ['狀態欄'], set()),
 132: ('319f7e3ce592f132484a0a259b45491ed9bb76f42d566a36fa610fe06d4a9024', 'sunrise-economy-hold', '曙光市｜貨幣交易來源（不公開）', ['貨幣交易'], set()),
 133: ('47e3f53281c44d90911384d600e67e12da8dbd8222b75e77f9a1ca3cafb185c3', 'sunrise-economy-hold', '曙光市｜貨幣交易來源（不公開）', ['貨幣交易'], set()),
 134: ('9e92af75ee048eaa7ed544990ddd2e4ca7530b64b8783624f4c102ef49b9116a', 'sunrise-prison-economy-hold', '曙光市｜監獄灰色產業來源（不公開）', ['監獄經濟'], set()),
 135: ('86dabfe57ef77fbcffafb102da60db85b27ed3a66492d23f6d420a5e52a7004c', 'sunrise-prison-economy-hold', '曙光市｜監獄灰色產業來源（不公開）', ['監獄經濟'], set()),
 106: ('0b2c3b648ddf5b1ee6cb0c172ad5c9ab15df7d8608219a5d3b13f7fd8b0193a3', 'sunrise-south-geography', '曙光市｜南區案件來源（不公開）', ['南區'], set()),
 108: ('8eec45ac64500fa26c50bf7ba0a5089617343f8c91fc60dfbf68b567f7449b78', 'sunrise-police-background', '曙光市｜警局公開職能（不公開）', ['曙光市警局'], set()),
 109: ('b38a60daed83af16c91b64f9b59de14d426e9b5b6cfb2ef5718e363bb8706dcc', 'sunrise-police-background', '曙光市｜警局腐敗來源（不公開）', ['曙光市警局'], set()),
 110: ('b2f234d4688c068b509ca37375872ee726ac9e84ede3fe18463d2aa09117f412', 'sunrise-triad-background', '曙光市｜三合會公開背景', ['三合會'], {0}),
 111: ('2e0f964a6612e22b960adc157667824c916868f62b4571d40eca0bfc8d457616', 'sunrise-triad-background', '曙光市｜三合會分支來源（不公開）', ['三合會'], set()),
 112: ('df794bc7841f0219c1de1ae6010aa1897674488f4bdaec29e8eedbd62f9142ac', 'sunrise-triad-background', '曙光市｜三合會業務來源（不公開）', ['三合會'], set()),
 114: ('614c9cbba149bb2194f2c6122d56bfa8135a5801ebedbd1fdc9001b810a8dc3e', 'sunrise-wolf-background', '曙光市｜狼幫關係背景（不公開）', ['狼幫'], set()),
 115: ('5b072a7b0ad3ef2bf96ccd1bd1e5ddbc61148c3bbd0938fd331451d9c614ddcd', 'sunrise-iron-chain-background', '曙光市｜鐵鏈組織公開背景', ['鐵鏈組織'], {0}),
 116: ('8c065f89af69fafb18446cf3d5f4b1447808dc0b05acc55680aa083978a9b3ec', 'sunrise-iron-chain-background', '曙光市｜鐵鏈組織關係來源（不公開）', ['鐵鏈組織'], set()),
 118: ('a388a8884f7dd0f96c862b2fd563dc471c61eeca2314fd0dd9c01ec6b11b6eb7', 'sunrise-origin-project-hold', '曙光市｜源點計畫來源（不公開）', ['源點計畫'], set()),
 5: ('2c6d6f17185d0b6e682d602ddaa575cb33e76bcb40399b852f9be1be208fe6ba', 'sunrise-abandoned-dock', '曙光市｜廢棄碼頭基本地理', ['廢棄9號碼頭', '廢棄 9 號碼頭', '9 號碼頭', '9號碼頭'], {1}),
 6: ('48e9e1a2e2866153b5891928880c317ff90f65ce2fa58e06edf4ed16f1873bc5', 'sunrise-dock-scenario', '曙光市｜廢棄碼頭劇情方向', ['廢棄9號碼頭', '廢棄 9 號碼頭', '9 號碼頭', '9號碼頭'], {3}),
 8: ('4fc9905b80b7306b35c7be622cc4dc774b92cc64850811da745b30030dd708cc', 'sunrise-police-people', '曙光市｜警方與海關背景（不代表在場）', ['林雨萱'], {0,1}),
 9: ('90d341a807e0857947dcb8a2314a86c9d6211aae998b218d4c4a6649038c0e57', 'sunrise-port-people', '曙光市｜港口人物背景（不代表在場）', ['陳大海'], {0,1}),
 10: ('255fb4a5133e9e603af9f2c36ce4f64ba6ab6b7cb26e54f62562f83aa2d44927', 'sunrise-port-people', '曙光市｜港口人物背景（不代表在場）', ['Victor'], {0,1}),
 11: ('4dcd8676dad671396a512983a46047badebbd8184a5ab986d5b50a41c6b54a4a', 'sunrise-police-people', '曙光市｜警方與海關背景（不代表在場）', ['林正義'], {0,1}),
 12: ('592d1dcabf5bfe12be1eab14c84417bd70182dee9468de6ef695cf649a25cb13', 'sunrise-police-people', '曙光市｜警方與海關背景（不代表在場）', ['李明哲'], {0,1}),
 13: ('681d3cc350dacc8a513f68d8d9cade258bdff8de96e4d964829657c035eead3a', 'sunrise-port-people', '曙光市｜港口人物背景（不代表在場）', ['老張'], {0,1}),
 14: ('8f8a108d0aa0d0c57af2b78b0b30f81df3b22540991e2762033ddec245c92821', 'sunrise-port-people', '曙光市｜港口人物背景（不代表在場）', ['瘦猴'], {0,1}),
 15: ('30ac5a605b9920c7fffe781b64ec0e8036b0210c4c18a3dcf1480cc17376e626', 'sunrise-port-people', '曙光市｜港口人物背景（不代表在場）', ['啞巴阿文'], {0,1}),
 0: ('4834e239dddf64bc25c350cf6be0f3fbcabdae936fee9804872f788f11916a63', 'sunrise-city-overview', '曙光市｜城市與社會概況', ['曙光市'], {0,1,2,3,4}),
 138: ('5dea856117c564988fae4178292d996961fe53699b086e76a5725d8047854947', 'sunrise-prison-institution', '曙光市｜監獄探視與減刑（虛構世界制度）', ['曙光市第一監獄探視', '第一監獄探視', '第一監獄減刑'], {4,5}),
 33: ('0edb3ba2e7baa92c6f33d80737b4dbd9d7cd510d9bad521a04828af4fac10678', 'sunrise-ability-background', '曙光市｜異能背景（虛構設定）', ['曙光市異能'], {0,1,2,3,4,6}),
 34: ('620511dae42fc2d536e0ecf3103e1ec5f9b7ac4106d8694070fbf762af17ac38', 'sunrise-ability-institution', '曙光市｜異能分類與監控（虛構制度）', ['異能分類'], {0,4})
}
sha = lambda content: hashlib.sha256(content.encode()).hexdigest()
def build(zip_path):
 with zipfile.ZipFile(zip_path) as archive:
  names = [n for n in archive.namelist() if n.endswith('.json')]
  original = json.loads(archive.read(next(n for n in names if '囚徒' in n)))
  shared = json.loads(archive.read(next(n for n in names if '精靈王' in n)))
 if original['worldbook']['id'] != '5808c2c1-a71c-417e-b07c-23d75d36735e' or original['worldbook']['visibility'] != '公開' or len(original['entries']) != 183:
  raise ValueError('Unexpected export version or visibility')
 packs, mapping = [], []
 for index, (digest, pack_id, name, keywords, allowed) in SOURCES.items():
  entry = original['entries'][index]; content = entry['content']
  expected_category = '角色' if 8 <= index <= 28 or 43 <= index <= 48 or index in REVIEW_NAMES or 76 <= index <= 87 or 91 <= index <= 95 or index == 90 or index in (62,73) else '事件' if index in (29,89,96,97,100,121,122) else '地點' if 49 <= index <= 60 or index in (66,67,88,102,103,105) else '規則' if index in (0, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 63, 64, 138) or 123 <= index <= 135 else '地點'
  if 'PLACEHOLDER' in digest:
   raise ValueError('Review digest placeholder remains')
  if sha(content) != digest or content != shared['entries'][index]['content'] or entry['category'] != expected_category:
   raise ValueError('Source changed; review again')
  starts = [m.start() for m in re.finditer(r'^#{2,3} ' if 43 <= index <= 48 else r'^#### ' if index in (35,36,37,38,39,40,41,42) else r'^#{2,3} ' if index == 138 else r'^## ' if index in (0, 1, 2, 3, 4, 5, 6) else r'^### ', content, re.M)]
  if not starts or starts[0] != 0: starts.insert(0,0)
  spans = adult_spans(index,content) if index in ADULT_ALLOWED else final_spans(index,content) if index in FINAL_ALLOWED else new_spans(index,content) if index in NEW_ALLOWED else late_spans(index,content) if 76 <= index <= 90 else review_spans(index,content) if 61 <= index <= 75 else family_spans(index,content) if 49 <= index <= 60 else list(zip(starts, starts[1:] + [len(content)]))
  entries, review = [], []
  for part, (start,end) in enumerate(spans):
   value = content[start:end].strip(); title = value.splitlines()[0].lstrip('# ').strip()
   kept = part in allowed
   record = {'chapter':part,**({'title':title} if kept else {}),'start':start,'end':end,'sha256':sha(value),'status':'published' if kept else 'deferred'}
   if index in ALLOWED:
    record['review_lane'] = 'public-reference' if kept else 'withheld-author-source'
    record['requires_further_review'] = not kept
   if kept:
    decisions, value = [], value
    value, reconciliation = reconcile_chapter(index, part, value)
    decisions = decisions + reconciliation
    if decisions:
     record['reconciliation'] = decisions
     record['published_sha256'] = sha(value)
    eid = f'sunrise-source-{index}-{part}'; record['entry_id'] = eid
    if index in NAMES:
     title = (INSTITUTION_NAMES[part]+'｜公開職務') if index==26 else NAMES[index]+'｜'+('表面言行' if index>=43 and part==2 else '居住背景' if index==28 else '基礎身份' if part==0 else title)
    recall_keywords = {
     (0,2): ['曙光市警力', '曙光市主要勢力'],
     (0,4): ['血色七月', '覺醒潮', '曙光市歷史'],
     (33,0): ['曙光市異能', '異能來源理論'], (33,2): ['異能覺醒'],
     (33,3): ['異能訓練'], (33,4): ['異能限制'], (33,6): ['異能者登記法', '異能者權益', '異能者歧視'],
     (96,0): ['血色七月統計', '血色七月死傷'], (97,1): ['血色七月影響', '登記法強制實施'],
     (36,0): ['冰系異能', '冰霜領域'], (36,1): ['火系異能', '火焰操控'],
     (36,2): ['雷系異能', '雷電操控'], (36,3): ['水系異能', '水流操控'],
     (36,4): ['土系異能', '土石操控'], (36,5): ['風系異能', '空氣操控'],
     (37,1): ['速度強化'], (37,2): ['防禦強化', '皮膚硬化'],
     (37,3): ['再生能力', '斷肢再生'], (37,4): ['感官強化'],
     (38,0): ['瞬移', '空間系異能'], (38,2): ['次元口袋'],
     (34,0): ['異能分類', '八大主類'], (34,4): ['異能監控等級', '異能者管理局監控']
    }.get((index, part), keywords)
    if index==26: recall_keywords=[INSTITUTION_NAMES[part]]
    recall_keywords=FINAL_KEYWORDS.get((index,part)) or NEW_KEYWORDS.get((index,part),NEW_ALIASES.get(index)) or LATE_KEYWORDS.get((index,part),LATE_ALIASES.get(index)) or REVIEW_KEYWORDS.get((index,part),ALIASES.get(index)) or FAMILY_KEYWORDS.get((index,part),CHAPTER_KEYWORDS.get((index,part),recall_keywords))
    title = FINAL_LABELS.get((index,part)) or NEW_LABELS.get((index,part)) or LATE_LABELS.get((index,part)) or REVIEW_LABELS.get((index,part)) or FAMILY_LABELS.get((index,part), title)
    entries.append({'id':eid,'title':name+'｜'+(keywords[0]+'｜' if 8 <= index <= 28 or 43 <= index <= 48 or index in REVIEW_NAMES else '')+title,'category':'人物資料' if 8 <= index <= 28 or 43 <= index <= 48 or index in REVIEW_NAMES or index==73 else '世界資料','mode':'keyword','keywords':recall_keywords + ({1:['曙光金融大廈','天際商場','凱旋企業總部','司法大廈','曙光國際會議中心'],2:['曙光證券交易所','泰坦科技','晨曦集團','極光製藥','銀河傳媒']} .get(part, []) if index == 1 else []),'content':value})
   review.append(record)
  groups = [(pack_id, name, entries)]
  if index == 0:
   history = [e for e in entries if e['id'] == 'sunrise-source-0-4']
   groups = [(pack_id, name, [e for e in entries if e not in history]),
             ('sunrise-history-summary', '曙光市｜歷史時間線（整合摘要）', history)]
  if index == 49:
   scenario = [e for e in entries if e['id'] == 'sunrise-source-49-3']
   groups = [(pack_id, name, [e for e in entries if e not in scenario]),
             ('sunrise-academy-scenario', '曙光市｜學院劇情方向', scenario)]
  for group_id, group_name, group_entries in groups:
   if not group_entries:
    continue
   if group_id != pack_id:
    for item in group_entries: item["title"] = group_name + "｜" + item["title"].split("｜", 2)[-1]
   existing = next((pack for pack in packs if pack['meta']['id'] == group_id), None)
   if existing:
    existing['entries'].extend(group_entries)
   else:
    packs.append({'schema':'yorubay-worldbook-pack','version':1,'meta':{'id':group_id,'name':group_name,'world':'sunrise-city','classification':'scenario' if group_id.endswith('-scenario') else 'reference' if group_id.endswith('-people') else 'world','author':'班長／肉包','release':'1.1.0','visibility':'public','source':'囚徒的自白原始來源｜失序之城配套採用版（2026-10-11）'},'entries':group_entries})
  mapping.append({'source_index':index,'source_sha256':digest,'source_chars':len(content),'chapters':review})
 return {'packs':packs}, {'source_worldbook_id':original['worldbook']['id'],'shared_content_verified':True,'sources':mapping}
if __name__ == '__main__':
 catalog, mapping = build(sys.argv[1])
 for name, value in [('sunrise-worldbook-library.json',catalog),('sunrise-geography-source-map.json',mapping)]:
  (ROOT/'data'/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
