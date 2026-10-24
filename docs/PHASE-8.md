# Phase 8 — Modules transversaux

## État

**Partiellement réalisée.** Les modules réunion, bibliothèque, messagerie, calendrier, profil et aide sont présents. La visibilité des ressources de classe tient compte des enfants d'un parent, les ressources CLASS sans classe cible ne sont plus ouvertes à tout le monde, et les événements parent couvrent tous les enfants liés.

| Module | État du code | Écarts à fermer |
| --- | --- | --- |
| Réunions / Grada Vio | Création, présence, participant et salle UI/API. | Confirmer fournisseur média/WebRTC, audio seul, partage d'écran et appels réels. |
| Bibliothèque | Upload et visibilité PUBLIC/SCHOOL/CLASS/PRIVATE filtrés côté serveur. | Upload interrompu/reprise, résumé IA, cache offline et matrice rôle à tester. |
| Messagerie | Conversations, réponses, pièces jointes et événements temps réel prévus. | Envoi offline, accusés de réception et règles « qui écrit à qui » à tester par rôle. |
| Calendrier | API d'événements et calendrier mobile. | Cache offline des événements et rappels planifiés à terminer. |
| Profil | Modification des informations/préférences et déconnexion. | Vérifier nettoyage local, sessions/appareils et changement de mot de passe. |
| Aide | Centre d'aide par rôle présent. | Vérifier guide hors ligne et recherche mobile. |

## Checklist

- [ ] Contrôler visibilité PUBLIC/SCHOOL/CLASS/PRIVATE avec Admin, prof, élève, parent non lié et parent multi-enfants.
- [ ] Envoyer un message réseau coupé puis reconnecter; vérifier une seule copie.
- [ ] Faire une réunion portrait sur téléphone et vérifier microphone/caméra/audio seul.
- [ ] Modifier profil, quitter la session et contrôler la suppression des données sensibles locales.
- [ ] Ouvrir calendrier et aide sans réseau après premier chargement.
