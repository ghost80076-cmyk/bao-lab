const fs = require('node:fs');

const required = [
  'policies.html',
  'terms.html',
  'privacy.html',
  'age-content-policy.html',
  'lights-refund-policy.html',
  'creator-policy.html',
  'css/policy.css'
];

for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`Missing policy center file: ${file}`);
}

const index = fs.readFileSync('index.html', 'utf8');
for (const href of ['terms.html','privacy.html','age-content-policy.html','lights-refund-policy.html','creator-policy.html']) {
  if (!index.includes(`href="${href}"`)) throw new Error(`Homepage footer is missing ${href}`);
}

const account = fs.readFileSync('account.html', 'utf8');
if (!account.includes('購買前查看燈火與退款政策')) throw new Error('Account purchase area does not surface the lights/refund policy.');

const terms = fs.readFileSync('terms.html', 'utf8');
if (!terms.includes('AI 互動故事與角色扮演工具')) throw new Error('Service terms lost the YoruBay service definition.');
if (!terms.includes('自備 API') || !terms.includes('燈火')) throw new Error('Service terms must cover both BYOK and YoruBay Lights.');

const privacy = fs.readFileSync('privacy.html', 'utf8');
if (!privacy.includes('Local-first')) throw new Error('Privacy policy must preserve the Local-first commitment.');
if (!privacy.includes('夜灣帳號資料') || !privacy.includes('使用夜灣燈火時的資料')) throw new Error('Privacy policy must disclose account and hosted-model processing.');
if (!privacy.includes('https://www.googleapis.com/auth/drive.appdata')) throw new Error('Privacy policy must preserve the Google Drive appdata disclosure.');

const age = fs.readFileSync('age-content-policy.html', 'utf8');
if (!age.includes('成人向作品、成人 MOD') || !age.includes('預設')) throw new Error('Age policy must state that adult content is opt-in/hidden by default.');
if (!age.includes('已滿 18 歲')) throw new Error('Age policy must state the 18+ adult-content requirement.');
if (!age.includes('涉及未成年人的性內容：零容忍')) throw new Error('Age policy must preserve the minors sexual-content prohibition.');

const lights = fs.readFileSync('lights-refund-policy.html', 'utf8');
if (!lights.includes('不可在使用者間轉讓、交易或兌換現金')) throw new Error('Lights policy must define transfer/cash-out limits.');
if (!lights.includes('不以本政策預先排除消費者依法享有')) throw new Error('Lights policy must preserve mandatory consumer rights.');
if (!lights.includes('事前清楚告知並取得消費者同意')) throw new Error('Lights policy must not claim a blanket digital-service cooling-off exception.');

const creator = fs.readFileSync('creator-policy.html', 'utf8');
if (!creator.includes('作者保留作品')) throw new Error('Creator policy must preserve creator ownership.');
if (!creator.includes('不代收、保管、分潤或抽取作者外部支持款項')) throw new Error('Creator policy must preserve direct-to-author support.');

console.log('PASS: YoruBay policy center contract is present and linked.');
