// package-praise/audio/voice/available.js
// AUTO-DERIVED from pronunciation_manifest.json (status==ok).
// Marks which praise_bo_* have a real, valid .mp3 the expert can listen to.
// 2 ids are intentionally absent (praise_bo_2_2=བརྟན་པོ། / praise_bo_2_3=མགྱོགས་པོ།):
// TeleAI TTS returns a 30ms/peak~14 silence stub for those consonant clusters
// (reproduced across all speech rates + isolated cluster). NOT faked — needs human recording.
module.exports = {
  available: {
    'praise_bo_1_0': 1,
    'praise_bo_1_1': 1,
    'praise_bo_1_2': 1,
    'praise_bo_1_3': 1,
    'praise_bo_1_4': 1,
    'praise_bo_2_0': 1,
    'praise_bo_2_1': 1,
    'praise_bo_2_4': 1,
    'praise_bo_3_0': 1,
    'praise_bo_3_1': 1,
    'praise_bo_3_2': 1,
    'praise_bo_3_3': 1,
    'praise_bo_3_4': 1,
    'praise_bo_4_0': 1,
    'praise_bo_4_1': 1,
    'praise_bo_4_2': 1,
    'praise_bo_4_3': 1,
    'praise_bo_4_4': 1,
    'praise_bo_5_0': 1,
    'praise_bo_5_1': 1,
    'praise_bo_5_2': 1,
    'praise_bo_5_3': 1,
    'praise_bo_5_4': 1,
  },
  missing: ['praise_bo_2_2', 'praise_bo_2_3'],
};
