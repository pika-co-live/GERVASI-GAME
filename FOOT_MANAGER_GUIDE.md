# FOOT MANAGER LEAGUE — ajout à SECRET PARTY

## État réel de cette version

- Les trois jeux originaux sont préservés.
- Une quatrième entrée sur l'accueil ouvre `/foot.html`.
- Création/rejoindre une ligue par code à six chiffres ; 2 à 10 clubs ; chaque club reçoit 15 joueurs Académie note 65 et 1 000 000 € fictifs.
- Vente aux enchères publique synchronisée, mise minimum, limite de budget, prolongation de 15 secondes en fin d'enchère, clôture par l'hôte après le timer.
- Effectif et onze titulaire, classement, journées de points saisies manuellement par l'hôte, gains virtuels.
- **Pas encore de catalogue officiel des joueurs de Ligue 1**, ni d'import automatique des performances réelles : le marché de démonstration est fictif et explicitement marqué comme tel. La saisie manuelle des points est également indiquée comme non vérifiée.
- **Une base PostgreSQL est obligatoire pour conserver les clubs sur Render au-delà des redémarrages**. Sans `DATABASE_URL`, stockage local JSON temporaire : Render peut perdre ces données.

## Déploiement

1. Sauvegarder le dépôt GitHub actuel.
2. Envoyer à la racine du dépôt le contenu de l'archive en conservant le dossier `public` (pas les fichiers à plat), en remplaçant les fichiers correspondants. Les nouveaux fichiers sont `foot-manager.js`, `public/foot.html`, `public/foot.css`, `public/foot.js` et ce guide.
3. Render > Settings : Build Command `npm install` ; Start Command `npm start` ; `git push` déclenche le déploiement si l'auto-déploiement est actif.
4. **Avant de créer des clubs durables**, créer une base PostgreSQL et ajouter `DATABASE_URL` à l'environnement du service web. Attention : l'offre Render PostgreSQL et sa durée de conservation dépendent du forfait et des conditions en vigueur ; vérifier le prix avant d'activer.
5. Test : créer une ligue, la rejoindre depuis un deuxième téléphone, ouvrir une enchère, enchérir, attendre la fin, clôturer et vérifier le budget ainsi que la visibilité du joueur dans l'effectif.

## Limites et prochaine étape

Pour que les joueurs de Ligue 1 rapportent des points correspondant aux **vrais matchs du week-end**, il faut acquérir/brancher une API autorisée contenant les effectifs et les statistiques détaillées de match, contrôler ses tarifs et licences, importer les joueurs avec identifiants stables puis calculer les points à partir de données vérifiées. **Ne pas simuler cela en le présentant comme des résultats réels.**

Cette V1 est un prototype à tester, pas un produit validé en production ; sécurité, états de concurrence et tests à plusieurs téléphones restent à renforcer.
