# ADR-0066 — Un jeu est un fichier avant d'être une URL

- **Statut :** **accepté** (2026-09-12)
- **Décide :** ce que « publier » veut dire aujourd'hui ; ce que le client de jeu accepte comme adresse ; ce qui manque exactement pour une URL Pixel Creator
- **Dépend de :** ADR-0042 (Preview est un client de runtime adressé par identifiant), ADR-0044 §2 (un Preview est nommé par son projet), ADR-0065 (un projet persiste)
- **Ne décide pas :** les comptes, les permissions, le stockage distant, un slug public, la mise à jour d'un jeu publié — voir §3

---

## 1. L'audit

Ce qui existait déjà, et qui est plus que ce que le mot « rien » laissait croire :

| Pièce | État |
|---|---|
| `bundleProject()` / `openBundle()` | **fait.** Un bundle est le manifeste, tous les payloads et la scène d'ouverture — une valeur JSON, pure, sans DOM (ADR-0042 §2) |
| le client de jeu (`preview/index.html`) | **fait.** Une page, un canvas, un Runtime, et rien de l'Editor : `tools/layers` tient la ligne |
| la frontière d'adressage | **faite.** `resolvePreview(id)` était déjà le seul endroit qui sache qu'un preview est local (ADR-0042 §3) |
| l'hébergement statique | **fait, et déjà en ligne.** `firebase.json` sert `public/engine/src` ; `/preview/index.html` est donc une URL publique aujourd'hui |
| un endroit pour POSER un bundle qui ne soit pas ce navigateur | **manquant** |
| une identité publiée distincte du projet, et qui a le droit de l'écrire | **manquant** |

Autrement dit : tout était là **sauf** l'endroit où poser le fichier, et la question de savoir
qui a le droit de le poser.

---

## 2. Ce qui est livré : le fichier, et l'adresse qui le joue

> **Export game… écrit le bundle. `#u/<url>` le joue.**

```
Editor ▸ Share ▸ Export game…      →  MonJeu.pxgame.json
                                       (le bundle même qu'un Preview lit)
posé sur n'importe quel hébergeur statique
                                   →  …/preview/index.html#u/<url encodée>
```

C'est un jeu jouable, sur la machine de quelqu'un d'autre, sans Editor nulle part — et sans
backend. Le navigateur remet un fichier à une personne sans demander la permission de
personne ; tout ce qui vient après — une URL, un nom, une visibilité, une mise à jour —
demande un serveur qui sache qui demande.

**Deux formes d'adresse, une seule frontière.** `requestFromHash()` reconnaît `#p/<id>` (un
preview de CE navigateur) et `#u/<url>` (un bundle que quiconque peut lire) ;
`resolveRequest()` répond aux deux. Le client n'apprend ni l'un ni l'autre. Le jour où un
bundle vient d'un serveur Pixel Creator, c'est une troisième branche **là**, et `client.js` ne
bouge pas — ce que la frontière d'ADR-0042 §3 promettait.

**Deux refus différents, parce que deux choses différentes ont mal tourné.** « Ce preview n'est
pas ici » parle d'un lien ouvert sur la mauvaise machine ; « ce jeu n'a pas pu être récupéré »
parle d'un fichier absent ou d'une politique de lecture. Une seule phrase pour les deux serait
fausse la moitié du temps (ADR-0054).

**Un fragment, pas une requête.** Un fragment n'atteint jamais un serveur, donc l'URL d'un
bundle ne finit pas dans un journal d'accès — la raison qu'ADR-0042 donnait déjà pour `#p/`.

---

## 3. Ce qui reste, nommé précisément

```
BLOCKED: publier vers une URL Pixel Creator
Reason: il manque trois décisions, et aucune n'est technique.

  1. QUI publie.        Il n'existe ni compte, ni identité de créateur, ni session
                        authentifiée. `functions/` est vide et `/api/**` ne route vers
                        rien.
  2. OÙ le bundle vit.  Firebase Storage ou Firestore sont tous deux plausibles ; ce qui
                        décide est la taille (un bundle porte les images en data URL), le
                        coût de lecture et la politique de cache — un arbitrage produit.
  3. CE QU'UNE URL NOMME. `play.pixelcreator.io/<quoi>` : le ResourceId du projet est
                        opaque et laid ; un slug est un nom, donc unique, donc réservable,
                        donc un registre et un conflit à trancher (ADR-0010 interdit de
                        dériver une identité d'un nom, pas d'avoir un alias — mais qui
                        possède l'alias est la question).

Sans ces trois-là, un « bouton Publier » serait un bouton qui ment. Ce qui est livré est la
moitié qui ne ment pas.
```

---

## 4. Contre-épreuves

| Vérifié | Où |
|---|---|
| `#p/<id>` et `#u/<url>` sont reconnus, et rien d'autre | `preview/publish.test.js` |
| Une URL malformée n'est pas une adresse | idem |
| Un bundle est récupéré et joué ; un `fetch` en échec répond « rien », jamais une exception | idem |
| L'export est le bundle même qu'un Preview lit | idem |
| Le nom du fichier vient du projet et ne contient rien d'illégal | idem |
| Un projet vide s'exporte quand même, ce qui est ce qu'il est | idem |

---

## 5. Conséquences

### Positives

- Un créateur peut faire jouer son jeu à quelqu'un d'autre, aujourd'hui, sans compte.
- La frontière d'ADR-0042 §3 est utilisée pour de vrai plutôt que décrite.
- Ce qui manque est nommé en trois lignes plutôt qu'en « pas encore fait ».

### Négatives

- Le créateur doit trouver un hébergeur lui-même, ce qui exclut de fait les débutants.
- Un bundle porte ses images en data URL : un jeu de quelques mégaoctets fait un fichier de
  quelques mégaoctets, et rien ne le compresse.
- Une mise à jour est un nouveau fichier posé au même endroit ; il n'existe aucune version, et
  personne ne peut dire à un joueur que le jeu a changé.
