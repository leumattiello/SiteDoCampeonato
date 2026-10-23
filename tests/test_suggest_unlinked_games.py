import unittest
from contextlib import redirect_stdout
import io
from datetime import datetime, timezone
from scripts.suggest_unlinked_games import candidate_matches, verified_id, result_of

NOW=datetime(2026,10,20,tzinfo=timezone.utc)
def payload():
    return {"tournaments":[{"id":"atual","active":True,"matches":[
      {"id":"a","round":2,"white":"Ana","black":"Bia","status":"Em andamento","result":None,"url":None,"start":"2026-10-10"},
      {"id":"b","round":1,"white":"Ana","black":"Carol","status":"Finalizado","result":"1-0","url":"https://lichess.org/LMNOPQRS","start":"2026-10-01"}]}],
      "players":[{"name":n,"lichess":uid,"lichessValidation":{"status":"valido","id":uid.lower()}} for n,uid in [("Ana","ana123"),("Bia","bia123"),("Carol","carol123")]]}
def game(id="abcdefgh",white="ana123",black="bia123",days=1,perf="correspondence",status="started"):
    return {"id":id,"players":{"white":{"user":{"id":white}},"black":{"user":{"id":black}}},
     "daysPerTurn":days,"perf":perf,"status":status,"createdAt":int(datetime(2026,10,10,tzinfo=timezone.utc).timestamp()*1000)}
class SuggestionsTest(unittest.TestCase):
    def test_verified_players_and_exact_colors(self):
        p=payload()
        x=candidate_matches(p,lookup=lambda nick,since:[game()],now=NOW)
        self.assertEqual(len(x["candidates"]),1)
        self.assertEqual(x["candidates"][0]["matchId"],"a")
        self.assertEqual(x["candidates"][0]["url"],"https://lichess.org/abcdefgh")
        self.assertIsNone(p["tournaments"][0]["matches"][0]["url"])
    def test_ignores_wrong_colors_and_linked(self):
        p=payload()
        x=candidate_matches(p,lookup=lambda nick,since:[game(white="bia123",black="ana123"),game(id="LMNOPQRS")],now=NOW)
        self.assertEqual(x["candidates"],[])
    def test_requires_correspondence_and_correct_time(self):
        for change in [{"perf":"blitz"},{"daysPerTurn":3},{"status":"created"}]:
            p=payload();g=game();g.update(change)
            self.assertEqual(candidate_matches(p,lookup=lambda nick,since:[g],now=NOW)["candidates"],[])
    def test_unverified_players_not_linked(self):
        p=payload();p["players"][1]["lichessValidation"]["status"]="indisponivel"
        self.assertEqual(candidate_matches(p,lookup=lambda nick,since:[game()],now=NOW)["candidates"],[])
    def test_missing_reference_date_safe(self):
        p=payload()
        for m in p["tournaments"][0]["matches"]:m["start"]=None
        self.assertEqual(candidate_matches(p,lookup=lambda n,s:[],now=NOW)["status"],"sem_referencia_de_inicio")
    def test_results_conflict_rejected(self):
        p=payload();p["tournaments"][0]["matches"][0]["result"]="1-0"
        self.assertEqual(candidate_matches(p,lookup=lambda n,s:[game()],now=NOW)["candidates"],[])
    def test_pair_queries_both_profiles_and_exact_opponents(self):
        calls=[]
        def lookup(nick,since,vs=None):
            calls.append((nick,vs))
            return [game()] if nick=='bia123' else []
        x=candidate_matches(payload(),lookup=lookup,now=NOW)
        self.assertIn(('ana123','bia123'),calls)
        self.assertIn(('bia123','ana123'),calls)
        self.assertEqual(len(x['candidates']),1)
    def test_hourly_budget_and_rotation_limits_requests(self):
        p = payload()
        p["tournaments"][0]["matches"]=[{"id":str(i),"round":i+1,"white":"Ana","black":f"P{i}",
            "status":"Jogador em outra partida","url":None,"result":None,"start":"2026-10-10"} for i in range(6)]
        p["players"] += [{"name":f"P{i}","lichess":f"user{i}","lichessValidation":{"status":"valido","id":f"user{i}"}} for i in range(6)]
        calls=[]
        def lookup(nick,since,vs=None):
            calls.append((nick,vs))
            return []
        with redirect_stdout(io.StringIO()):
            out=candidate_matches(p,lookup=lookup,now=NOW)
            later=candidate_matches(p,lookup=lookup,now=NOW.replace(hour=NOW.hour+1))
        self.assertLessEqual(out["queries"],4)
        self.assertEqual(out["status"],"parcial")
        self.assertEqual(later["status"],"parcial")
        self.assertNotEqual(calls[:4],calls[4:8])

    def test_verified_id(self):
        self.assertEqual(verified_id(payload()["players"][0]),"ana123")
        self.assertIsNone(verified_id({"name":"x","lichess":"abc","lichessValidation":{"status":"valido","id":"wrong"}}))
    def test_results(self):
        self.assertEqual(result_of({"status":"mate","winner":"white"}),"1-0")
        self.assertIsNone(result_of({"status":"started"}))
if __name__=="__main__":unittest.main()
