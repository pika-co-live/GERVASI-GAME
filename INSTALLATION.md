# SECRET PARTY + FOOT MANAGER LEAGUE — Mise à jour

## Ce que contient la mise à jour

- Les 3 jeux originaux SECRET PARTY conservés.
- Le mode FOOT MANAGER LEAGUE en 4e jeu avec code privé, 2 à 10 clubs, budget initial de 1 000 000 €, 15 joueurs Académie gratuits de note 65 pour tous.
- Marché d'une sélection de joueurs réels de Ligue 1 saison 2026/27, prix **virtuels** entre 25 000 et 350 000 €, recherche, enchères synchronisées, budgets, équipe et revente.
- Classement entre amis (3 points victoire, 1 point nul), calendrier de confrontations aller simple entre clubs, historique de journées et primes.
- Possibilité d'importer les effectifs de Ligue 1 et les rencontres via API-FOOTBALL si l'hôte configure `API_FOOTBALL_KEY` dans les variables Render. Attention : accès et coûts à vérifier chez le fournisseur.

## Ce qui manque pour une version vraiment automatique

- **Les performances des vrais matchs du week-end et le calcul fantasy automatique ne sont PAS connectés.** Le score par journée reste saisi manuellement par l'hôte, affiché comme non vérifié.
- Le catalogue initial est une sélection, et non tous les joueurs de la Ligue 1. L'import complet requiert `API_FOOTBALL_KEY`.
- Le calendrier de votre ligue est généré automatiquement, mais les dates officielles ne sont consultables qu'avec l'API.
- La sauvegarde de vos équipes sur le service Render gratuit n'est **pas durable** sans base PostgreSQL configurée via `DATABASE_URL`. Attention aux coûts et aux conditions d'hébergement.

## Installation avec Codespaces

1. Télécharger `SECRET_PARTY_MAJ_COMPLETE.zip` et le déposer **tel quel** dans `/workspaces/GERVASI-GAME` dans l'explorateur Codespaces. Ne pas le décompresser à la main.
2. Copier-coller la commande ci-dessous dans le terminal (elle fait une sauvegarde Git locale avant toute copie, sans écraser les données JSON) :

```bash
cd /workspaces/GERVASI-GAME && unzip -oq SECRET_PARTY_MAJ_COMPLETE.zip -d /tmp/secret-party-update && cp -a /tmp/secret-party-update/SECRET_PARTY_MAJ_COMPLETE/. ./ && rm -f SECRET_PARTY_MAJ_COMPLETE.zip && git add -A && git commit -m "Foot Manager: mercato Ligue 1, classement et rencontres" && git push
```

3. Vérifier que Render redéploie et que le statut indique **Live**.
4. Ouvrir `https://gervasi-game.onrender.com/foot.html`.

Pour un déploiement sur un serveur existant, tester d'abord sur une branche isolée : le code n'est pas audité pour un usage public à grande échelle.

## Sources du catalogue initial

Sélection vérifiée le 21 novembre 2026 à partir de sources publiques :
- PSG (effectif officiel) : https://www.psg.fr/football-masculin/effectif
- PSG (UEFA 2026/27) : https://www.uefa.com/uefachampionsleague/clubs/52747--paris-sg/squad/
- Marseille (effectif et arrivées 2026/27) : https://www.fotmob.com/teams/8592/overview/marseille/players
- Fournisseur de données disponible après configuration : https://www.api-football.com/documentation-v3

Les notes et prix de l'application sont des **valeurs de jeu**, sans lien avec les valeurs réelles des transferts.
