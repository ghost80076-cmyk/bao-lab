"""Synthetic ZIP regressions; never requires the private author archive in CI."""
import copy
import importlib.util
import json
import pathlib
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location('audit', pathlib.Path(__file__).resolve().parents[1] / 'scripts/audit-world-simulator-general.py')
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class SourceAuditTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = pathlib.Path(self.tmp.name)
        (self.root / 'data').mkdir()
        self.ids = list(audit.BOOKS)
        self.books = {bid: {'worldbook': {'id': bid}, 'entries': [{'content': f'{bid}:{i}'} for i in range(count)]} for bid, count in audit.BOOKS.items()}
        for bid in self.ids:
            self.books[bid]['entries'][0]['content'] = 'adaptable personality'
            self.books[bid]['entries'][32 if bid != self.ids[2] else 33]['content'] = 'shared instruction'
        for bid in self.ids[:2]:
            self.books[bid]['entries'][197]['content'] = 'two-book status template'
        self.books[self.ids[2]]['entries'][64]['content'] = 'unique format'
        self.decisions = []
        for bid, i, count in [(self.ids[0], 32, 3), (self.ids[0], 197, 2), (self.ids[2], 64, 1)]:
            d = {'canonical_source_index': i} if bid == self.ids[0] else {'source_book_id': bid, 'source_index': i}
            d.update(decision_id=f'{bid}:{i}', source_sha256=audit.sha(self.books[bid]['entries'][i]['content']), expected_occurrences=count, route='author-output-format')
            self.decisions.append(d)
        self.write('world-simulator-general-library.json', {'packs': [{'meta': {'id': 'fixture'}, 'entries': [{'id': 'fixture', 'content': 'adapted'}]}]})
        self.original_selected = audit.SELECTED
        self.original_specific = audit.SOURCE_SPECIFIC
        audit.SOURCE_SPECIFIC = {}
        self.addCleanup(setattr, audit, 'SOURCE_SPECIFIC', self.original_specific)
        audit.SELECTED = {0: 'fixture'}
        self.addCleanup(setattr, audit, 'SELECTED', self.original_selected)

    def write(self, name, value):
        (self.root / 'data' / name).write_text(json.dumps(value))

    def run_audit(self):
        self.write('world-simulator-layer-review.json', {'decisions': self.decisions})
        archive = self.root / 'fixture.zip'
        with zipfile.ZipFile(archive, 'w') as z:
            for bid, book in self.books.items():
                z.writestr(bid + '.json', json.dumps(book))
        return audit.audit(archive, self.root)

    def test_common_shifted_and_unique_sources(self):
        result = self.run_audit()
        self.assertEqual(result['adopted_occurrences'], 3)
        self.assertEqual(result['reviewed_unpublished_occurrences'], 6)
        self.assertEqual(result['unique_reviewed_unpublished_sources'], 3)
        self.assertEqual([len(b['reviewed_unpublished_indices']) for b in result['books']], [2, 2, 2])
        self.assertIn(33, result['books'][2]['reviewed_unpublished_indices'])
        for b in result['books']:
            indices = b['adapted_indices'] + b['reviewed_unpublished_indices'] + b['pending_indices']
            self.assertEqual(sorted(indices), list(range(b['source_count'])))

    def test_book_specific_adaptation_and_mutation(self):
        bid = self.ids[1]
        audit.SOURCE_SPECIFIC = {bid: {242: ('fixture', audit.sha(self.books[bid]['entries'][242]['content']))}}
        result = self.run_audit()
        self.assertEqual(result['adopted_occurrences'], 4)
        self.assertEqual([len(b['adapted_indices']) for b in result['books']], [1, 2, 1])
        self.assertIn(242, result['books'][1]['adapted_indices'])
        self.books[bid]['entries'][242]['content'] += ' changed'
        with self.assertRaisesRegex(ValueError, 'book-specific adaptation changed'):
            self.run_audit()

    def test_book_specific_adaptation_cannot_overlap_review(self):
        bid = self.ids[1]
        audit.SOURCE_SPECIFIC = {bid: {197: ('fixture', audit.sha('two-book status template'))}}
        with self.assertRaisesRegex(ValueError, 'Duplicate or overlapping'):
            self.run_audit()

    def test_unique_source_mutation_rejected_without_old_map(self):
        self.books[self.ids[2]]['entries'][64]['content'] += ' changed'
        with self.assertRaisesRegex(ValueError, 'source changed'):
            self.run_audit()

    def test_missing_shared_occurrence_rejected(self):
        self.books[self.ids[1]]['entries'][197]['content'] += ' changed'
        with self.assertRaisesRegex(ValueError, 'occurrence count changed'):
            self.run_audit()

    def test_duplicate_route_rejected(self):
        self.decisions.append(copy.deepcopy(self.decisions[0]))
        with self.assertRaisesRegex(ValueError, 'Duplicate or overlapping'):
            self.run_audit()

    def test_adapted_source_cannot_also_be_reviewed(self):
        d = self.decisions[0]
        d.update(canonical_source_index=0, decision_id=f'{self.ids[0]}:0', source_sha256=audit.sha('adaptable personality'))
        with self.assertRaisesRegex(ValueError, 'Duplicate or overlapping'):
            self.run_audit()

    def test_approved_map_guards_prior_review(self):
        self.write('world-simulator-general-source-map.json', self.run_audit())
        for bid in self.ids[:2]:
            self.books[bid]['entries'][197]['content'] = 'revised template'
        self.decisions[1]['source_sha256'] = audit.sha('revised template')
        with self.assertRaisesRegex(ValueError, 'Reviewed source changed'):
            self.run_audit()


if __name__ == '__main__':
    unittest.main()
