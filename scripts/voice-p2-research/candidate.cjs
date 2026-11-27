'use strict';
const manifest = require('./assets.json');

// Both Tiny profiles use the same immutable upstream snapshot and local directory.
function candidateFor(profile) {
  const mixed = profile === 'whisper-tiny-mixed';
  const model = mixed ? 'whisper-tiny' : profile;
  if (!Object.hasOwn(manifest.models, model)) throw Error('Unknown research profile: ' + profile);
  const {source, revision, files} = manifest.models[model];
  const selected = {...files};
  if (mixed) {
    delete selected['onnx/decoder_model_merged_quantized.onnx'];
    Object.assign(selected, manifest.tinyFloatDecoder);
  }
  return {model, source, revision, files:selected, dtype:mixed ? {encoder_model:'q8', decoder_model_merged:'fp32'} : 'q8'};
}

module.exports = {candidateFor};
