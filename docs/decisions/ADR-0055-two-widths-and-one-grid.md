# ADR-0055 — Deux largeurs, une grille

- **Statut :** **accepté** (2026-09-07)
- **Décide :** ce que mesure un contrôle seul sur sa ligne ; quels types prennent les deux
  cellules de la colonne des valeurs ; ce que réserve une gouttière de poignée ; où vit la
  hauteur d'un bandeau de région ; ce qu'un panneau vide dessine
- **Dépend de :** ADR-0006 (une fenêtre annonce, le shell route), ADR-0007 (schéma de
  l'Inspector), ADR-0023 (types de propriétés), ADR-0045 §9 (une couleur redevient courte),
  ADR-0046 §7 (deux largeurs, déclarées une fois)
- **Amende :** ADR-0047 §4 — **remplacée** : un contrôle seul reprend les deux cellules ;
  ADR-0046 §7 — « un mot et une option choisie » ne sont plus courts
- **Ne décide pas :** la largeur d'une carte de nœud (elle reste celle d'ADR-0046 §7, et le
  node ne lit pas `isWide`) ; la colonne de libellé de 62 px ; la densité tactile

---

## 1. Trois grilles, trois bords droits, et aucun alignement

ADR-0046 §7 posait la règle utile : **un contrôle court prend une cellule, un contrôle large
prend les deux.** ADR-0047 §4 l'a corrigée en donnant au contrôle seul « quatre parts de
contrôle pour une part d'air », soit environ 70 %. Mesuré dans Chrome, panneau à 304 px :

| Ligne | Bord droit (px depuis le bord du panneau) |
|---|---|
| un nombre seul | 165 |
| `Alpha`, seul sur sa ligne | **233** |
| le `Y` de `Position` | 280 |

Le bord à 233 ne s'aligne sur rien. La correction visait deux marges droites et en a produit
trois — parce qu'elle traitait le symptôme (un champ Sprite qui allait plus loin que les
nombres) plutôt que la cause : **la colonne des valeurs a deux cellules, et un contrôle large
en prend deux.** C'est ce que dit ADR-0046 §7, et c'est ce qui aligne le bord droit d'un
`Sprite` sur celui du `Y` de `Position`, exactement.

> **Une grille pour toutes les lignes : `1fr` · gouttière · `1fr` · gouttière. Un contrôle
> court prend la première cellule, une paire en prend une chacune, un contrôle large prend
> les deux cellules et la gouttière du milieu.**

Il y avait trois déclarations de grille dans `windows/inspector.js` ; il y en a une, et deux
règles de placement. Les deux bords droits sont à 165 et 276, et rien d'autre.

## 2. Taper, c'est montrer

ADR-0046 §7 rangeait « un mot et une option choisie » parmi les valeurs courtes. La
conséquence, jamais mesurée : `Name` et `Tag` — les deux premières lignes que rencontre un
créateur — tenaient dans une boîte de dix caractères, et un `enum` était trop étroit pour
lire l'option qu'il affichait. Un contrôle dans lequel on **tape** ou dont on **lit** le
choix n'a pas de « valeur courte » à montrer : il a du texte.

`STRING` et `ENUM` rejoignent donc `RESOURCE`, `OBJECT`, `RANGE`, `LIST` et `READONLY` dans
`WIDE_KINDS` (`inspector/schema.js`). `COLOR` reste court : une pastille n'a pas de contenu
qui déborde, elle a une cible qu'on clique — la correction d'ADR-0046 §7 tient.

La règle était « mesurée dans Chrome » et nulle part ailleurs, ce qui est exactement pourquoi
elle a pu dériver. Elle a maintenant un test (`schema.test.js`).

## 3. Une gouttière est déclarée une fois, et elle sait ce qu'elle contient

La grille écrivait `16px` littéralement à ses deux extrémités, et la poignée qui s'y place
tirait sa largeur du glyphe. Deux façons de dire le même nombre, dont une seule bougerait le
jour où l'autre change. `--grip` est déclaré en tête de la feuille du panneau, vaut
`var(--px-icon)` — la poignée EST une icône de la petite taille — et est lu par la grille et
par la poignée.

Ce n'est pas un token de design : rien hors de l'Inspector ne met quoi que ce soit en page
contre une poignée. Et la gouttière reste à la taille du glyphe plutôt que de descendre à
l'encre qu'il dessine : c'est une cible de glisser, et un geste se vise.

`icon()` arrondit d'ailleurs toute taille demandée à 16 ou 20 (`ui/icons.js`), donc les `12`
et le `14` passés à quelques appels ne sont jamais arrivés dans le DOM. Ils sont retirés :
un nombre qui ne fait rien est un nombre qu'on croira plus tard.

## 4. Un bandeau de région a une hauteur, et les régions sont trois

L'en-tête d'une `px-window` mesurait `--px-hit + --px-space-2` ; la bande d'onglets de la
scène mesurait `--px-hit`. Les deux sont côte à côte sur la même ligne, donc la couture qui
traverse le haut de l'espace de travail descendait de sept pixels en passant au milieu.

`--px-header` est cette hauteur, déclarée dans `ui/styles.js` et lue par les deux. Un token à
deux consommateurs est un token ; c'est la même règle qui a fait de la colonne de libellé de
62 px une constante locale et non un token.

## 5. Un état vide, et il y en avait quatre

`ui/empty-state.js` existe « parce que deux fenêtres en montrent un et qu'ils ne doivent pas
diverger ». Trois autres avaient divergé : l'Inspector centrait le sien avec 32 px de marge
et un glyphe à 0.35, le Graph répétait les six mêmes propriétés une graduation de texte plus
bas, la Hierarchy imprimait un paragraphe sans glyphe. Ils diffèrent par **ce qu'ils disent**,
qui est tout l'intérêt d'un état vide, et par rien d'autre.

Le Graph garde une seule ligne à lui — un canevas n'a pas de corps à remplir, donc son état
flotte au-dessus du plan.

## 6. Ce qu'une racine d'ombre ne voit pas

`[hidden] { display: none !important }` était déclaré pour le document et pas pour les
racines d'ombre, où toute déclaration `display` d'une fenêtre bat le défaut du navigateur.
Quatre fenêtres avaient découvert le fait séparément et l'avaient rustiné chacune de son
côté. C'est énoncé une fois dans la feuille de base, pour la même raison que `box-sizing` :
une règle du document ne traverse pas une frontière d'ombre.

## 7. Contrats observables

| Contrat | Vérifiable par |
|---|---|
| Un contrôle court mesure une cellule, un large les deux | `schema.test.js`, et mesuré dans Chrome |
| Tout bord droit du panneau tombe sur l'une de deux abscisses | `getBoundingClientRect()` sur `.fields` |
| `Name`, `Tag` et un `enum` tiennent un nom lisible | à l'œil |
| Une gouttière réserve la taille du glyphe qu'elle contient | mesuré |
| La bande d'onglets et les en-têtes de fenêtre finissent sur la même ligne | mesuré |
| Un état vide est le même objet dans les cinq fenêtres | à l'œil, et une seule règle |
| Un élément portant `hidden` dans une racine d'ombre disparaît | l'état vide du Graph, un nœud posé |
