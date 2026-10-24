'use strict';
module.exports = {
  density: ['concise', 'standard', 'rich'], paragraphs: ['2-3', '3-5', '4-7'],
  innerThoughts: ['none', 'restrained', 'clear'], physicalContinuity: [true],
  intimacyDetailMod: [true], intimacy: ['fade', 'emotion', 'continuous'], matureDrama: ['mature'],
  characterAgency: ['reserved', 'natural', 'active', 'autonomous'], responseLength: ['short', 'medium', 'long'],
  pacing: ['slow', 'balanced', 'brisk'], sceneFocus: ['protect'], storyExpectation: ['AUDIT_EXPECTATION'],
  dialogueBalance: ['dialogue', 'balanced', 'description'], customInstructions: [[{ text: 'AUDIT_CUSTOM', enabled: true }]],
  stylePacks: ['female_kfilm', 'male_visual', 'male_blunt', 'cinematic', 'action_realism', 'natural', 'tender', 'suspense', 'literary', 'realist_subtext'].map(x => [x]),
  storyExtras: ['daily', 'surroundings', 'tension', 'threads'].map(x => [x])
};
