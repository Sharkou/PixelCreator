# ADR-0065 — Un projet survit à l'onglet

- **Statut :** **accepté** (2026-09-12)
- **Décide :** quelle implémentation de `ResourceStore` persiste ; comment elle est testable sans navigateur ; ce qu'un autosave écrit et quand ; qui liste les projets ; ce qui se passe quand le navigateur refuse
- **Dépend de :** ADR-0010 (l'identité n'est jamais un nom), ADR-0017 (l'état d'IDE n'entre pas dans le modèle), ADR-0019 (Operations), ADR-0020 §3 et §4 (Resource, store asynchrone, chargement paresseux), ADR-0024 (undo par ressource), ADR-0026 §3 (le modèle bouge à chaque frappe), ADR-0054 (dire ce qui est vrai)
- **Ne décide pas :** la synchronisation distante, les comptes, le partage, la migration de schéma, l'import/export de projet entre navigateurs — voir §5

---

## 1. Problème

ADR-0020 §4 décrivait `ResourceStore` comme « une interface, plusieurs implémentations :
mémoire, IndexedDB, HTTP ». **Seule la première a jamais été écrite.** Tout projet que Pixel
Creator a fabriqué vivait dans une `Map` et mourait avec l'onglet.

Rien de l'interface n'était faux. Ce qui manquait était une deuxième implémentation — et les
deux verbes qui n'ont de sens qu'une fois qu'elle existe.

---

## 2. Le store est coupé en deux, et seule la moitié mince a besoin d'un navigateur

```
PersistentResourceStore        toute la logique : clés, ordre du manifeste, suppression
        │  quatre opérations
KeyValueArea                   get / put / remove / keys
   ├── MemoryArea              sous Node, dans les tests
   └── IndexedDbArea           dans un navigateur, quarante lignes
```

C'est le joint qu'`ImageCache` trace autour de `createImageBitmap` et `HtmlAudioOutput` autour
de `new Audio()` (ADR-0062 §2) : **ce qui peut être faux est vérifié sous Node**, et ce qui est
vérifié dans le navigateur est de la plomberie de base de données.

**Le manifeste est UN enregistrement ; un payload en est un chacun.** C'est ADR-0020 §4 écrit :
ouvrir un projet lit le manifeste et rien d'autre, donc un projet de deux cents sprites s'ouvre
aussi vite qu'un projet de deux. C'est aussi ce qui garde l'**ordre** correct — un manifeste est
une liste ordonnée et une zone clé-valeur n'a pas d'ordre à elle, donc l'ordre est une donnée
plutôt qu'un accident d'écriture.

**`write()` écrit l'entrée en même temps que le payload.** Un store dont le manifeste ne
rattraperait qu'au prochain autosave perdrait une ressource créée dans la dernière seconde
avant la fermeture d'un onglet — et « presque sauvegardé » est la seule chose qu'une
sauvegarde ne doit jamais être.

**Les mutations sont sérialisées en file.** Un store est asynchrone et ses appelants ne le sont
pas : `Project.add()` écrit et passe à la suite sans attendre — c'est une mutation de modèle
synchrone, et elle a raison de l'être. Deux écritures et une sauvegarde de manifeste peuvent
donc être en vol en même temps, et chacune est un lire-modifier-écrire du même enregistrement :
les exécuter en parallèle ferait gagner **la dernière arrivée** plutôt que la dernière demandée.
Une chaîne, pas un verrou : les opérations s'exécutent dans l'ordre d'appel.

**IndexedDB et pas `localStorage`.** Un projet porte des images et des sons en data URL ;
`localStorage` est synchrone, limité aux chaînes et plafonné vers cinq mégaoctets — une planche
de sprites l'épuise. IndexedDB est asynchrone, ce pour quoi le contrat de `ResourceStore` a été
écrit dès le premier jour, stocke des valeurs structurées et se compte en centaines de
mégaoctets.

**La transaction est attendue, pas la requête.** Une requête réussie n'est pas une écriture
posée : la transaction peut encore avorter, et un appelant à qui l'on dit « sauvegardé » sur la
seule requête se l'entend dire une fraction de seconde trop tôt.

---

## 3. L'autosave écrit deux choses, pour deux raisons

| Ce qui arrive | Pourquoi | Déclencheur |
|---|---|---|
| un **payload** | une scène ou un `.px` édité ; `Workspace.save()` savait déjà le faire, il manquait quelqu'un pour l'appeler | l'événement `dirty` du Workspace |
| le **manifeste** | un renommage, un déplacement, un réordonnancement, une suppression, le nom du projet : **aucun** ne touche un payload | une opération sur le pipeline du Project |

**Le debounce est ici et nulle part ailleurs.** Un créateur qui tire un curseur produit une
opération par pixel, et chacune est une intention réelle et répliquable que le modèle a raison
d'émettre (ADR-0026 §3). Ce qui ne doit pas arriver, c'est une écriture de base par pixel — la
période de silence est donc appliquée **à la porte de la persistance**, jamais dans le modèle,
jamais dans le pipeline, et jamais près d'un pas de simulation.

**Il écrit aussi en partant.** Un onglet fermé pendant la période de silence perdrait la
dernière seconde de travail, qui est précisément celle dont on se souvient.
`visibilitychange` et `pagehide` sont les deux événements qu'un navigateur délivre vraiment
quand un onglet s'en va ; `unload` n'en est pas un sur mobile.

**Une écriture à la fois.** Deux `flush` concurrents feraient courir deux manifestes vers un
enregistrement, et le gagnant serait celui qui finit en dernier — ce qui n'est pas le plus
récent. **Un échec remet le modèle en « sale »** plutôt que d'être avalé : un quota plein il y a
une seconde peut ne plus l'être dans une minute, et un créateur à qui l'on ne dit rien et dont
on ne sauvegarde rien a le pire des deux.

---

## 4. Deux verbes, et rien de plus

`New Project` et la liste de ce qui est déjà là. Pas de tableau de bord, pas de vignettes, pas
de dossiers de projets, pas de partage : chacun est un produit que personne n'a conçu.

**Ouvrir un projet, c'est ouvrir un document.** Reconstruire le shell en place voudrait dire
rebinder chaque fenêtre, chaque historique et chaque registre ; recharger la page avec le choix
mémorisé est ce à quoi sert un navigateur, et c'est le même chemin qu'un créateur emprunte
demain matin.

**Quel projet était ouvert n'est pas une donnée de projet** (ADR-0020 §3). C'est de l'état
d'espace de travail — un artefact dont la perte ne coûte rien — donc il vit dans
`localStorage` à côté d'aucun projet, et un navigateur qui n'en a pas ouvre simplement le
projet le plus récemment modifié.

**La dégradation est dite, pas cachée.** Fenêtre privée, stockage désactivé, quota plein :
`available()` répond non, la bibliothèque retombe sur une zone en mémoire, et l'Editor se
comporte exactement comme avant ce fichier — pour la durée de l'onglet. Le menu le **dit**
(ADR-0054) ; un écran blanc avec une erreur en console n'est pas une dégradation.

---

## 5. Ce que cet ADR ne décide pas

| Point ouvert | Pourquoi |
|---|---|
| **Synchronisation distante, comptes, partage** | Une implémentation HTTP de `ResourceStore` est prévue par ADR-0020 ; ce qui manque n'est pas le store mais l'identité et les permissions |
| **Migration de schéma IndexedDB** | Il y a un object store et il n'a jamais eu d'autre forme. Le jour où elle change, `onupgradeneeded` est l'endroit et `VERSION` le déclencheur ; inventer un cadre de migration avant d'avoir quoi que ce soit à migrer serait un cadre que personne n'a lu |
| **Import / export d'un projet entre navigateurs** | L'export **de jeu** existe (ADR-0066) ; réimporter un projet éditable demande la passe de remappage d'identifiants qu'ADR-0020 §1 laisse ouverte |
| **Un quota plein, côté produit** | L'échec est rapporté et réessayé ; ce qu'un créateur doit alors faire (supprimer un projet, exporter) est une conversation d'interface |
| **Le verrouillage entre deux onglets** | Deux onglets sur un projet écrivent chacun leur manifeste. Le canal live existe (ADR-0044) ; en faire une réconciliation est une décision de collaboration |

---

## 6. Contre-épreuves

| Vérifié | Où |
|---|---|
| Un projet écrit revient entier : scènes, `.px`, prefabs, images, sons, dossiers | `project/persistence.test.js` |
| Une image revient octet pour octet ; une scène se recharge et son Object est au bon endroit | idem |
| Renommer et déplacer atteignent le store par le manifeste | idem |
| Supprimer enlève l'entrée **et** le payload | idem |
| Une ressource écrite est dans le manifeste tout de suite ; réécrire garde son rang | idem |
| Un store est une vue d'**un** projet et ne voit pas l'autre | idem |
| Détruire un projet laisse les autres intacts | idem |
| Lister les projets ne lit aucun payload, et trie du plus récent au plus ancien | idem |
| Cet hôte dit honnêtement s'il a IndexedDB | idem |
| Dix intentions, **une** écriture | `editor/project/autosave.test.js` |
| Un renommage atteint le store sans toucher un payload | idem |
| Une scène éditée est écrite, pas seulement déclarée | idem |
| Un échec laisse le modèle sale pour réessayer | idem |
| `stop()` libère tout | idem |
| Le projet entier revient après un rechargement, depuis ce que l'autosave a écrit | idem |
| **Contre-épreuve** : sans l'écriture du manifeste, le nom du projet et le rangement sont perdus | idem |

---

## 7. Conséquences

### Positives

- Un projet survit à l'onglet, au rechargement et à la machine éteinte.
- `ResourceStore` cesse d'être une interface à une implémentation.
- L'ordre, les noms, les dossiers et les payloads binaires reviennent tels quels.
- La logique de persistance est testée sans navigateur ; la partie navigateur est minuscule.

### Négatives

- `start()` devient asynchrone : la coquille attend une fois, à la porte.
- Deux onglets sur un projet peuvent s'écraser l'un l'autre (§5).
- Une zone en mémoire reste possible, et un créateur en fenêtre privée doit lire le menu pour
  le savoir.

---

## 8. Un bug trouvé en chemin

`Project.deserialize()` **perdait l'ordre du manifeste**. Chaque entrée était déclarée par la
règle de placement ordinaire, qui recalcule une position depuis son parent — et une entrée dont
le dossier n'a pas encore de frère atterrit à la fin de la liste plate plutôt qu'à côté de lui.
Un projet rangé `Assets, hero.png, Level.scene` se rouvrait `Assets, Level.scene, …, hero.png`.

Invisible tant que rien ne se rouvrait. Le manifeste **est** l'ordre (ADR-0026 §5) ; reconstruire
est une construction, et une construction copie au lieu de redécider.
