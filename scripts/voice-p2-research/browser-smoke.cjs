'use strict';

const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {chromium, firefox, webkit} = require('@playwright/test');

const engine = process.argv[2] || 'chromium';
const driver = {chromium, firefox, webkit}[engine];
const origin = 'http://127.0.0.1:8787';
const reference = 'hello world this is a local voice test';
const directory = process.env.RUNNER_TEMP;
const normalize = text => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function wordErrorRate(text) {
  const expected = reference.split(' ');
  const actual = normalize(text).split(' ').filter(Boolean);
  let row = actual.map((_, i) => i+1);
  row.unshift(0);
  for (const word of expected) {
    const next = [row[0]+1];
    for (const [i, token] of actual.entries()) {
      next.push(Math.min(next[i]+1, row[i+1]+1, row[i]+Number(word !== token)));
    }
    row = next;
  }
  return row.at(-1)/expected.length;
}

async function setupPage(context) {
  const page = await context.newPage();
  await page.goto(origin);
  await page.locator('#language').selectOption('english');
  await page.locator('#audio').setInputFiles(path.join(directory, 'voice-p2-test.wav'));
  return page;
}

async function infer(page, filename) {
  const file = path.join(directory, filename);
  await page.locator('#audio').setInputFiles(file);
  await page.locator('#start').click();
  await page.locator('#start:enabled').waitFor({timeout:310000});
  assert.match(await page.textContent('#status'), /Complete/);
  const result = JSON.parse(await page.textContent('#output'));
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-']);
  assert.equal(result.profile, 'whisper-tiny-mixed');
  assert.equal(result.frames, raw.length/4);
  assert.equal(result.pcmSha256, createHash('sha256').update(raw).digest('hex'));
  assert.ok(Number.isFinite(result.rtf) && result.rtf >= 0);
  return {...result, wer:wordErrorRate(result.text)};
}

async function main() {
  const browser = await driver.launch({headless:true});
  const blocked = [];
  try {
    const context = await browser.newContext({serviceWorkers:'block'});
    await context.route('**/*', route => {
      const req = route.request();
      if (new URL(req.url()).origin === origin && req.method() === 'GET') return route.continue();
      blocked.push({url:req.url(), method:req.method()});
      return route.abort();
    });
    const page = await setupPage(context);
    const other = await setupPage(context);
    await other.locator('#start').click();
    await other.locator('#stop').click();
    const baseline = await infer(page, 'voice-p2-test.wav');
    assert.match(await other.textContent('#status'), /Cancelled/);
    assert.equal(await other.textContent('#output'), '');
    // Navigate away with a pending job. The remaining tab must still finish.
    await other.locator('#start').click();
    await other.goto('about:blank');
    const padded = await infer(page, 'voice-p2-padded.wav');
    await context.setOffline(true);
    await page.locator('#start').click();
    await page.locator('#start:enabled').waitFor({timeout:310000});
    const offlineStatus = await page.textContent('#status');
    assert.doesNotMatch(offlineStatus, /Complete/);
    assert.equal(await page.textContent('#output'), '');
    const report = {engine, version:browser.version(), reference, baseline, padded, blocked, offlineStatus};
    fs.writeFileSync(path.join(directory, 'voice-p2-'+engine+'-report.json'), JSON.stringify(report,null,2));
    console.log(JSON.stringify(report));
    assert.deepEqual(blocked, []);
    assert.equal(normalize(padded.text), reference, 'Padded fixture must preserve the full transcript');
    assert.equal(normalize(baseline.text), reference, 'Unpadded fixture must preserve the full transcript');
  } finally {
    await browser.close();
  }
}

main().catch(error => {console.error(error); process.exitCode=1;});
