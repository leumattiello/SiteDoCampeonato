import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../css/styles.css',import.meta.url),'utf8');
test('Regras possui destino único, menu com pergaminho e navegação por hash',()=>{
 assert.equal((html.match(/id="view-regras"/g)||[]).length,1);
 assert.match(html,/data-view="regras"[^>]*><span class="nav-icon"[^>]*>📜/);
 assert.match(app,/'regras'\]\.includes\(name\)/);
});
test('Regras distinguem um dia por lance de um lance diário e especificam Schuring',()=>{
 assert.match(html,/1 dia por lance/);
 assert.match(html,/Não<\/strong> significa que seja permitido fazer apenas um lance por dia/);
 assert.match(html,/sistema Schuring/);
 assert.match(html,/até uma rodada à frente/);
});
test('Regras descrevem Bye variável, cinco desempates e posições compartilhadas',()=>{
 for(const x of ['Bye','Confronto direto','Vitórias efetivas','Sonneborn–Berger','Koya','Partidas com as pretas','compartilham a mesma posição'])assert.ok(html.includes(x),x);
});
test('Jogo limpo diferencia observação, comentários alheios e análise após o encerramento',()=>{
 for(const x of ['Assistir é permitido e incentivado','não comente, publique nem compartilhe análises','incentivado','engines, IA','permite livros e exploradores de aberturas'])assert.ok(html.includes(x),x);
 assert.match(html,/https:\/\/lichess\.org\/page\/fair-play/);
 assert.match(html,/https:\/\/lichess\.org\/terms-of-service/);
});
test('HTML identifica capítulos e layout é responsivo para oito destinos',()=>{
 for(const slug of ['partidas','rodadas','pontos','desempates','conduta','duvidas'])assert.ok(html.includes('id="regra-'+slug+'"'));
 assert.match(css,/\.primary-nav\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
});
