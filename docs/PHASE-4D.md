# Phase 4D — Administration : présence, notifications et IA

## État

**Partiellement réalisée.** Le tableau de présence dispose de statistiques, filtres, exports et coordonnées école. Les annonces ciblent l'école, un rôle ou une classe. Gradie montre désormais que l'IA n'est pas disponible hors ligne et conserve le texte non envoyé.

| Module | Résultat actuel | Reste à fermer |
| --- | --- | --- |
| `admin-presence` | Vue présence/historique, absentéisme, export, config GPS; scan QR admin ajouté avec détection caméra `BarcodeDetector` sur navigateurs compatibles, saisie manuelle et file locale hors ligne; doublons bloqués en base, actions auditées. Le pointage GPS exige maintenant des coordonnées valides quand le périmètre est configuré. | Vérifier compatibilité caméra sur Android/iOS, rayon GPS réel et alertes automatiques parent en parcours complet. |
| `admin-notifications` | Annonces ciblées école/rôle/classe/utilisateur précis, envoi in-app/realtime et trace d'audit. | Planification, SMS/email, suivi remise/ouverture et retry prestataire. |
| `admin-ai` | Gradie en ligne; statut/erreur réseau clarifiés; panneau de signaux calculés depuis les notes, présences 30 j et échéances réelles; cache mémoire 5 min isolé par utilisateur pour réponses exactes sans action, limite 20 requêtes/minute. Les actions IA admin passent par une session active, ont une limite dédiée, une trace d'audit et contrôles tenant/conflit. | Quota distribué multi-instance, intégration fournisseur, recette sécurité des actions IA et validation des signaux avec les responsables de classe. |

## Checklist mobile/offline

- [ ] Vérifier vue présence en cartes à 360 px et filtres accessibles.
- [ ] Pointer par QR sur caméra mobile puis couper le réseau et synchroniser sans doublon.
- [ ] Tester GPS hors rayon, permission refusée, coordonnées erronées et absence de GPS.
- [ ] Publier vers classe/rôle et confirmer les seuls destinataires ciblés.
- [ ] Vérifier remise/ouverture, push et SMS/email si les prestataires sont configurés.
- [ ] Passer Gradie hors ligne : libellé clair et message conservé dans le champ.

Le navigateur CUA a répondu que l'accès local est désactivé malgré l'activation annoncée par l'utilisateur. Le code du scan caméra et de la file offline est en place, mais caméra, GPS réel, push mobile et écrans authentifiés ne sont donc pas déclarés testés. Les navigateurs sans `BarcodeDetector` peuvent utiliser le lecteur QR externe/saisie manuelle.

## Vérifications exécutées

- `npx tsc --noEmit`, `npm run lint -- --quiet`, `npm run build` et `git diff --check` : réussis.
- Tests RBAC et recette GPS/caméra : non exécutés; serveur local et navigateur mobile indisponibles.
