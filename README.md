# Radar Appart

Page personnelle qui rassemble des annonces d'appartements à vendre, reçues par alertes e-mail des portails immobiliers, et les trie par date de mise en ligne.

- `index.html` : la page (aucune dépendance, publiée par GitHub Pages)
- `engine.js` : score, coûts d'achat et fusion des annonces, partagé par la page et la relève
- `scripts/releve.cjs` : fusion des annonces extraites dans `data/listings.json`
- `data/listings.json`, `data/meta.json` : annonces et état de la dernière relève, mis à jour automatiquement
- `data/criteria.json` : critères de recherche, utilisés par la relève et par défaut sur la page

Les annonces et les photos appartiennent aux sites d'origine ; chaque carte renvoie vers l'annonce complète.
