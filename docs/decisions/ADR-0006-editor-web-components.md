# ADR-0006 — Editor modulaire par Web Components natifs

- **Statut :** **accepté** (2026-08-12)
- **Décide :** comment rendre l'UI de l'Editor modulaire sans framework

---

## Contexte observé

### Ce qui fonctionne aujourd'hui et doit survivre

La synchronisation temps réel de l'Editor repose sur trois mécanismes simples :

1. **Liaison par classe CSS** — chaque champ porte `class="<objectId>-<prop>"`
   (ou `<objectId>-<Component>.<prop>`).
2. **Résolution globale** — `document.getElementsByClassName(obj.id + '-' + prop)`
   retourne toutes les vues de cette propriété, où qu'elles soient.
3. **Garde de focus** — `if (el[i] !== document.activeElement)` : le champ en cours de
   saisie n'est jamais réécrit.

Vérifié : taper `P`, `l`, `a`, `y` dans l'Inspector met à jour simultanément le champ
Inspector et le `contenteditable` de la Hierarchy, lettre par lettre.

**Il y a une source de vérité unique — l'`Object`.** Le DOM n'est qu'une projection.
C'est simple et correct. **Il ne faut pas introduire de store séparé.**

### Le problème réel

Ce n'est pas l'usage du DOM, c'est la **structure du projet UI** :

- `index.html` fait 700 lignes et contient tout le squelette de l'IDE ;
- les modules s'accrochent à des `id` fixes au chargement :
  `document.getElementById('play').addEventListener(...)` ;
- `sync.js` cible `#sync`, commenté dans le HTML — le module lèverait une erreur, il
  n'est simplement pas importé ;
- les fenêtres (`Hierarchy`, `Properties`, `Project`) reçoivent un id de conteneur et
  supposent que tout leur balisage existe déjà ;
- 30 feuilles CSS dans un espace de noms global ;
- **`editor/windows/window.js` contient uniquement `// TODO: Implement base window class`.**

Conséquence : **ajouter une fenêtre exige de modifier `index.html`, `app.js`, un CSS et
le module.** C'est cela, le défaut de modularité.

---

## Décision

Des **Web Components natifs** comme primitives d'Editor. Pas de React, Vue, Angular ni
Svelte.

### Primitives

```
<px-window>    <px-panel>   <px-split>   <px-tabs>
<px-toolbar>   <px-tree>    <px-list>    <px-property>
<px-viewport>  <px-modal>   <px-menu>
```

### Fenêtres construites dessus

```
<px-hierarchy>  <px-inspector>  <px-assets>   <px-scene>
<px-graph>      <px-players>    <px-console>
```

Chaque fenêtre est **un fichier** qui porte son balisage, ses styles (Shadow DOM) et son
cycle de vie. Ajouter une fenêtre = écrire ce fichier et l'enregistrer auprès du layout.
`index.html` se réduit à un point de montage.

### Le binding devient scopé

C'est le point délicat. **Le Shadow DOM casse `document.getElementsByClassName`** : un
champ encapsulé devient invisible depuis la requête globale, et la synchronisation
temps réel disparaîtrait — silencieusement.

Remplacement, à comportement observable identique :

```js
// <px-property> s'abonne au Change de la propriété qu'il affiche
connectedCallback() {
    this.unsubscribe = properties.observe(this.target, this.prop, change => {
        if (this.input !== this.shadowRoot.activeElement) {   // garde conservée
            this.input.value = change.value;
        }
    });
}
disconnectedCallback() { this.unsubscribe(); }
```

Ce que cela préserve : l'édition lettre par lettre, la source de vérité unique, la garde
de focus. Ce que cela ajoute : le désabonnement (aujourd'hui inexistant — les écouteurs
s'accumulent), et la fin des requêtes DOM globales à chaque frappe.

**Ordre de migration impératif :** migrer le binding **avant** d'encapsuler en Shadow
DOM. L'inverse casse la synchronisation sans erreur visible (risque R2).

---

## Pourquoi les Web Components et pas un framework

| Critère | Web Components | Framework UI |
|---|---|---|
| Dépendances runtime | 0 | 1 + son écosystème |
| Build obligatoire | non | oui en pratique |
| Encapsulation de style | Shadow DOM natif | via convention/outil |
| Modèle réactif | **celui qui existe déjà** (Property System) | un second modèle, concurrent |
| Continuité avec Legacy | directe (c'est du DOM) | réécriture |
| Canvas + DOM mixtes | naturel | frottements |

Le point décisif : Pixel Creator **a déjà un système réactif qui marche** — le Property
System. Un framework en apporterait un second, et il faudrait les faire cohabiter. C'est
un coût net sans bénéfice.

---

## Conséquences

### Positives

- Une fenêtre = un fichier, ouvrable isolément dans une page de test.
- Les styles cessent de fuir entre panneaux.
- Le désabonnement devient possible (fuite mémoire actuelle corrigée).
- Aucune dépendance ajoutée, aucun build imposé.

### Négatives

- **Le Shadow DOM complique le débogage** et empêche les sélecteurs globaux — y compris
  ceux, pratiques, utilisés aujourd'hui.
- Le drag & drop entre panneaux traverse des frontières de Shadow DOM : à vérifier tôt
  (la Hierarchy, l'Inspector et le Graph échangent tous par drag & drop).
- Font Awesome et les polices sont chargées globalement : leurs styles n'entrent pas
  dans le Shadow DOM. Il faudra soit adopter des styles adoptés
  (`adoptedStyleSheets`), soit renoncer au Shadow DOM sur certains composants.
- Risque R10 : 700 lignes de HTML peuvent devenir 30 composants tout aussi couplés.
  Garde-fou : **tout composant doit s'ouvrir seul dans une page de test.**

---

## Alternatives écartées

| Alternative | Pourquoi non |
|---|---|
| **Garder le HTML monolithique** | C'est le problème à résoudre. |
| **Templates + classes JS, sans Custom Elements** | Améliore un peu, mais ne résout ni le cycle de vie, ni l'encapsulation de style, ni l'enregistrement déclaratif. |
| **React / Vue / Svelte** | Dépendance lourde, build obligatoire, second système réactif concurrent du Property System. Exclu par la vision. |
| **Lit / Stencil** (surcouches légères) | Plus raisonnable, mais ajoute une dépendance pour un bénéfice marginal sur ~10 primitives. À reconsidérer si les Custom Elements natifs s'avèrent trop verbeux. |
| **Store centralisé (Redux-like)** | Introduirait une seconde source de vérité à côté de l'`Object`. Exactement ce que Legacy évite avec raison. |
