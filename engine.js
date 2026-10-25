/* Moteur du Radar Appart : score « coup de cœur », coûts d'achat, fusion des annonces.
   Partagé entre la page (navigateur) et la relève (Node). Aucune dépendance. */
(function (root) {
  'use strict';

  var PEB_ORDER = ['A++', 'A+', 'A', 'B', 'C', 'D', 'E', 'F', 'G'];
  var PEB_POINTS = { 'A++': 10, 'A+': 10, 'A': 10, 'B': 9, 'C': 7, 'D': 5, 'E': 2, 'F': 1, 'G': 0 };
  var EQUIP = {
    exterieur: { label: 'Extérieur', yes: 'Terrasse ou jardin', no: "Pas d'extérieur" },
    parking: { label: 'Parking', yes: 'Parking ou garage', no: 'Pas de parking' },
    ascenseur: { label: 'Ascenseur', yes: 'Ascenseur', no: 'Pas d’ascenseur' },
    cave: { label: 'Cave', yes: 'Cave', no: 'Pas de cave' }
  };

  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function pebRank(p) { var i = PEB_ORDER.indexOf(String(p || '').toUpperCase()); return i < 0 ? null : i; }

  function ppm(l) { return l && l.price && l.surface ? l.price / l.surface : null; }

  function median(arr) {
    if (!arr.length) return null;
    var a = arr.slice().sort(function (x, y) { return x - y; });
    var m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  /* Prix au m² médian par commune, calculé sur les annonces collectées (hors exemples). */
  function communeStats(listings) {
    var by = {};
    listings.forEach(function (l) {
      if (l.example) return;
      var v = ppm(l); if (!v) return;
      var k = norm(l.commune); (by[k] = by[k] || []).push({ id: l.id, v: v });
    });
    return by;
  }

  function criteriaReady(c) { return !!(c && c.budgetMax); }

  function fmtEur(n) { return Math.round(n).toLocaleString('fr-BE') + ' €'; }

  function score(l, c, stats) {
    c = c || {};
    var reasons = [], deal = [], pts = 0;
    function plus(t) { reasons.push({ t: t, k: '+' }); }
    function minus(t) { reasons.push({ t: t, k: '-' }); }

    // Budget (30)
    if (!c.budgetMax) pts += 15;
    else if (!l.price) pts += 10;
    else {
      var max = c.budgetMax, ideal = c.budgetIdeal && c.budgetIdeal < max ? c.budgetIdeal : max * 0.9;
      if (l.price <= ideal) { pts += 30; plus('Sous ton budget idéal'); }
      else if (l.price <= max) { pts += 30 - 18 * (l.price - ideal) / (max - ideal); plus('Dans ton budget'); }
      else if (l.price <= max * 1.05) { pts += 4; minus('Au-dessus du budget (+' + Math.round((l.price / max - 1) * 100) + ' %)'); }
      else deal.push('Hors budget');
    }

    // Surface (15)
    var smin = c.surfaceMin;
    if (!smin) pts += 8;
    else if (!l.surface) pts += 6;
    else if (l.surface >= smin * 1.25) { pts += 15; plus(l.surface + ' m², spacieux'); }
    else if (l.surface >= smin) pts += 10 + 5 * (l.surface - smin) / (0.25 * smin);
    else if (l.surface >= smin * 0.9) { pts += 5; minus('Un peu petit (' + l.surface + ' m²)'); }
    else deal.push('Trop petit (' + l.surface + ' m²)');

    // Chambres (10)
    var bmin = c.bedroomsMin;
    if (!bmin) pts += 6;
    else if (l.bedrooms == null) pts += 5;
    else if (l.bedrooms >= bmin) { pts += 10; if (l.bedrooms > bmin) plus(l.bedrooms + ' chambres'); }
    else deal.push(l.bedrooms === 0 ? 'Studio' : l.bedrooms + ' chambre' + (l.bedrooms > 1 ? 's' : '') + ' seulement');

    // Commune (10)
    var communes = (c.communes || []).map(norm);
    if (!communes.length) pts += 6;
    else if (communes.indexOf(norm(l.commune)) >= 0) { pts += 10; plus(l.commune); }
    else if (c.communesStrict) deal.push('Hors de tes communes');
    else { pts += 2; minus('Hors de tes communes'); }

    // PEB (10)
    var pr = pebRank(l.peb);
    if (pr == null) pts += 4;
    else {
      pts += PEB_POINTS[PEB_ORDER[pr]];
      var lim = pebRank(c.pebMax);
      if (pr <= 3) plus('PEB ' + PEB_ORDER[pr]);
      else if (lim != null && pr > lim) minus('PEB ' + PEB_ORDER[pr] + ' : rénovation à prévoir');
      else if (pr >= 6) minus('PEB ' + PEB_ORDER[pr]);
    }

    // Équipements (15)
    var eq = c.equip || {}, w = 0, got = 0;
    Object.keys(EQUIP).forEach(function (k) {
      var pref = eq[k]; if (pref !== 'must' && pref !== 'nice') return;
      var v = l[k];
      if (k === 'ascenseur' && l.floor != null && l.floor < 2) return; // inutile au rez ou au 1er
      var wt = pref === 'must' ? 2 : 1; w += wt;
      if (v === true) { got += wt; plus(EQUIP[k].yes); }
      else if (v == null) got += wt / 2;
      else if (pref === 'must') deal.push(EQUIP[k].no);
      else minus(k === 'ascenseur' && l.floor ? 'Pas d’ascenseur (' + l.floor + 'e étage)' : EQUIP[k].no);
    });
    pts += w ? 15 * got / w : 9;

    // Prix au m² comparé aux autres annonces de la commune (10)
    var v = ppm(l), group = stats ? (stats[norm(l.commune)] || []).filter(function (x) { return x.id !== l.id; }) : [];
    var compare = null;
    if (v && group.length >= 4) {
      var med = median(group.map(function (x) { return x.v; }));
      var d = v / med - 1; compare = { median: med, diff: d, n: group.length };
      if (d <= -0.10) { pts += 10; plus(Math.round(-d * 100) + ' % moins cher au m² que les annonces de ' + l.commune); }
      else if (d <= 0) pts += 7;
      else if (d <= 0.10) pts += 5;
      else if (d <= 0.20) { pts += 2; minus(Math.round(d * 100) + ' % plus cher au m² que la moyenne locale'); }
      else minus(Math.round(d * 100) + ' % plus cher au m² que la moyenne locale');
    } else pts += 5;

    var s = Math.max(0, Math.min(100, Math.round(pts)));
    var threshold = c.threshold || 75;
    return {
      score: deal.length ? Math.min(s, 39) : s,
      reasons: reasons,
      dealbreakers: deal,
      compare: compare,
      coupDeCoeur: criteriaReady(c) && !deal.length && s >= threshold
    };
  }

  /* Honoraires notariaux d'un acte de vente (barème légal, hors TVA). */
  function honoraires(price) {
    var tr = [[7500, .0456], [17500, .0285], [30000, .0228], [45495, .0171], [64095, .0114], [250095, .0057], [Infinity, .00057]];
    var prev = 0, h = 0;
    for (var i = 0; i < tr.length && price > prev; i++) {
      h += (Math.min(price, tr[i][0]) - prev) * tr[i][1]; prev = tr[i][0];
    }
    return h;
  }

  /* Estimation du coût d'achat en Wallonie (hors acte de crédit). */
  function costs(price, hpu) {
    if (!price) return null;
    var droits = price * (hpu === false ? 0.125 : 0.03);
    var notaire = honoraires(price) * 1.21 + 2300; // honoraires TVAC + frais administratifs et débours (forfait estimé)
    return { droits: droits, notaire: notaire, total: price + droits + notaire, taux: hpu === false ? 12.5 : 3 };
  }

  function canonUrl(u) {
    try {
      var x = new URL(u);
      return (x.protocol + '//' + x.host.toLowerCase().replace(/^m\./, 'www.') + x.pathname.replace(/\/+$/, '')).toLowerCase();
    } catch (e) { return String(u || '').split(/[?#]/)[0].toLowerCase(); }
  }

  function hash(s) {
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(36);
  }

  var FIELDS = ['title', 'commune', 'postcode', 'surface', 'bedrooms', 'floor', 'peb', 'exterieur', 'parking', 'ascenseur', 'cave', 'charges', 'photo', 'agency', 'publishedAt', 'extrait', 'sale', 'street'];

  function samePlace(a, b) {
    if (norm(a.commune) !== norm(b.commune)) return false;
    if (a.bedrooms != null && b.bedrooms != null && a.bedrooms !== b.bedrooms) return false;
    if (!(a.surface && b.surface) || Math.abs(a.surface - b.surface) > 3) return false;
    if (!(a.price && b.price) || Math.abs(a.price - b.price) / b.price > 0.04) return false;
    return true;
  }

  /* Fusionne les annonces reçues dans la base. Renvoie la base mise à jour et le détail des changements. */
  function merge(existing, incoming, nowISO) {
    var real = existing.filter(function (l) { return !l.example; });
    var list = incoming.length ? real : existing.slice();
    var out = { added: [], priceDrops: [], relisted: [], updated: [], otherSource: [] };

    incoming.forEach(function (inc) {
      if (!inc || !inc.url) return;
      var cu = canonUrl(inc.url), seen = inc.receivedAt || nowISO;
      var byUrl = list.find(function (l) { return (l.sources || []).some(function (s) { return canonUrl(s.url) === cu; }); });
      var target = byUrl || list.find(function (l) { return samePlace(inc, l); });

      if (!target) {
        var n = { id: hash(cu), url: inc.url, source: inc.source, sources: [{ name: inc.source, url: inc.url }],
          price: inc.price || null, priceHistory: inc.price ? [{ d: seen, p: inc.price }] : [],
          firstSeen: seen, lastSeen: seen };
        FIELDS.forEach(function (f) { n[f] = inc[f] != null ? inc[f] : null; });
        list.push(n); out.added.push(n.id); return;
      }

      var crossSource = false;
      if (!byUrl) {
        var sameSource = (target.sources || []).some(function (s) { return s.name === inc.source; });
        target.sources.push({ name: inc.source, url: inc.url });
        if (sameSource) { target.relistedAt = seen; out.relisted.push(target.id); }
        else { crossSource = true; out.otherSource.push(target.id); }
      }
      // Un écart de prix entre deux portails n'est pas une baisse : on ne suit le prix que sur la même annonce.
      if (!crossSource && inc.price && inc.price !== target.price) {
        if (target.price && inc.price < target.price) out.priceDrops.push({ id: target.id, from: target.price, to: inc.price });
        target.priceHistory = (target.priceHistory || []).concat([{ d: seen, p: inc.price }]);
        target.price = inc.price;
      }
      FIELDS.forEach(function (f) { if (target[f] == null && inc[f] != null) target[f] = inc[f]; });
      if (seen > (target.lastSeen || '')) target.lastSeen = seen;
      out.updated.push(target.id);
    });

    list.sort(function (a, b) { return (b.firstSeen || '').localeCompare(a.firstSeen || ''); });
    out.listings = list;
    return out;
  }

  var api = { score: score, costs: costs, honoraires: honoraires, merge: merge, communeStats: communeStats,
    criteriaReady: criteriaReady, norm: norm, pebRank: pebRank, PEB_ORDER: PEB_ORDER, EQUIP: EQUIP, canonUrl: canonUrl, hash: hash, fmtEur: fmtEur };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.RadarEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
