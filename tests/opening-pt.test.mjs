import test from 'node:test';
import assert from 'node:assert/strict';
import {openingNamePt} from '../js/opening-pt.js';
test('traduz famílias frequentes e preserva códigos externos',()=>{
 assert.equal(openingNamePt('Sicilian Defense: Najdorf Variation'),'Defesa Siciliana: Variante Najdorf');
 assert.equal(openingNamePt('Italian Game: Two Knights Defense'),'Abertura Italiana: Defesa dos Dois Cavalos');
 assert.equal(openingNamePt('Ruy Lopez: Exchange Variation'),'Abertura Espanhola: Variante das Trocas');
 assert.equal(openingNamePt('French Defense: Advance Variation'),'Defesa Francesa: Variante do Avanço');
});
test('mantém nomes próprios desconhecidos sem inventar correspondência',()=>{
 assert.equal(openingNamePt('Uncommon Chess Opening: Mystery'),'Uncommon Chess Opening: Mystery');
 assert.equal(openingNamePt(null),null);
});

test('traduz ataque Fegatello e preserva original desconhecido',()=>{assert.equal(openingNamePt('Italian Game: Fried Liver Attack'),'Abertura Italiana: Ataque Fegatello');});
