# ADR-0047 — Une seule question, et une orientation

- **Statut :** **accepté** (2026-08-29)
- **Amendé par :** ADR-0048 (2026-08-31) — §2 : le refus du geste Component → graphe est confirmé par une mesure du geste concurrent plutôt que par un raisonnement sur la valeur morte.
- **Amendé par :** ADR-0050 (2026-08-31) — §3 est **remplacée** : `flipX` / `flipY` disparaissent au profit de `rotationX` / `rotationY`, deux nombres en degrés. Le raisonnement de §3 (une orientation n'est pas une échelle négative) reste vrai ; ce qui était faux est d'y avoir répondu par un booléen.
- **Amendé par :** ADR-0052 (2026-08-31) — §2 : le refus du geste Component → nœud est levé. La prémisse a changé — le picker a des niveaux, donc le lâcher peut ouvrir une question au lieu d'écrire une réponse.
- **Décide :** combien de champs nomment une propriété dans un nœud ; ce qu'un Component lâché sur un graphe veut dire ; comment un objet 2D dit dans quel sens il regarde ; ce qu'un contrôle seul sur sa ligne mesure
- **Dépend de :** ADR-0002 (espaces), ADR-0007 (schéma, `hidden`), ADR-0023 §2 (pas de type vecteur), ADR-0034 §3.3 (portée d'une référence), ADR-0039 (taxonomie), ADR-0040 (un nœud par intention), ADR-0043 (l'Object répond de lui-même), ADR-0045, ADR-0046
- **Amende :** ADR-0045 §1 (le champ `Component` disparaît, la question reste), §2 (la sortie garde son nom, l'entrée `Value` aussi) ; ADR-0046 §3 (le geste Component → nœud est retiré), §7 (un contrôle seul ne prend plus toute la largeur)
- **Ne décide pas :** `On Collision` et le modèle d'événement de collision ; `Random`, `Delay`, `Timer`, `Destroy`, `Spawn` ; le devenir d'une instance dont le `.px` est supprimé ; l'unité d'un port ; le format d'un identifiant de projet

---

## 1. Une propriété, c'est une question

ADR-0045 §1 avait séparé « quel Component » et « quelle propriété » en deux champs, pour une
raison mesurée et vraie : la liste fusionnée contenait tous les Components du projet et
n'était plus lisible. La séparation réglait la lisibilité et introduisait autre chose — **un
créateur pense « la rotation de cet objet », pas « le Component Transform, et dedans,
rotation »**. Le second est la décomposition du moteur portant les habits du créateur.

> **Le nœud demande l'Object, puis la propriété. Le Component est stocké et jamais demandé.**

Ce qui règle vraiment la lisibilité n'est pas un second contrôle, c'est un picker qui
**groupe** :

```
  Property ▾
  ┌────────────────────────┐
  │ 🔍 Search property     │
  ├────────────────────────┤
  │ › Object          4  › │
  │ › Camera          1  › │
  │ › Rectangle       6  › │
  │ › Sprite          4  › │
  │ › Transform       7  › │
  └────────────────────────┘
            → entre, ← ressort
```

C'est **le picker de nœuds, sans une ligne de plus** : `ui/menu.js` sait déjà ouvrir sur ses
catégories (`browse`), y entrer avec `→`, en ressortir avec `←` en resélectionnant celle que
l'on quitte (ADR-0046), et classer à travers tous les groupes dès qu'on tape — donc `rot`
trouve `Rotation` en affichant `Transform` à côté, **sans que personne ait choisi un Component
d'abord**. Il n'y avait rien à construire ; il y avait une liste à grouper.

### 1.1 La valeur porte les deux moitiés, le modèle en garde deux

Le picker rend `Transform/rotation` ; `paramWrites()` le redécoupe en les deux params que le
modèle a toujours eus. **Un composite dans le picker est un encodage ; un composite dans le
payload serait un format** — et le format reste celui d'ADR-0040 §2, donc tout graphe déjà
écrit se relit.

Les deux écritures partagent le même lot : il n'existe aucun état où un nœud nomme la
propriété d'un Component vers lequel il n'est pas pointé, et un seul `Ctrl Z` remet la paire.

Le Component est marqué `hidden` — le mot d'ADR-0007 pour un paramètre qui est du modèle et
pas de l'interface. `resolvedProperty()` est intact.

### 1.2 Le contrôle fermé dit le nom court

`Transform ▸ Rotation` a été essayé et **mesuré** : il ne tient pas dans une carte de 176 px
et se tronque en `Transform ▸ …`, ce qui cache la moitié qui identifie le choix et garde
celle que le picker venait d'afficher en titre de groupe. Le groupe appartient à l'endroit où
l'on choisit.

Même raisonnement pour le port `Value` de `Set Property`, qui affichait `flipY` — le nom du
MODÈLE, à côté d'un picker lisant `Flip Y`. Le picker au-dessus dit déjà laquelle ; le port
dit ce qu'il **est** (ADR-0045 §2, appliqué à l'entrée comme à la sortie).

---

## 2. Un Component ne se lâche pas sur un graphe

Le geste a été refusé, rétabli, et il est refusé une troisième et dernière fois. La raison
sous-jacente n'a jamais changé : **ce qu'un Component nomme est un GROUPE de propriétés, et
un nœud en veut une**.

Il a brièvement eu un champ à remplir (ADR-0046 §3). Maintenant qu'un seul picker pose toute
la question, écrire `component` seul pose une valeur que le créateur ne voit pas et que son
clic suivant écrase — la définition d'une valeur morte, que le refus doit empêcher plutôt que
produire.

Le refus nomme les deux gestes qui marchent : glisser **la propriété**, ou ouvrir le picker,
où ce Component est un groupe dans lequel entrer.

---

## 3. Une orientation n'est pas une rotation, et pas non plus une échelle négative

Le moteur est strictement 2D et le reste : `rotation` demeure **un scalaire**, aucun troisième
axe n'est inventé, `Matrix` est intacte. Ce qui manquait est le mot pour l'autre moitié de
« dans quel sens ça regarde » : un personnage qui se retourne n'est pas tourné, il est
**miroité**.

> **`flipX` et `flipY`, deux booléens du Transform.**

**Pas `scaleX < 0`.** Réutiliser le signe ferait répondre à un seul nombre deux questions —
quelle taille, et dans quel sens — de sorte qu'un créateur ayant mis l'échelle à 2 puis
retourné l'objet devrait taper `-2` et se souvenir pourquoi. Les deux se composent : l'échelle
dit la taille, le flip dit l'orientation, la matrice les multiplie.

**Un seul endroit devient de la géométrie.** `localMatrix()` est la couture que le renderer,
le picking et la physique traversent tous via `worldMatrix()`, donc le miroir est composé une
fois et rien en aval n'apprend un mot nouveau. Un miroir EST une échelle négative dans la
matrice ; ce que le modèle refuse, c'est de faire écrire cela au créateur.

| Ce que cela touche | Ce qui change |
|---|---|
| Transform | deux booléens de plus dans le schéma |
| Renderer | **rien** — il lit `worldMatrix()` |
| Sérialisation | deux booléens, comme toute propriété déclarée |
| Inspector | deux interrupteurs, largeur courte, avec leur poignée |
| Graph | `Transform ▸ Flip X` / `Flip Y` dans le picker |
| Undo, réplication | `setProperty`, comme toute propriété |
| Hiérarchie | un enfant est miroité avec son parent, par composition |

**Aucun nœud `Flip X` n'est ajouté.** `Set Property ▸ Flip X` le fait avec le nœud qui existe.
Un nœud qui BASCULERAIT serait une autre intention — voir le rapport.

---

## 4. Un contrôle seul sur sa ligne ne prend pas la ligne

ADR-0046 §7 donnait toute la colonne à un contrôle large. C'était trop : un champ Sprite
allait d'un bord à l'autre pendant que tous les nombres au-dessus s'arrêtaient à 40 %, donc le
panneau avait deux marges droites et pas de colonne.

> **Court : une cellule sur deux (≈ 40 %). Seul : quatre parts de contrôle pour une part
> d'air (≈ 70 %).**

Assez long pour un nom de fichier, assez court pour que le panneau garde une forme. **La
poignée garde sa propre colonne**, la même dernière colonne où finissent les lignes
appariées, donc toutes les poignées du panneau sont sur une verticale quelle que soit la
ligne au-dessus.

---

## 5. Contrats observables

| Contrat | Vérifiable par |
|---|---|
| Un nœud de propriété a deux champs : l'Object et la propriété | `inspector/node.test.js`, et à l'œil |
| Le picker s'ouvre sur les Components et se parcourt au clavier | à l'œil, dans Chrome |
| Taper classe à travers tous les groupes, le groupe restant lisible | à l'œil |
| Choisir écrit les deux params, dans un seul lot | `node.test.js` |
| Ce que le modèle tient se relit comme le chemin que le contrôle montre | idem |
| Un Component lâché sur un graphe est refusé, avec la route à suivre | `dnd.test.js` |
| Un flip miroite sans toucher l'échelle | `transform.test.js` |
| Un flip se compose dans la hiérarchie et se sérialise | idem |
| Un contrôle court mesure 40 %, un contrôle seul 70 % | mesuré dans Chrome |
