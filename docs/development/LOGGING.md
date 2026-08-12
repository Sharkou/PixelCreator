# Logging

## OBSERVÉ

Il n'existe pas de logger. Des `console.log` avec styles CSS inline, dispersés dans le
code, suivant une convention de couleurs constante :

| Couleur | Motif | Sens |
|---|---|---|
| `#11AB0D` vert | `[SERVER] …` | trafic réseau |
| `#3b78ff` bleu | `info: …` | information moteur |
| `#F9F1A5` jaune | `warn: …` | avertissement |

Exemples réels :

```js
console.log('%c[SERVER] Connection established!', 'color: #11AB0D');
console.log('%cinfo: File loaded: ' + file.id, 'color: #3b78ff');
console.log('%cwarn: ' + string, 'color: #F9F1A5');
```

`System.log()`, `System.debug()`, `System.warn()` codifient partiellement ces trois
styles — mais **la plupart des appels ne les utilisent pas** et réécrivent le style à
la main. `System.getDate()` produit un horodatage `[2026-08-12 14:03:22.041]` qui n'est
**jamais utilisé**.

Côté serveur, les mêmes helpers existent (`log`, `debug`, `error`) avec les mêmes
couleurs — la convention est donc partagée client/serveur.

### Ce qui fonctionne

L'identité visuelle. Un développeur reconnaît immédiatement une ligne réseau d'une
ligne moteur dans la console. **C'est un acquis à conserver.**

### Ce qui ne fonctionne pas

- Impossible de filtrer par catégorie ou par niveau.
- Impossible de désactiver les logs en production.
- Les catégories sont implicites, dans une chaîne de caractères.
- Beaucoup de `console.log` bruts sans style ni préfixe.
- Le `try/catch` de `Object.update()` fait `console.error(err)` **à chaque frame et par
  composant** : une erreur systématique produit des milliers de lignes identiques.
  C'est ce qui a rendu invisible le bug du mode solo hors ligne.
- L'horodatage est écrit mais inutilisé.

---

## PROPOSITION V2

Conserver l'identité visuelle, la mettre derrière une API nommée.

```js
logger.network('Connection established');
logger.scene('Object added: ' + id);
logger.runtime('Frame budget exceeded');
logger.editor('Inspector rebuilt');
logger.core('Property system initialized');
```

Chaque catégorie garde sa couleur historique :

| Catégorie | Couleur | Origine |
|---|---|---|
| `network` | `#11AB0D` | conservée |
| `core` / `scene` | `#3b78ff` | conservée (`info:`) |
| `runtime` | à définir | |
| `editor` | à définir | |
| `warn` | `#F9F1A5` | conservée |
| `error` | rouge | |

### Ajouts

- **Niveaux** : `debug` < `info` < `warn` < `error`, seuil configurable.
- **Filtrage par catégorie** : `logger.enable('network', 'runtime')`.
- **Silencieux en production**, verbeux en développement.
- **Déduplication** : un message identique répété est agrégé
  (`… ×1247`) au lieu d'être répété à chaque frame. C'est le correctif direct du bruit
  produit par le `try/catch` de `Object.update()`.
- **Horodatage optionnel**, en réutilisant `System.getDate()` qui existe déjà.
- **Même API côté serveur** : c'est du Core, donc sans dépendance au navigateur ; le
  formatage couleur s'adapte (codes ANSI hors navigateur).

### Ce qu'on ne fait pas

- Pas de bibliothèque de logging externe.
- Pas de télémétrie ni d'envoi distant.
- Pas de remplacement des couleurs : elles font partie de l'identité du projet.
