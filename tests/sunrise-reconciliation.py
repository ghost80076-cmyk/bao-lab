"""Verify editorial output is reproducible and cannot conceal arbitrary edits."""
import importlib.util
import json
import pathlib
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from sunrise_reconciliation import reconcile_chapter, reconciled_source, digest

spec = importlib.util.spec_from_file_location('audit', ROOT / 'scripts/audit-sunrise-migration.py')
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class Reconciliation(unittest.TestCase):
    def test_published_transformations(self):
        catalog = json.loads((ROOT / 'data/sunrise-worldbook-library.json').read_text())
        entries = {e['id']: e for p in catalog['packs'] for e in p['entries']}
        mapping = json.loads((ROOT / 'data/sunrise-geography-source-map.json').read_text())
        revised = [c for s in mapping['sources'] for c in s['chapters'] if c.get('reconciliation')]
        self.assertEqual(len(revised), 112)
        for chapter in revised:
            value = entries[chapter['entry_id']]['content']
            self.assertEqual(digest(value), chapter['published_sha256'])
            if chapter['sha256'] == chapter['published_sha256']:
                self.assertIn(chapter['entry_id'].split('-')[2], {'76','77','84','85','86','87','88','89'})
        self.assertIn('十五年前', entries['sunrise-source-0-4']['content'])

    def test_normalization_targets_only_the_conflicting_fact(self):
        self.assertEqual(reconciled_source(53, '10年前：第三代崛起\n5年前：「血色七月」事件'),
                         '10年前：第三代崛起\n15年前：「血色七月」事件')
        self.assertEqual(reconciled_source(63, '血色七月後3個月（10年前）'),
                         '血色七月後3個月（相對故事開場為14年9個月前）')
        original = '### 作息時間表\n08:00 工作\n23:00 就寢\n### 禁止行為\n原始禁止事項'
        normalized = reconciled_source(138, original)
        self.assertIn('07:00–12:00', normalized)
        self.assertNotIn('23:00', normalized)
        self.assertTrue(normalized.endswith('原始禁止事項'))
        self.assertEqual(reconciled_source(159, 'AMA-2017-SSS-AB-001'), 'AMA-2017-SSS-AB-001')
        self.assertEqual(reconcile_chapter(8, 0, '未改動角色資料'), ('未改動角色資料', []))

    def test_audit_rejects_arbitrary_edits_even_with_matching_output_hash(self):
        # Tiny export fixture preserves the real public source contract without shipping the ZIP.
        import zipfile
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            (root / 'data').mkdir()
            content = '**執法機關**\n- 曙光市警局（12,000 警力）'
            revised, decisions = reconcile_chapter(0, 2, content)
            chapter = {'chapter':2, 'start':0, 'end':len(content), 'sha256':digest(content),
                       'status':'published', 'entry_id':'test', 'reconciliation':decisions,
                       'published_sha256':digest(revised)}
            mapping = {'source_worldbook_id':'fixture', 'sources':[{'source_index':0,
                       'source_sha256':digest(content), 'source_chars':len(content), 'chapters':[chapter]}]}
            catalog = {'packs':[{'entries':[{'id':'test', 'content':revised}]}]}
            export = root / 'fixture.zip'
            with zipfile.ZipFile(export,'w') as z:
                z.writestr('囚徒.json', json.dumps({'worldbook':{'id':'fixture','visibility':'公開'},
                           'entries':[{'category':'規則','content':content}] + [{'category':'規則','content':'未發布'}] * 182}))
            def save():
                for name,value in [('sunrise-geography-source-map',mapping),('sunrise-worldbook-library',catalog)]:
                    (root/'data'/f'{name}.json').write_text(json.dumps(value))
            save()
            saved_root = audit.ROOT
            try:
                audit.ROOT = root
                self.assertEqual(audit.audit(export)['summary']['published_chapters'],1)
                catalog['packs'][0]['entries'][0]['content'] = revised + '\n捏造資訊'
                chapter['published_sha256'] = digest(catalog['packs'][0]['entries'][0]['content'])
                save()
                with self.assertRaisesRegex(ValueError, 'Invalid reconciliation'):
                    audit.audit(export)
            finally:
                audit.ROOT = saved_root


if __name__ == '__main__':
    unittest.main()
