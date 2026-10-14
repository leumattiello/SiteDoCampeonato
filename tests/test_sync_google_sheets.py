"""Verifica importação da pontuação concedida em folgas (coluna B)."""
import unittest
from scripts.sync_google_sheets import parse_matches


class ByePointsImportTest(unittest.TestCase):
    def test_importa_pontuacao_da_coluna_b(self):
        rows = [
            ['Rodada 1'],
            ['Ana', '1', '', '', 'Bye'],
            ['Bruno', '0', '', '', 'Bye'],
            ['Carlos', '0,5', '', '', 'Bye'],
            ['Dora', '', '', '', 'Bye'],
            ['Eva', '0,25', '', '', 'Bye'],
            ['Joao', '1', '0', 'Maria', 'Finalizado'],
        ]
        imported = parse_matches(rows, '2')
        self.assertEqual([m['byePoints'] for m in imported], [1, 0, 0.5, None, 0.25, None])
        self.assertTrue(all(m['result'] == 'bye' for m in imported[:5]))
        self.assertEqual(imported[-1]['result'], '1-0')
        self.assertEqual(imported[-1]['white'], 'Joao')
        self.assertEqual(imported[-1]['black'], 'Maria')


if __name__ == '__main__':
    unittest.main()
