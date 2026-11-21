# Casino Party — cinquième jeu dans SECRET PARTY

Ce paquet contient le projet complet : les quatre jeux déjà présents, plus Casino Party.

## Installation dans Codespaces
1. Faites glisser le ZIP `SECRET_PARTY_CASINO_V1.zip` dans la racine de `GERVASI-GAME` dans l'explorateur Codespaces (sans le décompresser).
2. Collez cette commande dans le terminal :

```bash
cd /workspaces/GERVASI-GAME && mkdir -p /tmp/casino-party-install && unzip -oq SECRET_PARTY_CASINO_V1.zip -d /tmp/casino-party-install && cp -a /tmp/casino-party-install/SECRET_PARTY_CASINO_V1/. ./ && rm -f SECRET_PARTY_CASINO_V1.zip && npm install && node --check server.js && node --check casino.js && node --check public/casino-client.js && git add -A && git commit -m "Ajout Casino Party multijoueur" && git push
```

3. Attendez le déploiement Render, puis ouvrez `/casino.html` sur le site habituel.

## Fonctionnalités
- Salons privés de 1 à 6 personnes, code à 6 chiffres
- 10 000 jetons virtuels par joueur et par salon
- Blackjack indépendant par personne, chacun contre le croupier (tirer / rester)
- Poker 5 cartes heads-up à 2 joueurs : ante, échange de 0 à 3 cartes, mise simple, parole, suivre, se coucher, classement des mains
- Aucun argent réel, aucun achat ni retrait, aucun lot

## Limites connues
- Les jetons et les salons sont en mémoire et repartent à zéro au redémarrage de Render ; il faut une base de données pour une sauvegarde durable.
- La table est un poker **5-card draw**, pas encore Texas Hold'em.
- Version initiale à tester sur 2 appareils avant utilisation régulière.
