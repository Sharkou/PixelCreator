# ADR-0049 — Un identifiant se lit à voix haute

- **Statut :** **accepté** (2026-08-31)
- **Décide :** de quoi un identifiant est fait ; dans quelle unité les nœuds trigonométriques parlent
- **Dépend de :** ADR-0010 (l'identité est un ID, pas un nom), ADR-0045 §11.3 (un port est nommé pour son unité)
- **Amende :** ADR-0010 dans son **implémentation** seulement — la règle « aucune identité ne dérive d'un nom modifiable » est intacte
- **Ne décide pas :** l'existence d'un slug lisible à côté de l'identité ; `Rotation X / Y` ; la physique

---

## 1. Des lettres, et seulement des lettres

Un identifiant est lu à voix haute, recopié depuis une capture d'écran et collé dans une
URL. Un chiffre à côté d'une lettre est exactement l'endroit où cela échoue : `0` contre `O`,
`1` contre `l`. Un identifiant fait uniquement de lettres ressemble aussi à un **mot** plutôt
qu'à une empreinte, ce qu'un créateur qui partage un lien s'attend à voir.

> **L'alphabet perd ses dix chiffres. Il garde ses vingt-deux lettres non ambiguës.**

`i`, `l` et `o` restent dehors — les erreurs de lecture classiques — et `u` aussi, parce que
le laisser est la façon dont une chaîne aléatoire finit par épeler quelque chose que personne
n'a voulu.

**ADR-0010 N'EST PAS TOUCHÉE.** Cette ADR interdit une identité qui **dérive** d'un nom que le
créateur peut changer. Rien ici ne lit un nom : la valeur est toujours **tirée** du CSPRNG.
Ce qui change est l'alphabet, pas la provenance — renommer un projet ne casse donc toujours
rien, et une URL partagée survit toujours au renommage.

### 1.1 Quatorze caractères, et un rejet

Vingt-deux symboles valent moins que trente-deux : l'ancien alphabet donnait exactement
5 bits par caractère, celui-ci donne log₂(22) ≈ 4,46. Douze caractères ne feraient plus que
53 bits là où la garantie était 60 ; **quatorze** la rétablissent (62 bits) au prix de deux
caractères que personne ne lit.

Et 22 ne divise pas 256. Masquer ou prendre un reste rendrait les premières lettres de
l'alphabet plus probables que les dernières — un biais qui **rétrécit l'espace de valeurs
réel** et qu'aucun test du genre « utilise-t-il toutes les lettres ? » ne verrait, puisque
toutes apparaîtraient quand même. Le plus grand multiple exact de 22 sous 256 est 242 : un
octet au-delà est jeté et retiré, ce qui arrive pour 14 valeurs sur 256, environ 5 % du temps.

### 1.2 Ce que la migration coûte : rien

Aucun endroit du moteur ne valide la forme d'un identifiant — ni la génération, ni le
stockage, ni `idFromHash()` qui prend tout ce qui suit `#p/`, ni les clés du magasin. Les
identifiants déjà écrits, chiffres compris, continuent donc de se résoudre exactement comme
avant. Seuls les identifiants **neufs** changent de forme.

### 1.3 Ce que cela ne décide pas

Un **slug lisible** — `mon-jeu` dans l'URL, à côté de l'identité — reste une question ouverte
et distincte. Elle se pose le jour où une URL doit être jolie ET stable, et elle demande de
décider ce qui arrive à l'ancienne URL après un renommage.

---

## 2. `Sin` et `Cos` parlent en degrés

Un créateur qui vient de taper `90` dans un champ Rotation s'attend à taper `90` ici. La
conversion vit **dans le nœud**, exactement comme dans `Rotate` (ADR-0045 §11.3) : le Core
continue de penser en radians et rien du modèle de propriété ne bouge.

Le port s'appelle donc `Degrees` et pas `Angle` — un mot pour lever une question qui aurait
sinon deux réponses.

`Distance` prend **deux Objects** et non quatre coordonnées, parce que c'est la question
qu'un créateur pose : « l'ennemi est-il assez près ». Quatre ports l'obligeraient à assembler
la question avant de pouvoir la poser. Un Object sans Transform n'a pas de position, donc pas
de distance : la réponse est zéro, et non une erreur — la règle qu'ADR-0034 §3.4 pose déjà.

---

## 3. Contrats observables

| Contrat | Vérifiable par |
|---|---|
| Un identifiant neuf ne contient que des lettres non ambiguës | `id.test.js`, et l'Inspector |
| Chaque lettre est tirée aussi souvent que les autres | `id.test.js` (planéité > 0,9) |
| Un identifiant ancien, chiffres compris, se résout encore | rien ne valide la forme |
| L'URL d'un Preview porte l'identifiant tel quel | à l'écran |
| `Sin(90)` vaut 1 et le port s'appelle `Degrees` | `nodes.test.js` |
| `Distance` entre deux Objects, 0 sans Transform | idem |
