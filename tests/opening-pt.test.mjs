import test from 'node:test';
import assert from 'node:assert/strict';
import {openingNamePt} from '../js/opening-pt.js';
test('traduz famílias frequentes e preserva códigos externos',()=>{
 assert.equal(openingNamePt('Sicilian Defense: Najdorf Variation'),'Defesa Siciliana: Najdorf Variante');
 assert.equal(openingNamePt('Italian Game: Two Knights Defense'),'Abertura Italiana: Dois Cavalos Defesa');
 assert.equal(openingNamePt('Ruy Lopez: Exchange Variation'),'Abertura Espanhola: Trocas Variante');
 assert.equal(openingNamePt('French Defense: Advance Variation'),'Defesa Francesa: Avanço Variante');
});
test('mantém nomes próprios desconhecidos sem inventar correspondência',()=>{
 assert.equal(openingNamePt('Uncommon Chess Opening: Mystery'),'Uncommon Chess Opening: Mystery');
 assert.equal(openingNamePt(null),null);
});
