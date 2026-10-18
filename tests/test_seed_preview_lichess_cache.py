import json
import unittest
from datetime import datetime, timezone
from scripts.seed_preview_lichess_cache import derive_cache, load_public


class SeedCacheTests(unittest.TestCase):
    def test_only_completed_games_with_valid_id_are_copied(self):
        base={'id':'Ab12Cd34', 'status':'mate','winner':'white','moves':'e4 e5'}
        m=lambda url,game,import_status='ok': {'url':url,'lichessGame':game,'lichessImport':{'status':import_status}}
        data={'tournaments':[{'matches':[
            m('https://lichess.org/Ab12Cd34WXYZ',base),
            m('https://lichess.org/Ab12Cd34',dict(base,status='started')),
            m('https://lichess.org/ZZ12Cd34',base),
            m('https://lichess.org/xx22bb11',dict(base,id='xx22bb11',moves='')),
            m('https://lichess.org/QQ12Cd34',dict(base,id='QQ12Cd34'), 'desatualizado'),
        ]}]}
        out=derive_cache(data, datetime(2026,10,17,tzinfo=timezone.utc))
        self.assertEqual(set(out['games']),{'ab12cd34'})
        self.assertEqual(out['version'],1)

    def test_public_file_size_and_schema(self):
        class Resp:
            def __init__(self,b): self.b=b
            def __enter__(self): return self
            def __exit__(self,*args): return None
            def read(self,n): return self.b[:n]
        fake=lambda req, timeout: Resp(json.dumps({'tournaments':[]}).encode())
        self.assertEqual(load_public(opener=fake),{'tournaments':[]})
        with self.assertRaises(ValueError):
            load_public(opener=lambda req,timeout:Resp(json.dumps({'other':1}).encode()))

if __name__ == '__main__': unittest.main()
