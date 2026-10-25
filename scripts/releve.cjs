#!/usr/bin/env node
/* Relève : fusionne les annonces extraites des alertes e-mail dans data/listings.json.
   Usage : node scripts/releve.cjs --incoming incoming.json [--criteria criteria.json] [--notes notes.json] [--now ISO]
   Écrit data/listings.json et data/meta.json, puis imprime un résumé JSON sur la sortie standard. */
'use strict';
const fs = require('fs');
const path = require('path');
const E = require('../engine.js');

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];

const root = path.join(__dirname, '..');
const read = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return d; } };
const now = args.now || new Date().toISOString();

const db = read(path.join(root, 'data/listings.json'), { listings: [] });
const incoming = args.incoming ? read(args.incoming, []) : [];
const criteria = args.criteria ? read(args.criteria, {}) : {};
const notes = args.notes ? read(args.notes, []) : [];

if (!Array.isArray(incoming)) { console.error('incoming doit être un tableau'); process.exit(1); }

const res = E.merge(db.listings || [], incoming, now);

// Purge des annonces plus vues depuis 150 jours
const cutoff = new Date(Date.parse(now) - 150 * 864e5).toISOString();
const listings = res.listings.filter(l => l.example || (l.lastSeen || l.firstSeen) >= cutoff);

fs.writeFileSync(path.join(root, 'data/listings.json'), JSON.stringify({ updatedAt: now, listings }, null, 1) + '\n');

const stats = E.communeStats(listings);
const byId = Object.fromEntries(listings.map(l => [l.id, l]));
const describe = id => {
  const l = byId[id]; if (!l) return null;
  const s = E.score(l, criteria, stats);
  return { id, title: l.title, commune: l.commune, price: l.price, surface: l.surface, bedrooms: l.bedrooms,
    source: l.source, url: l.url, score: s.score, coupDeCoeur: s.coupDeCoeur, raisons: s.reasons.map(r => r.k + ' ' + r.t) };
};

const bySource = {};
listings.filter(l => !l.example).forEach(l => (l.sources || []).forEach(s => { bySource[s.name] = (bySource[s.name] || 0) + 1; }));

const meta = {
  lastRun: now,
  added: res.added.length,
  priceDrops: res.priceDrops.length,
  total: listings.filter(l => !l.example).length,
  sources: bySource,
  notes,
  schedule: 'Relève vers 7 h 40 et 18 h 40'
};
fs.writeFileSync(path.join(root, 'data/meta.json'), JSON.stringify(meta, null, 1) + '\n');

const added = res.added.map(describe).filter(Boolean);
console.log(JSON.stringify({
  added,
  coupsDeCoeur: added.filter(a => a.coupDeCoeur),
  priceDrops: res.priceDrops.map(p => Object.assign(describe(p.id) || {}, { from: p.from, to: p.to })),
  relisted: res.relisted.map(describe).filter(Boolean),
  alsoOn: res.otherSource,
  total: meta.total,
  criteriaReady: E.criteriaReady(criteria)
}, null, 1));
