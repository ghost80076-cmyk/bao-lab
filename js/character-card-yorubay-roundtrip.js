/* Prefer lossless YoruBay payload when a Character Card V2 was exported by YoruBay. */
(() => {
  'use strict';
  const importer = window.BAOCharacterImport;
  if (!importer || importer.__yorubayRoundtrip) return;
  const originalPrepareFile = importer.prepareFile.bind(importer);
  importer.prepareFile = async file => {
    const result = await originalPrepareFile(file);
    const embedded = result?.character?.import_metadata?.preserved_source?.data?.extensions?.yorubay?.character;
    if (!embedded || typeof embedded !== 'object' || Array.isArray(embedded)) return result;
    const character = importer.inspect(JSON.parse(JSON.stringify(embedded)));
    character.import_metadata = {
      ...(character.import_metadata || {}),
      source_format: 'yorubay-character-card-v2',
      source_origin: result.origin || 'PNG metadata',
      roundtrip_restored: true
    };
    return {
      ...result,
      converted: false,
      format: 'YoruBay Character Card PNG',
      character,
      report: {
        mapped: ['夜灣完整角色資料', 'Character Card V2 相容資料'],
        preserved: ['Gameplay UI、世界／NPC 規則與夜灣擴充欄位'],
        unavailable: []
      }
    };
  };
  importer.__yorubayRoundtrip = true;
})();
