-- =============================================================================
-- Biscuits IA - Seed backlog Association (Modules A-E + Infrastructure)
-- Compatible avec public.tasks (task_management_full.sql)
-- =============================================================================

-- 1) Sprint de reference (idempotent)
INSERT INTO public.sprints (
  name,
  goal,
  start_date,
  end_date,
  status,
  velocity_target,
  velocity_actual
)
SELECT
  'Backlog Association MVP',
  'Planifier et suivre les taches des modules A-E et de l infrastructure',
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '90 days',
  'active',
  240,
  0
WHERE NOT EXISTS (
  SELECT 1 FROM public.sprints WHERE name = 'Backlog Association MVP'
);

-- 2) Insertion des taches (idempotent par title)
WITH sprint_ref AS (
  SELECT id
  FROM public.sprints
  WHERE name = 'Backlog Association MVP'
  ORDER BY created_at DESC
  LIMIT 1
)
INSERT INTO public.tasks (
  title,
  description,
  corps,
  task_type,
  priority,
  status,
  sprint_id,
  tags
)
SELECT
  backlog.title,
  backlog.description,
  backlog.corps,
  backlog.task_type,
  backlog.priority,
  'todo'::task_status,
  backlog.sprint_id,
  backlog.tags
FROM (
  VALUES
    -- =====================================================================
    -- Module A - Gestion des adherents (MVP)
    -- =====================================================================
    (
      'A-DB-001 Creer table adherents',
      'Definir id, nom, prenom, email unique RFC 5322, telephone, adresse, date_adhesion, statut enum, tags.',
      'DB'::corps_type,
      'modeling'::task_type_enum,
      'P0'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-a','db','adherents']
    ),
    (
      'A-DB-002 Creer table adherent_historiques',
      'Stocker champ_modifie, ancienne_valeur, nouvelle_valeur, timestamp et utilisateur_id.',
      'DB'::corps_type,
      'migration'::task_type_enum,
      'P1'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-a','db','audit']
    ),
    (
      'A-DB-003 Creer tables groupes et adherent_groupes',
      'Permettre creation de groupes et association des adherents via table de liaison.',
      'DB'::corps_type,
      'modeling'::task_type_enum,
      'P1'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-a','db','groupes']
    ),
    (
      'A-DB-004 Creer tables roles et utilisateur_roles',
      'Definir roles admin, tresorier, lecture seule et leurs associations RBAC.',
      'DB'::corps_type,
      'modeling'::task_type_enum,
      'P0'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-a','db','rbac']
    ),
    (
      'A-BE-001 API CRUD adherents',
      'Implementer GET/POST/PUT/DELETE sur /adherents.',
      'DEV'::corps_type,
      'feature'::task_type_enum,
      'P0'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-a','backend','api']
    ),
    (
      'A-BE-002 Validation email telephone serveur',
      'Ajouter validation stricte RFC 5322 pour emails et validation telephone.',
      'DEV'::corps_type,
      'feature'::task_type_enum,
      'P0'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-a','backend','validation']
    ),
    (
      'A-BE-003 Endpoint historique adherent',
      'Implementer GET /adherents/{id}/historique.',
      'DEV'::corps_type,
      'feature'::task_type_enum,
      'P1'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-a','backend','historique']
    ),
    (
      'A-BE-004 Endpoints groupes',
      'Implementer POST /groupes et GET /groupes/{id}/adherents.',
      'DEV'::corps_type,
      'feature'::task_type_enum,
      'P1'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-a','backend','groupes']
    ),
    (
      'A-BE-005 Mettre en place RBAC',
      'Restreindre acces endpoints selon role via middleware ou decorateurs.',
      'DEV'::corps_type,
      'feature'::task_type_enum,
      'P0'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-a','backend','rbac']
    ),
    (
      'A-BE-006 Endpoint recherche et filtres adherents',
      'Implementer GET /adherents/search full-text et filtres statut/date/groupes.',
      'DEV'::corps_type,
      'feature'::task_type_enum,
      'P1'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-a','backend','search']
    ),
    (
      'A-FE-001 Formulaire reactif adherent',
      'Creer formulaire ajout/modification adherent avec validation client.',
      'DESIGN'::corps_type,
      'prototype'::task_type_enum,
      'P1'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-a','frontend','form']
    ),
    (
      'A-FE-002 Liste paginee adherents',
      'Afficher liste avec tri et filtres statut/date/groupes.',
      'DESIGN'::corps_type,
      'wireframe'::task_type_enum,
      'P1'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-a','frontend','liste']
    ),
    (
      'A-FE-003 Barre recherche full-text adherents',
      'Ajouter recherche temps reel avec suggestions.',
      'DESIGN'::corps_type,
      'prototype'::task_type_enum,
      'P2'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-a','frontend','search']
    ),
    (
      'A-FE-004 Interface historique adherent',
      'Afficher chronologie des modifications sur une fiche adherent.',
      'DESIGN'::corps_type,
      'wireframe'::task_type_enum,
      'P2'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-a','frontend','historique']
    ),
    (
      'A-FE-005 Interface gestion groupes',
      'Permettre creation, suppression, et gestion des membres de groupes.',
      'DESIGN'::corps_type,
      'prototype'::task_type_enum,
      'P2'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-a','frontend','groupes']
    ),
    (
      'A-IO-001 Endpoint import adherents',
      'Developper POST /adherents/import pour CSV/Excel.',
      'DEV'::corps_type,
      'etl_pipeline'::task_type_enum,
      'P1'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-a','import-export','import']
    ),
    (
      'A-IO-002 Endpoint export adherents',
      'Developper GET /adherents/export pour CSV/Excel.',
      'DEV'::corps_type,
      'reporting'::task_type_enum,
      'P1'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-a','import-export','export']
    ),
    (
      'A-IO-003 UI import export adherents',
      'Ajouter formulaire import avec mapping de colonnes et bouton export.',
      'DESIGN'::corps_type,
      'handoff'::task_type_enum,
      'P2'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-a','frontend','import-export']
    ),

    -- =====================================================================
    -- Module B - Gestion des cotisations (MVP)
    -- =====================================================================
    (
      'B-DB-001 Creer table cotisations',
      'Definir montant>0, periode enum, date_echeance, methode_paiement enum, statut enum.',
      'DB'::corps_type,
      'modeling'::task_type_enum,
      'P0'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-b','db','cotisations']
    ),
    (
      'B-DB-002 Creer table paiements',
      'Stocker cotisation_id, date_paiement, montant, methode, utilisateur_id.',
      'DB'::corps_type,
      'migration'::task_type_enum,
      'P0'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-b','db','paiements']
    ),
    (
      'B-DB-003 Creer table relances',
      'Suivre date_envoi, type email/SMS et statut des relances.',
      'DB'::corps_type,
      'modeling'::task_type_enum,
      'P1'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-b','db','relances']
    ),
    (
      'B-BE-001 API CRUD cotisations',
      'Implementer GET/POST/PUT/DELETE sur /cotisations.',
      'DEV'::corps_type,
      'feature'::task_type_enum,
      'P0'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-b','backend','api']
    ),
    (
      'B-BE-002 Marquer cotisation comme payee',
      'Developper POST /cotisations/{id}/payer et enregistrer paiement.',
      'DEV'::corps_type,
      'feature'::task_type_enum,
      'P0'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-b','backend','paiement']
    ),
    (
      'B-BE-003 Generer recu fiscal PDF',
      'Generer recu conforme Cerfa 11580*04 via WeasyPrint ou ReportLab.',
      'DEV'::corps_type,
      'reporting'::task_type_enum,
      'P1'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-b','backend','pdf']
    ),
    (
      'B-BE-004 Automatiser relances cotisations en retard',
      'Configurer cron ou Celery pour envoi automatique.',
      'DEV'::corps_type,
      'feature'::task_type_enum,
      'P1'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-b','backend','relances']
    ),
    (
      'B-BE-005 Creer templates emails relance',
      'Definir templates avec variables prenom, montant, date_echeance.',
      'PM'::corps_type,
      'documentation'::task_type_enum,
      'P2'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-b','backend','email']
    ),
    (
      'B-BE-006 Endpoint stats cotisations',
      'Developper GET /cotisations/stats pour taux de renouvellement et totaux encaisses.',
      'DATA'::corps_type,
      'dashboard'::task_type_enum,
      'P1'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-b','backend','stats']
    ),
    (
      'B-FE-001 Formulaire cotisations',
      'Formulaire ajout/modification cotisation avec pickers date et validation.',
      'DESIGN'::corps_type,
      'prototype'::task_type_enum,
      'P1'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-b','frontend','form']
    ),
    (
      'B-FE-002 Liste cotisations avec filtres',
      'Lister cotisations avec filtres statut, periode, adherent.',
      'DESIGN'::corps_type,
      'wireframe'::task_type_enum,
      'P1'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-b','frontend','liste']
    ),
    (
      'B-FE-003 Bouton Marquer comme paye',
      'Permettre passage en paye et generation recu fiscal.',
      'DESIGN'::corps_type,
      'handoff'::task_type_enum,
      'P2'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-b','frontend','paiement']
    ),
    (
      'B-FE-004 Afficher stats cotisations',
      'Afficher graphiques avec Chart.js ou Recharts.',
      'DESIGN'::corps_type,
      'prototype'::task_type_enum,
      'P2'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-b','frontend','charts']
    ),

    -- =====================================================================
    -- Module C - Comptabilite simplifiee (MVP)
    -- =====================================================================
    (
      'C-DB-001 Creer table operations',
      'Definir id, date, libelle, montant, categorie_id, type recette/depense.',
      'DB'::corps_type,
      'modeling'::task_type_enum,
      'P0'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-c','db','operations']
    ),
    (
      'C-DB-002 Creer table categories_comptables',
      'Definir nom, nature charge/produit, code_comptable classe 1-7.',
      'DB'::corps_type,
      'modeling'::task_type_enum,
      'P0'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-c','db','categories']
    ),
    (
      'C-DB-003 Creer table budget_previsionnel',
      'Stocker annee, categorie_id et montant_prevu.',
      'DB'::corps_type,
      'migration'::task_type_enum,
      'P1'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-c','db','budget']
    ),
    (
      'C-DB-004 Creer vue SQL ecarts budget reel',
      'Calculer ecarts entre budget previsionnel et operations reelles.',
      'DB'::corps_type,
      'reporting'::task_type_enum,
      'P1'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-c','db','vue']
    ),
    (
      'C-BE-001 API CRUD operations comptables',
      'Implementer GET/POST/PUT/DELETE sur /operations.',
      'DEV'::corps_type,
      'feature'::task_type_enum,
      'P0'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-c','backend','api']
    ),
    (
      'C-BE-002 Import CSV OFX operations',
      'Developper POST /operations/import pour CSV/OFX.',
      'DEV'::corps_type,
      'etl_pipeline'::task_type_enum,
      'P1'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-c','backend','import']
    ),
    (
      'C-BE-003 Generer bilan simplifie PDF',
      'Developper GET /comptabilite/bilan pour produire le PDF.',
      'DEV'::corps_type,
      'reporting'::task_type_enum,
      'P1'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-c','backend','pdf']
    ),
    (
      'C-BE-004 Verifier conformite plan comptable associatif',
      'Controler coherence des classes 1-7 et alerter sur incoherences.',
      'QA'::corps_type,
      'functional_test'::task_type_enum,
      'P1'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-c','backend','compliance']
    ),
    (
      'C-BE-005 Endpoint stats comptables',
      'Developper GET /comptabilite/stats pour agregats par categorie/type.',
      'DATA'::corps_type,
      'dashboard'::task_type_enum,
      'P1'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-c','backend','stats']
    ),
    (
      'C-FE-001 Formulaire operations comptables',
      'Formulaire ajout/modification operation.',
      'DESIGN'::corps_type,
      'prototype'::task_type_enum,
      'P1'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-c','frontend','form']
    ),
    (
      'C-FE-002 Liste operations avec filtres',
      'Lister operations avec filtres date, categorie, type.',
      'DESIGN'::corps_type,
      'wireframe'::task_type_enum,
      'P1'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-c','frontend','liste']
    ),
    (
      'C-FE-003 Bouton import CSV OFX',
      'Permettre import des operations depuis fichiers CSV/OFX.',
      'DESIGN'::corps_type,
      'handoff'::task_type_enum,
      'P2'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-c','frontend','import']
    ),
    (
      'C-FE-004 Afficher budget previsionnel vs reel',
      'Comparer budget et reel via tableaux et graphiques.',
      'DESIGN'::corps_type,
      'prototype'::task_type_enum,
      'P2'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-c','frontend','budget']
    ),
    (
      'C-FE-005 Bouton generation bilan PDF',
      'Permettre telechargement du bilan comptable en PDF.',
      'DESIGN'::corps_type,
      'handoff'::task_type_enum,
      'P2'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-c','frontend','pdf']
    ),

    -- =====================================================================
    -- Module D - Reporting (MVP)
    -- =====================================================================
    (
      'D-BE-001 Endpoint dashboard KPIs',
      'Developper GET /dashboard avec total adherents, nouveaux inscrits, recettes du mois, cotisations en retard.',
      'DATA'::corps_type,
      'dashboard'::task_type_enum,
      'P1'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-d','backend','dashboard']
    ),
    (
      'D-BE-002 Endpoint export CSV PDF',
      'Creer GET /export/{type} pour export adherents et comptabilite.',
      'DEV'::corps_type,
      'reporting'::task_type_enum,
      'P1'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-d','backend','export']
    ),
    (
      'D-BE-003 Endpoint stats graphiques',
      'Developper GET /stats/graphiques pour alimenter le frontend.',
      'DATA'::corps_type,
      'dashboard'::task_type_enum,
      'P1'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-d','backend','stats']
    ),
    (
      'D-FE-001 Tableau de bord widgets dynamiques',
      'Afficher KPIs sous forme de widgets interactifs.',
      'DESIGN'::corps_type,
      'design_system'::task_type_enum,
      'P1'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-d','frontend','dashboard']
    ),
    (
      'D-FE-002 Integrer Chart.js Recharts',
      'Afficher evolution adherents, caisses mensuelles et autres series.',
      'DESIGN'::corps_type,
      'prototype'::task_type_enum,
      'P2'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-d','frontend','charts']
    ),
    (
      'D-FE-003 Boutons export CSV PDF dashboard',
      'Permettre export des donnees visibles dans dashboard et rapports.',
      'DESIGN'::corps_type,
      'handoff'::task_type_enum,
      'P2'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-d','frontend','export']
    ),

    -- =====================================================================
    -- Module E - Optionnels (V2)
    -- =====================================================================
    (
      'E-OPT-001 Gestion evenements tables et endpoints',
      'Creer structures et API calendrier, inscriptions, billets PDF.',
      'DEV'::corps_type,
      'feature'::task_type_enum,
      'P2'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-e','optionnel','evenements']
    ),
    (
      'E-OPT-002 UI calendrier et inscription evenement',
      'Integrer calendrier, formulaire d inscription et limite de places.',
      'DESIGN'::corps_type,
      'prototype'::task_type_enum,
      'P2'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-e','optionnel','evenements-ui']
    ),
    (
      'E-OPT-003 Integration Stripe PayPal dons',
      'Developper POST /dons pour paiements via Stripe ou PayPal.',
      'DEV'::corps_type,
      'feature'::task_type_enum,
      'P2'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-e','optionnel','paiement']
    ),
    (
      'E-OPT-004 Formulaire de don frontend',
      'Ajouter formulaire de don avec parcours de paiement securise.',
      'DESIGN'::corps_type,
      'prototype'::task_type_enum,
      'P2'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-e','optionnel','don-ui']
    ),
    (
      'E-OPT-005 Integration Listmonk Mailjet newsletters',
      'Developper POST /newsletter pour envoi de newsletters.',
      'DEV'::corps_type,
      'feature'::task_type_enum,
      'P2'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-e','optionnel','newsletter']
    ),
    (
      'E-OPT-006 Interface newsletters',
      'Permettre gestion des listes de diffusion et envoi des newsletters.',
      'DESIGN'::corps_type,
      'wireframe'::task_type_enum,
      'P2'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-e','optionnel','newsletter-ui']
    ),
    (
      'E-OPT-007 API publique REST GraphQL',
      'Creer endpoints securises pour applications tierces.',
      'DEV'::corps_type,
      'feature'::task_type_enum,
      'P2'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-e','optionnel','api-publique']
    ),
    (
      'E-OPT-008 Multi-associations',
      'Permettre gestion multi-associations via tables associations et liaisons.',
      'DB'::corps_type,
      'modeling'::task_type_enum,
      'P2'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['module-e','optionnel','multi-tenant']
    ),

    -- =====================================================================
    -- Infrastructure & Securite
    -- =====================================================================
    (
      'I-SEC-001 Configurer Supabase tables et roles',
      'Mettre en place PostgreSQL, Supabase Auth, tables et permissions necessaires.',
      'DB'::corps_type,
      'migration'::task_type_enum,
      'P0'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['infra','security','supabase']
    ),
    (
      'I-SEC-002 Authentification OAuth2 OIDC',
      'Configurer Supabase Auth ou Keycloak pour authentification utilisateurs.',
      'DEV'::corps_type,
      'feature'::task_type_enum,
      'P0'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['infra','security','auth']
    ),
    (
      'I-SEC-003 Implementer 2FA roles sensibles',
      'Ajouter 2FA pour roles admin et tresorier.',
      'DEV'::corps_type,
      'feature'::task_type_enum,
      'P1'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['infra','security','2fa']
    ),
    (
      'I-SEC-004 Chiffrer donnees sensibles en base',
      'Utiliser AES-256 pour champs sensibles (ex SI).',
      'DB'::corps_type,
      'optimization'::task_type_enum,
      'P1'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['infra','security','encryption']
    ),
    (
      'I-OPS-001 Conteneuriser application Docker',
      'Creer Dockerfiles et docker-compose pour frontend, backend, PostgreSQL, MinIO.',
      'DEV'::corps_type,
      'feature'::task_type_enum,
      'P1'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['infra','devops','docker']
    ),
    (
      'I-OPS-002 Configurer CI GitHub Actions GitLab CI',
      'Automatiser lint, tests et deploiement via pipeline CI/CD.',
      'DEV'::corps_type,
      'automated_test'::task_type_enum,
      'P1'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['infra','devops','ci-cd']
    ),
    (
      'I-OPS-003 Automatiser backups PostgreSQL',
      'Mettre en place sauvegardes quotidiennes pg_dump vers MinIO ou S3.',
      'DB'::corps_type,
      'backup'::task_type_enum,
      'P1'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['infra','devops','backup']
    ),
    (
      'I-OPS-004 Deployer Prometheus et Grafana',
      'Mettre en place monitoring des metriques applicatives.',
      'DATA'::corps_type,
      'dashboard'::task_type_enum,
      'P2'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['infra','monitoring','observability']
    ),
    (
      'I-OPS-005 Configurer alertes seuils critiques',
      'Envoyer notifications email/Slack sur seuils CPU, erreurs 5xx, etc.',
      'DATA'::corps_type,
      'reporting'::task_type_enum,
      'P2'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['infra','monitoring','alerting']
    ),
    (
      'I-DOC-001 Rediger documentation technique',
      'Produire README detaille, schemas architecture et docs API OpenAPI.',
      'PM'::corps_type,
      'documentation'::task_type_enum,
      'P1'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['infra','documentation','tech']
    ),
    (
      'I-DOC-002 Rediger documentation utilisateur',
      'Produire guides installation, tutoriels et exemples d usage.',
      'PM'::corps_type,
      'documentation'::task_type_enum,
      'P2'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['infra','documentation','user']
    ),
    (
      'I-QA-001 Effectuer tests de securite',
      'Executer OWASP ZAP et corriger vulnerabilites detectees.',
      'QA'::corps_type,
      'functional_test'::task_type_enum,
      'P1'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['infra','security','owasp']
    ),
    (
      'I-QA-002 Verifier conformite WCAG 2.1 AA',
      'Verifier accessibilite: contrastes, ARIA, navigation clavier, semantique.',
      'QA'::corps_type,
      'release_validation'::task_type_enum,
      'P1'::priority_level,
      'backlog'::task_status,
      (SELECT id FROM sprint_ref),
      ARRAY['infra','quality','accessibility']
    )
) AS backlog (
  title,
  description,
  corps,
  task_type,
  priority,
  status,
  sprint_id,
  tags
)
WHERE NOT EXISTS (
  SELECT 1 FROM public.tasks t WHERE t.title = backlog.title
);

-- 3) Normalisation: mettre toutes les taches du backlog Association en "A faire"
UPDATE public.tasks t
SET status = 'todo'::task_status
WHERE t.title ~ '^(A|B|C|D|E|I)-'
  AND t.status <> 'todo'::task_status;

-- 4) Rattacher les taches au projet cible si la colonne project_id existe
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tasks'
      AND column_name = 'project_id'
  ) THEN
    UPDATE public.tasks t
    SET project_id = '9f3434b2-8bf8-4988-ab7e-b7e4295f7036'::uuid
    WHERE t.title ~ '^(A|B|C|D|E|I)-'
      AND t.project_id IS DISTINCT FROM '9f3434b2-8bf8-4988-ab7e-b7e4295f7036'::uuid;
  END IF;
END $$;
