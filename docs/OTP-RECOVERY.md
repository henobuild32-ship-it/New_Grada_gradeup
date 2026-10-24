# Récupération du mot de passe par OTP

## Fonctionnement

1. L'utilisateur demande un code depuis l'écran « Mot de passe oublié ».
2. GradeUp identifie le compte par email. Le parcours par nom exige un code école
   valide et ne fonctionne que si un seul compte actif correspond dans cette école.
3. Le code numérique à six chiffres est envoyé à l'adresse enregistrée. Sa valeur
   n'est jamais conservée en clair en base : seul son hash salé est stocké.
4. Le code expire après 10 minutes, est limité à cinq essais erronés et ne peut
   être remplacé que par un nouveau code.
5. Le changement du mot de passe, la consommation du code et la révocation des
   anciennes sessions sont effectués dans la même transaction PostgreSQL.

Les réponses de demande ne confirment pas si le compte existe. Les limites sont
appliquées par IP et par identité; elles utilisent `RateLimitBucket` quand la
migration est appliquée et retombent sur une limite locale temporaire avant cela.

## Configuration email en production

Définir `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` et
`SMTP_FROM` dans les variables Vercel de l'environnement Production. L'expéditeur
doit être autorisé par le fournisseur. Les secrets ne doivent pas être inscrits
dans ce fichier, dans le dépôt ou dans les journaux.

## Vérification de recette

- Demander un code pour un compte connu et confirmer la réception, dont le dossier
  indésirable et l'adresse expéditrice.
- Vérifier qu'une identité inconnue reçoit la même confirmation de demande.
- Tester un code incorrect cinq fois, le délai de 10 minutes, un code remplacé et
  un code déjà consommé.
- Réinitialiser avec un code valide, vérifier que l'ancien mot de passe échoue,
  que le nouveau fonctionne, et que les sessions d'avant la réinitialisation
  obtiennent `401` au prochain appel/API refresh.
- Contrôler les erreurs SMTP et `429` sans jamais journaliser le code ni les
  secrets de configuration.

Les scénarios de livraison SMTP en production nécessitent une vraie boîte de
recette; ils ne sont pas réputés testés par un build local.
