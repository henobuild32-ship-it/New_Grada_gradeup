# Phase 7 — Parent

## État

**Partiellement réalisée.** Le sélecteur d'enfants est persisté; notes, bulletins publiés, frais, paiements et présence utilisent des requêtes liées à l'enfant sélectionné. La lecture des soldes parent a été étendue à toutes les devises et la dernière sélection de frais peut être consultée hors ligne. Les accès de localisation ont été resserrés par école et par lien parent-enfant; le calendrier inclut désormais les classes de tous les enfants liés.

| Module | État du code | Écarts à fermer |
| --- | --- | --- |
| Dashboard/enfants | Sélection persistante et données par enfant présentes. | Vérifier changements d'enfant et parent à plusieurs enfants en session. |
| Notes/bulletins | Lectures parent-scopées; bulletin canonique publié, PDF/cache local. | PDF officiel complet et partage WhatsApp à vérifier sur téléphone. |
| Paiements | Solde, échéancier, historique, reçu PDF et cache offline. | Paiement numérique externe, rappels planifiés et intégration finance en recette. |
| Présence/justificatif | Suivi et workflow de justification disponibles; localisation par enfant autorisée côté serveur. | Envoi de justificatif préparé hors ligne et décision à vérifier; géolocalisation partagée à valider avec la politique de consentement de l'école. |
| IA/notifications | Assistant et centre de notifications présents. | Push/SMS parent et préférences de canal non testés avec fournisseur. |

## Checklist ownership

- [ ] Avec un compte parent lié à deux enfants, changer d'enfant et confirmer toutes les données.
- [ ] Tenter un `studentId` non lié sur `/api/tuition`, `/api/grades`, `/api/bulletins`, `/api/location` et justificatifs.
- [ ] Déposer un justificatif sans réseau puis synchroniser; vérifier décision et notification.
- [ ] Téléverser le PDF bulletin/reçu, le rouvrir hors ligne puis le partager via Web Share.
