'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const communityRoot = path.join(root, 'data', 'characters', 'community');

function listJson(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listJson(full));
    else if (entry.isFile() && entry.name.endsWith('.json') && !entry.name.endsWith('.regex.json')) out.push(full);
  }
  return out.sort();
}

function openYBMarkers(text) {
  return [...new Set(String(text || '').match(/【YB:[^】]+】/g) || [])];
}

function pairedSample(marker) {
  const inner = marker.slice(1, -1);
  return `${marker}\nTEST\n【/${inner}】`;
}

const cards = listJson(communityRoot);
assert.equal(cards.length, 37, 'expected all 36 formal community cards');

const sidecars = [];
const failures = [];
const noRegexNative = [];
const regexCards = [];
const olderTextFirst = [];

for (const file of cards) {
  const card = JSON.parse(fs.readFileSync(file, 'utf8'));
  const greeting = String(card.content?.greeting || '');
  const modelAndDisplay = [
    greeting,
    card.content?.system_prompt || '',
    card.content?.world || '',
    card.content?.lore || '',
    card.content?.author_instructions || '',
    ...(card.content?.dynamic_prompts || []).map(x => x.text || '')
  ].join('\n');

  const markers = openYBMarkers(modelAndDisplay);
  const sidecar = file.replace(/\.json$/, '.regex.json');
  const hasSidecar = fs.existsSync(sidecar);
  const rel = path.relative(root, file).replaceAll('\\', '/');

  const legacyGreeting =
    /<\/?(?:div|span|style|table|section|button|details|summary)\b/i.test(greeting) ||
    /<\/?hc-[^>]*>/i.test(greeting) ||
    /\\<\s*(?:div|span|style|hc-|section|table|details|summary)/i.test(greeting);

  if (legacyGreeting) failures.push(`${card.meta.id}: greeting still contains legacy/raw HTML`);

  if (!hasSidecar) {
    if (markers.length) failures.push(`${card.meta.id}: YB display markers exist but no .regex.json sidecar`);
    else noRegexNative.push(card.meta.id);
    if (!card.gameplay?.ui_schema) olderTextFirst.push(card.meta.id);
    continue;
  }

  sidecars.push(sidecar);
  regexCards.push(card.meta.id);
  const regex = JSON.parse(fs.readFileSync(sidecar, 'utf8'));
  if (regex.characterId !== card.meta.id) failures.push(`${card.meta.id}: sidecar characterId mismatch`);
  const rules = Array.isArray(regex.regex_scripts) ? regex.regex_scripts : [];
  if (!rules.length) failures.push(`${card.meta.id}: sidecar has no regex_scripts`);

  for (const rule of rules) {
    let compiled = null;
    try {
      compiled = new RegExp(rule.findRegex, rule.flags || 'g');
    } catch (error) {
      failures.push(`${card.meta.id}: ${rule.scriptName || 'unnamed'} does not compile: ${error.message}`);
      continue;
    }
    const replacement = String(rule.replaceString || '');
    if (/<\s*script\b|\bon[a-z]+\s*=|javascript\s*:/i.test(replacement)) {
      failures.push(`${card.meta.id}: ${rule.scriptName || 'unnamed'} depends on script/inline handler, but official sidecars auto-bind with scripts disabled`);
    }
    if (/https?:\/\//i.test(replacement)) {
      failures.push(`${card.meta.id}: ${rule.scriptName || 'unnamed'} depends on an external asset`);
    }
    void compiled;
  }

  for (const marker of markers) {
    const sample = pairedSample(marker);
    const covered = rules.some(rule => {
      try { return new RegExp(rule.findRegex, rule.flags || 'g').test(sample); }
      catch { return false; }
    });
    if (!covered) failures.push(`${card.meta.id}: display marker ${marker} has no matching sidecar rule`);
  }

  const greetingHasMarker = openYBMarkers(greeting).length > 0;
  if (greetingHasMarker) {
    const matchesGreeting = rules.some(rule => {
      try { return new RegExp(rule.findRegex, rule.flags || 'g').test(greeting); }
      catch { return false; }
    });
    if (!matchesGreeting) failures.push(`${card.meta.id}: real greeting is not matched by any sidecar rule`);
  }

  void rel;
}

assert.equal(sidecars.length, 15, 'expected 15 official regex sidecars');
assert.deepEqual(failures, [], 'community UI/Regex audit must stay clean');

console.log(JSON.stringify({
  cards: cards.length,
  regexCards: regexCards.length,
  nativeWithoutRegex: noRegexNative.length,
  olderTextFirst,
  status: 'PASS'
}, null, 2));
