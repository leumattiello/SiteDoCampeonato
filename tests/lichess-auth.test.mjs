import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {LichessAuth,loginAllowedAt,authorizationUrl,LICHESS_SCOPE} from '../js/lichess-auth.js';
const url='https://leumattiello.github.io/SiteDoCampeonato/';
const setup=({search='',time=100000,fetcher=async()=>({ok:false})}={})=>{
 const data=new Map(),calls=[],loc=new URL(url+'?'+search);
 const location={origin:loc.origin,protocol:loc.protocol,hostname:loc.hostname,pathname:loc.pathname,search:loc.search,hash:'#inicio'};
 const auth=new LichessAuth({location,history:{replaceState(...x){calls.push(['history',...x]);}},
 storage:{setItem(k,v){data.set(k,v)},getItem(k){return data.get(k)},removeItem(k){data.delete(k)}},
 cryptoProvider:webcrypto,fetcher:(...a)=>{calls.push(a);return fetcher(...a)},
 navigate:x=>calls.push(['navigate',x]),now:()=>time});
 return {auth,location,data,calls};
};
test('acesso anônimo: somente produção e localhost disponibilizam login',()=>{
 assert.equal(loginAllowedAt(new URL(url)),true);
 assert.equal(loginAllowedAt(new URL('https://raw.githack.com/leumattiello/SiteDoCampeonato/abc/index.html')),false);
 assert.equal(loginAllowedAt(new URL('http://localhost:8000/index.html')),true);
 assert.equal(loginAllowedAt(new URL('https://leumattiello.github.io/outro/')),false);
});
test('PKCE S256 gera estado/verifier únicos e solicita só challenge:write',async()=>{
 const {auth,calls,data}=setup();assert.equal(auth.available,true);
 assert.equal((await auth.beginLogin()).status,'redirecting');
 const u=new URL(calls.find(c=>c[0]==='navigate')[1]);
 assert.equal(u.origin,'https://lichess.org');assert.equal(u.pathname,'/oauth');
 assert.equal(u.searchParams.get('scope'),LICHESS_SCOPE);
 assert.equal(u.searchParams.get('code_challenge_method'),'S256');
 assert.equal(u.searchParams.get('redirect_uri'),url);
 const pending=JSON.parse([...data.values()][0]);assert.equal(pending.verifier.length,43);
 assert.notEqual(pending.verifier,u.searchParams.get('code_challenge'));
 assert.equal(pending.state,u.searchParams.get('state'));
});
test('state inválido e expirado nunca trocam código por token',async()=>{
 const c=setup();await c.auth.beginLogin();
 c.location.search='?code=abcdefg&state=invalido';
 assert.equal((await c.auth.completeRedirect()).status,'invalid-state');
 assert.equal(c.calls.filter(x=>x[0]==='https://lichess.org/api/token').length,0);
 assert.equal(c.data.size,0);
 const d=setup();await d.auth.beginLogin();
 d.location.search='?code=abcdefg&state='+JSON.parse([...d.data.values()][0]).state;
 d.data.set([...d.data.keys()][0],JSON.stringify({...JSON.parse([...d.data.values()][0]),createdAt:-9999999}));
 assert.equal((await d.auth.completeRedirect()).status,'invalid-state');
});
test('callback válido autentica conta e revoga token ao sair sem persisti-lo',async()=>{
 let seen=[];
 const c=setup({fetcher:async(u,o)=>{seen.push([u,o]);return {ok:true,json:async()=>u.endsWith('/api/token')?{access_token:'abcdefghijklmnop'}:{username:'Humberto_M'}};}});
 await c.auth.beginLogin();const pending=JSON.parse([...c.data.values()][0]);
 c.location.search='?code=abcdefg&state='+pending.state;
 assert.equal((await c.auth.completeRedirect()).status,'connected');
 assert.equal(c.auth.account.username,'Humberto_M');
 assert.equal(c.data.size,0);
 assert.equal(c.calls.find(x=>x[0]==='history')[3],'/SiteDoCampeonato/#inicio');
 assert.equal(seen[0][1].body.includes(pending.verifier),true);
 assert.equal(seen[1][1].headers.Authorization,'Bearer abcdefghijklmnop');
 const result=await c.auth.logout();
 assert.equal(result.status,'disconnected');assert.equal(c.auth.connected,false);
 assert.equal(seen[2][1].method,'DELETE');
});
test('falha em /api/account revoga o token e não autentica',async()=>{
 let revoked=false;
 const c=setup({fetcher:async(u,o)=>{
  if(o.method==='DELETE'){revoked=true;return {ok:true};}
  if(u.endsWith('/api/token'))return {ok:true,json:async()=>({access_token:'abcdefghijklmnop'})};
  return {ok:false};
 }});
 await c.auth.beginLogin();const pending=JSON.parse([...c.data.values()][0]);
 c.location.search='?code=abcdefg&state='+pending.state;
 assert.equal((await c.auth.completeRedirect()).status,'error');assert.equal(revoked,true);assert.equal(c.auth.connected,false);
});
