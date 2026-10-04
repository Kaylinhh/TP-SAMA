# Révision termes médicaux

Petite appli web pour réviser la terminologie médicale du Titre Pro SAMA : préfixes, racines, suffixes et vocabulaire.

- **QCM** : 4 propositions, les mauvaises réponses sont tirées de la même catégorie et jamais d'un terme de sens équivalent (Macro- et Méga- ne sont pas opposés l'un à l'autre).
- **Flashcards** : on réfléchit, on retourne la carte, on dit soi-même « su » ou « pas su ».
- **Dans les deux sens** : terme → sens et sens → terme.
- **Répétition espacée** légère (boîtes de Leitner) : les cartes ratées reviennent plus souvent, une erreur revient aussi plus loin dans la même session.
- **Mode « seulement mes erreurs »**.
- Progression sauvegardée en `localStorage`, rien côté serveur, pas de compte.
- Mobile d'abord, thème sombre automatique, raccourcis clavier sur ordinateur (`1`–`4`, `Entrée`, `Espace`, `←`/`→`).

HTML/CSS/JavaScript vanilla (modules ES), aucune dépendance, aucun build.

## Lancer en local

Les données sont chargées avec `fetch`, donc il faut un petit serveur (ouvrir `index.html` directement ne marche pas) :

```bash
python3 -m http.server 8000
# puis http://localhost:8000
```

ou `npx serve .`

## Déployer sur GitHub Pages

1. Pousser le dossier sur un repo GitHub.
2. *Settings → Pages → Build and deployment* : Source « Deploy from a branch », branche `main`, dossier `/ (root)`.
3. L'appli est en ligne sur `https://<pseudo>.github.io/<nom-du-repo>/`.

## Structure

```
index.html
css/style.css
js/app.js        écrans (accueil, QCM, flashcards, résultats)
js/deck.js       construction des sessions et des propositions de QCM
js/progress.js   progression et réglages (localStorage)
data/termes.json les termes
```

## Ajouter ou corriger des termes

Tout est dans `data/termes.json` :

```json
{
  "id": "brady",
  "cat": "prefixe",
  "terme": "Brady-",
  "sens": "Lent",
  "exemples": [{ "mot": "Bradycardie", "def": "Rythme du cœur plus lent que la normale" }],
  "syn": "lent"
}
```

- `cat` : `prefixe`, `racine`, `suffixe` ou `vocabulaire` (liste dans `categories`, en haut du fichier).
- `id` doit être unique : c'est la clé de la progression, ne pas le changer après coup.
- `syn` (optionnel) : les entrées qui partagent la même valeur ne sont jamais proposées l'une contre l'autre en QCM.

Une nouvelle catégorie (par exemple des questions de cours) = une entrée dans `categories` + des entrées avec ce `cat`.
