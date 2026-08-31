# ADR-0050 — Tourner hors du plan

- **Statut :** **accepté** (2026-08-31)
- **Décide :** comment un objet 2D dit qu'il est tourné hors du plan de l'écran
- **Dépend de :** ADR-0002 (espaces et Transform), ADR-0003 (Property System), ADR-0007 (schéma)
- **Remplace :** ADR-0047 §3 — `flipX` / `flipY` sont retirés
- **Ne décide pas :** l'unité de `rotation`, qui reste en radians ; une quelconque profondeur, caméra 3D ou z-order

---

## 1. Le problème avec le flip

ADR-0047 §3 avait raison sur le diagnostic — « une orientation n'est pas une rotation, et pas
non plus une échelle négative » — et tort sur la réponse. Un booléen ne peut dire que deux
choses : **face** ou **dos**. Ce qu'une carte saisie en plein retournement demande, c'est
`45`.

Le flip n'était donc pas un modèle, c'était **un cas particulier promu au rang de propriété**.

---

## 2. La décision

> **`rotationX` et `rotationY`, deux nombres en degrés, à côté de `rotation`.**

```
  Transform
    Position X    Position Y
    Rotation                  ← dans le plan, comme toujours
    Scale X       Scale Y
    Rotation X    Rotation Y  ← hors du plan
```

Pas de `Rotation Z` : la rotation dans le plan s'appelle `Rotation` parce que c'est celle
qu'un créateur de jeu 2D veut dire quand il dit « rotation ». Nommer les axes des deux
nouvelles suffit à lever l'ambiguïté sans importer un troisième axe dans le vocabulaire.

---

## 3. Ce n'est pas une approximation

Le renderer projette déjà orthographiquement : `worldMatrix()` produit une affine 2×3 que
`context.setTransform` consomme, sans profondeur. Sous cette projection, une rotation de θ
autour de l'axe X envoie `(x, y, 0)` sur `(x, y·cos θ, y·sin θ)` ; laisser tomber `z` laisse
`(x, y·cos θ)`.

> **Une mise à l'échelle verticale par `cos θ` EST la rotation autour de X, exactement.**

Il n'y a donc rien à simuler et rien à approcher. Le pipeline ne bouge pas : ce qui en sort
est la même affine qu'avant.

| Rotation X | Effet |
|---|---|
| 0° | au repos |
| 45° | une carte saisie en plein retournement (×0,707) |
| 90° | sa tranche (×0) |
| 180° | son dos (×−1) |

**Que 180° ressemble à un miroir est une conséquence du cosinus, pas un cas écrit.** C'est
précisément ce qui distingue ce modèle d'un flip renommé.

**L'axe autour duquel on tourne garde sa longueur** — `rotationX` raccourcit l'axe vertical,
`rotationY` l'horizontal. L'appariement ressemble à une transposition et n'en est pas une.

---

## 4. Ce que cela coûte

| | |
|---|---|
| Schéma | deux `number`, défaut 0 |
| `localMatrix()` | deux `cos`, multipliés dans les termes d'échelle que la composition portait déjà |
| Renderer, picking, caméra | **rien** — tout passe par `worldMatrix()` |
| Sérialisation | deux nombres, comme toute propriété déclarée |
| Inspector | deux lignes numériques avec le suffixe `°`, à la largeur courte, avec leur poignée |
| Graph | `Transform ▸ Rotation X` dans le picker, `Get`/`Set` gratuits |
| DnD, undo, live sync | gratuits : ce sont des propriétés du Property System |
| Hiérarchie | un enfant tourne avec son parent, par composition |

**Degrés, stockés tels quels.** `rotation` reste en radians parce qu'elle l'a toujours été et
que migrer réécrirait toutes les scènes ; celles-ci sont neuves, donc elles tiennent le nombre
que le créateur a écrit. L'unité est déclarée pour le seul suffixe : `DISPLAY_UNITS` n'a pas
d'entrée pour `°`, donc l'échelle reste 1 et rien n'est converti.

## 5. Le piège, nommé

**Un objet disparaît à 90° et à 270°**, parce que `cos` y vaut zéro. C'est géométriquement
juste et visuellement déroutant pour un débutant qui fait glisser le champ. Ce n'est pas un
défaut du code : c'est ce que tourner une feuille de papier jusqu'à sa tranche fait. Aucun
garde-fou n'est ajouté — en poser un mentirait sur la géométrie — mais le fait est consigné
ici pour que personne ne le retrouve comme un bug.

De même, `cos` est paire : `+45°` et `−45°` sont visuellement identiques.

---

## 6. Contrats observables

| Contrat | Vérifiable par |
|---|---|
| `flipX` / `flipY` n'existent nulle part | `transform.test.js` |
| `rotationX` / `rotationY` sont des nombres, en degrés, défaut 0 | idem |
| L'axe perpendiculaire mesure `cos θ` à 0°, 45°, 90°, 180° | idem |
| L'axe de rotation garde sa longueur | idem |
| Le turn multiplie l'échelle plutôt que de la remplacer | idem |
| `rotation` compose exactement comme avant | idem |
| Les deux se sérialisent et se relisent | idem |
| Ils composent dans la hiérarchie | idem |
| Ils apparaissent dans l'Inspector et le picker sans mécanisme spécial | à l'écran |
