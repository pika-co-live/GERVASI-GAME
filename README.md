# SECRET PARTY 🎮

Application web multijoueur temps réel pour 2 à 5 amis. Trois jeux : **Qui est l'imposteur ?**, **Le Saboteur** et **L'Espion Secret**.

## Tester sur son ordinateur

1. Installez [Node.js](https://nodejs.org/) version 20 ou supérieure.
2. Dans le dossier du projet :

```bash
npm install
npm start
```

3. Ouvrez `http://localhost:3000` dans le navigateur.
4. Pour tester 2 joueurs sur le même ordinateur, ouvrez 2 navigateurs différents (ou une fenêtre privée), créez un salon et rejoignez-le avec son code.

## Mettre en ligne avec GitHub + Render

1. Sur [github.com/new](https://github.com/new), créez un dépôt nommé `secret-party` (sans modèle initial si vous ajoutez tous les fichiers vous-même).
2. Ajoutez **tout le contenu du dossier `secret-party`**, sans `node_modules`. Vous pouvez passer par **Add file → Upload files** et glisser les fichiers et dossiers, puis valider avec **Commit changes**. Vérifiez que `package.json` et `server.js` sont à la racine du dépôt, et non dans un dossier `secret-party` imbriqué.
3. Sur [dashboard.render.com](https://dashboard.render.com), connectez GitHub et créez un **New → Web Service** à partir de ce dépôt.
4. Choisissez **Node**, **Build Command** : `npm install`, **Start Command** : `npm start`. Si le plan gratuit est proposé, vous pouvez le choisir.
5. Déployez puis ouvrez l'URL HTTPS fournie par Render sur les téléphones.
6. Un joueur crée le salon, les autres entrent le code à six chiffres. Un seul lien suffit pour tous.

**Attention :** Les salons et scores sont en mémoire sur le serveur : ils disparaissent à chaque redémarrage, lors d'une mise en veille ou d'un nouveau déploiement. Utilisez **une seule instance** Render. Le plan gratuit peut mettre l'application en veille et introduire un délai au premier chargement. Le jeu utilise des connexions Socket.IO ; une connexion Internet stable est nécessaire. Les secrets sont transmis seulement au joueur concerné pendant la partie, mais il ne s'agit pas d'un système anti-triche résistant à un joueur contrôlant son propre navigateur.

## Règles des jeux

- **Imposteur :** tout le monde reçoit un mot identique, sauf un joueur avec un mot proche ; on donne des indices à l'oral, puis on vote.
- **Espion :** tout le monde reçoit le même lieu, sauf l'espion ; questions orales et vote. L'espion peut tenter de deviner le lieu à l'oral ; cette V1 juge le vainqueur par le vote, pas par une saisie de réponse.
- **Saboteur :** trois missions de validation numérique ; le saboteur peut secrètement saboter chaque mission. Après trois missions, discussion et vote. L'équipe gagne si elle découvre le saboteur **ou** si moins de deux missions sont sabotées. Sinon, le saboteur gagne.
- **Votes :** chacun vote une fois contre un autre joueur. En cas d'égalité, personne n'est désigné. Les votes ne sont pas affichés individuellement.
- **Points :** +1 par innocent victorieux, +2 si le rôle secret gagne. Les scores restent dans le même salon.

## Limitations de la V1

Les joueurs discutent **oralement** (ensemble dans une pièce ou via appel vocal) : pas de chat vocal intégré. Une déconnexion suspend l'avancement par l'hôte jusqu'à la reconnexion. Seul l'hôte lance les manches, ouvre les votes et révèle les missions. Les nouveaux joueurs ne peuvent entrer qu'au salon entre les manches. Le rôle d'hôte est transféré au prochain joueur si l'hôte quitte le salon entre les manches.

## Structure

- `server.js` : serveur Express + Socket.IO, attribution des rôles et résultats.
- `public/index.html` : écran principal.
- `public/style.css` : thème sombre néon et responsive.
- `public/app.js` : interface interactive et connexion Socket.IO.
- `public/manifest.webmanifest`, `public/sw.js`, icônes : ajout à l'écran d'accueil (PWA).
- `render.yaml` : configuration de déploiement facultative en Blueprint.
