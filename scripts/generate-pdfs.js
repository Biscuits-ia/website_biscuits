// generate-pdfs.js — Génère les 4 PDF de ressources pour Biscuits IA
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

const OUT_DIR = path.resolve('public/ressources');
// Palette Biscuits IA — café/chocolat (issue de theme.css oklch → hex)
const PRIMARY = '#8f5a41'; // --color-primary  Moka
const PRIMARY_DARK = '#5e372a'; // --color-primary-dark  Espresso
const LATTE = '#cea26a'; // --color-second  Latte
const CARAMEL = '#d7954b'; // --color-accent-caramel
const HONEY = '#e3b667'; // --color-accent-honey
const CREAM = '#f3ebd5'; // --color-accent-cream
const VANILLA = '#f9f5e6'; // --color-accent-vanilla
const CINNAMON = '#904527'; // --color-accent-cinnamon
const BORDER = '#351d15'; // --color-border
const TEXT = '#2c1a14'; // --color-text
const TEXT_LIGHT = '#56433a'; // --color-text-light

// ── Helpers ──────────────────────────────────────────────────────────────────

function newDoc() {
  return new PDFDocument({ size: 'A4', margin: 50, info: { Producer: 'Biscuits IA' } });
}

function header(doc, title, subtitle) {
  // Bandeau de titre (fond espresso + bordure inférieure caramel)
  doc.rect(0, 0, doc.page.width, 90).fill(PRIMARY_DARK);
  doc.rect(0, 88, doc.page.width, 4).fill(CARAMEL);
  doc.fontSize(9).fillColor(HONEY).font('Helvetica').text('biscuits-ia.fr', 50, 15);
  doc.fontSize(20).fillColor(CREAM).font('Helvetica-Bold').text(title, 50, 30, { width: 500 });
  doc.fontSize(10).fillColor(LATTE).font('Helvetica').text(subtitle, 50, 65, { width: 500 });
  doc.y = 110;
}

function footer(doc, pageNum) {
  const y = doc.page.height - 40;
  doc.rect(0, y - 10, doc.page.width, 50).fill(CREAM);
  doc.rect(0, y - 10, doc.page.width, 2).fill(CARAMEL);
  doc
    .fontSize(8)
    .fillColor(TEXT_LIGHT)
    .font('Helvetica')
    .text('© 2026 Biscuits IA — biscuits-ia.fr', 50, y, { align: 'left' })
    .text(`Page ${pageNum}`, 0, y, { align: 'right', width: doc.page.width - 50 });
}

function sectionTitle(doc, text) {
  doc.moveDown(0.6);
  doc.rect(50, doc.y, doc.page.width - 100, 24).fill(CREAM);
  doc.rect(50, doc.y, 4, 24).fill(PRIMARY);
  doc
    .fontSize(12)
    .fillColor(PRIMARY_DARK)
    .font('Helvetica-Bold')
    .text(text, 62, doc.y + 6);
  doc.moveDown(0.8);
}

function checkItem(doc, text, checked = false) {
  const x = 58;
  const y = doc.y;
  // Checkbox néo-brutaliste
  doc
    .rect(x, y + 1, 10, 10)
    .lineWidth(1.5)
    .strokeColor(BORDER)
    .stroke();
  if (checked) {
    doc
      .fontSize(9)
      .fillColor(PRIMARY)
      .text('✓', x + 1, y);
  }
  doc
    .fontSize(10)
    .fillColor(TEXT)
    .font('Helvetica')
    .text(text, x + 16, y, { width: 470 });
  doc.moveDown(0.45);
}

function bulletItem(doc, text, indent = 0) {
  const x = 60 + indent;
  doc.circle(x, doc.y + 5, 3).fill(CARAMEL);
  doc
    .fontSize(10)
    .fillColor(TEXT)
    .font('Helvetica')
    .text(text, x + 10, doc.y, { width: 470 - indent });
  doc.moveDown(0.4);
}

function warningBox(doc, text) {
  const y = doc.y;
  const approxHeight = 28 + Math.ceil(text.length / 85) * 14;
  doc.rect(50, y, doc.page.width - 100, approxHeight).fill(HONEY);
  doc.rect(50, y, 4, approxHeight).fill(CINNAMON);
  doc
    .fontSize(9.5)
    .fillColor(PRIMARY_DARK)
    .font('Helvetica-Bold')
    .text('⚠  ' + text, 62, y + 9, { width: 470 });
  doc.moveDown(1.2);
}

function infoBox(doc, text) {
  const y = doc.y;
  const approxHeight = 28 + Math.ceil(text.length / 80) * 14;
  doc.rect(50, y, doc.page.width - 100, approxHeight).fill(VANILLA);
  doc.rect(50, y, 4, approxHeight).fill(PRIMARY);
  doc
    .fontSize(9.5)
    .fillColor(PRIMARY_DARK)
    .font('Helvetica')
    .text(text, 62, y + 9, { width: 470 });
  doc.moveDown(1.4);
}

function bodyText(doc, text) {
  doc
    .fontSize(10)
    .fillColor(TEXT)
    .font('Helvetica')
    .text(text, 58, doc.y, { width: 490, align: 'justify' });
  doc.moveDown(0.5);
}

// ── 1. Checklist Anti-Arnaque ─────────────────────────────────────────────────

function generateChecklistAntiArnaque() {
  const doc = newDoc();
  const out = fs.createWriteStream(path.join(OUT_DIR, 'checklist-anti-arnaque.pdf'));
  doc.pipe(out);

  header(
    doc,
    'Checklist Anti-Arnaque Numérique',
    'Protégez votre association des fraudes en ligne — Biscuits IA 2026'
  );

  sectionTitle(doc, '1. Arnaque au virement (fraude au président)');
  bodyText(
    doc,
    'Ce type de fraude cible les trésoriers et directeurs financiers. Un fraudeur se fait passer pour un dirigeant et demande un virement urgent et confidentiel.'
  );
  checkItem(doc, 'Mettre en place une procédure de double validation pour tout virement > 500 €');
  checkItem(doc, "Vérifier l'identité de l'émetteur par un appel téléphonique sur un numéro connu");
  checkItem(doc, 'Ne jamais effectuer un virement en urgence sans vérification physique ou vocale');
  checkItem(doc, 'Former les membres habilités aux paiements à reconnaître ce schéma');
  checkItem(doc, 'Définir une liste restreinte des personnes autorisées à valider des virements');

  sectionTitle(doc, '2. Phishing et faux e-mails');
  bodyText(
    doc,
    'Des e-mails imitant des organismes officiels (CAF, URSSAF, banques, Impôts) tentent de voler vos identifiants ou de vous faire télécharger un malware.'
  );
  checkItem(
    doc,
    "Vérifier l'adresse e-mail complète de l'expéditeur (pas seulement le nom affiché)"
  );
  checkItem(
    doc,
    'Ne jamais cliquer sur un lien dans un e-mail inattendu — aller directement sur le site officiel'
  );
  checkItem(doc, 'Signaler les e-mails suspects à phishing@cyber.gouv.fr');
  checkItem(doc, "Activer l'authentification à deux facteurs (2FA) sur toutes les boîtes mail");
  checkItem(
    doc,
    'Utiliser un gestionnaire de mots de passe (Bitwarden, KeePass) pour des mots de passe uniques'
  );

  warningBox(doc, 'Un organisme officiel ne vous demandera JAMAIS votre mot de passe par e-mail.');

  sectionTitle(doc, '3. Faux prestataires et fausses factures');
  checkItem(doc, "Vérifier l'existence légale du prestataire sur societe.com ou infogreffe.fr");
  checkItem(doc, 'Rappeler le prestataire sur un numéro indépendant de la facture reçue');
  checkItem(doc, 'Comparer le RIB avec celui des factures précédentes avant tout paiement');
  checkItem(
    doc,
    'Mettre en place un registre des fournisseurs habituels et alerter en cas de nouveau RIB'
  );
  checkItem(doc, 'Ne jamais répondre à une relance de paiement sans consulter la comptabilité');

  sectionTitle(doc, "4. Faux appels aux dons et usurpation d'identité");
  checkItem(doc, "Déposer votre nom/logo auprès de l'INPI pour vous protéger juridiquement");
  checkItem(doc, 'Surveiller régulièrement votre nom sur Google Alerts');
  checkItem(doc, "Informer votre réseau immédiatement en cas d'usurpation détectée");
  checkItem(doc, 'Signaler tout site frauduleux sur signal-spam.fr ou phishing-initiative.eu');
  checkItem(
    doc,
    'Vérifier que votre association est bien référencée sur le répertoire officiel data.gouv.fr'
  );

  sectionTitle(doc, '5. Sécurité des accès numériques');
  checkItem(doc, 'Utiliser des mots de passe longs (>14 caractères) et uniques par service');
  checkItem(
    doc,
    'Activer la double authentification sur : e-mail, réseaux sociaux, site web, banque'
  );
  checkItem(doc, "Révoquer les accès des membres qui quittent l'association dans les 48h");
  checkItem(doc, 'Ne pas partager les mots de passe par SMS ou messagerie non chiffrée');
  checkItem(doc, 'Faire une revue semestrielle des accès administrateurs de tous vos outils');

  infoBox(
    doc,
    "En cas de fraude avérée : portez plainte au commissariat, contactez votre banque dans l'heure et signalez sur cybermalveillance.gouv.fr"
  );

  footer(doc, 1);
  doc.end();
  return new Promise((resolve) => out.on('finish', resolve));
}

// ── 2. Guide Phishing pour Associations ──────────────────────────────────────

function generateGuidePhishing() {
  const doc = newDoc();
  const out = fs.createWriteStream(path.join(OUT_DIR, 'guide-phishing-associations.pdf'));
  doc.pipe(out);

  header(
    doc,
    'Guide Anti-Phishing pour Associations',
    "Reconnaître, éviter et réagir face aux tentatives d'hameçonnage — Biscuits IA 2026"
  );

  sectionTitle(doc, "Qu'est-ce que le phishing ?");
  bodyText(
    doc,
    'Le phishing (hameçonnage) est une technique de cyberattaque où des fraudeurs se font passer pour une entité de confiance (banque, administration, plateforme connue) afin de voler des informations sensibles : identifiants, coordonnées bancaires, données personnelles.'
  );
  bodyText(
    doc,
    'Les associations sont des cibles de choix car elles gèrent des données de bénéficiaires, des financements publics et ont souvent des équipes bénévoles moins formées à la cybersécurité.'
  );

  sectionTitle(doc, '1. Reconnaître un e-mail de phishing');
  bulletItem(
    doc,
    "L'adresse expéditeur ne correspond pas au domaine officiel (ex: contact@impots-remboursement.com)"
  );
  bulletItem(doc, 'Ton urgent ou menaçant : "Votre compte sera suspendu dans 24h"');
  bulletItem(doc, "Fautes d'orthographe ou de grammaire inhabituelles");
  bulletItem(doc, 'Lien hypertexte qui pointe vers un domaine différent du texte affiché');
  bulletItem(doc, 'Pièce jointe inattendue (.zip, .exe, .docm, .xlsm)');
  bulletItem(doc, "Demande d'informations personnelles ou financières par e-mail");
  bulletItem(doc, "Logo ou charte graphique légèrement différente de l'original");

  warningBox(
    doc,
    "Vérifiez TOUJOURS l'URL en survolant le lien avant de cliquer. Ne faites pas confiance au nom affiché."
  );

  sectionTitle(doc, "2. Les types d'attaques les plus courants en 2026");
  bulletItem(doc, "Phishing classique — faux e-mail d'une administration ou banque");
  bulletItem(doc, 'Spear phishing — e-mail ciblé avec votre nom, poste ou contexte réel');
  bulletItem(doc, 'Smishing — SMS frauduleux (ex: faux avis de livraison, fausse amende)');
  bulletItem(doc, 'Vishing — appel téléphonique imitant votre banque ou la police');
  bulletItem(doc, 'QR Code phishing — QR code dans un flyer ou e-mail renvoyant vers un faux site');
  bulletItem(doc, 'Fausses plateformes de subventions — copie de France Relance, FONJEP...');

  sectionTitle(doc, '3. Checklist de réaction immédiate');
  checkItem(doc, 'Ne pas cliquer sur les liens, ne pas ouvrir les pièces jointes');
  checkItem(doc, 'Signaler l\'e-mail via le bouton "Signaler comme phishing" de votre messagerie');
  checkItem(doc, "Transférer l'e-mail à phishing@cyber.gouv.fr (ANSSI)");
  checkItem(doc, 'Si vous avez cliqué : changer immédiatement le mot de passe du compte concerné');
  checkItem(
    doc,
    'Si données bancaires saisies : appeler votre banque en urgence et bloquer la carte'
  );
  checkItem(doc, 'Signaler sur signal-spam.fr ou phishing-initiative.eu');
  checkItem(doc, "Prévenir le reste de l'équipe pour éviter qu'ils ne tombent dans le même piège");

  sectionTitle(doc, '4. Bonnes pratiques préventives');
  checkItem(doc, 'Former tous les membres à reconnaître un phishing (session 30 min/an minimum)');
  checkItem(doc, 'Activer la double authentification sur toutes les boîtes mail professionnelles');
  checkItem(doc, 'Utiliser un filtre anti-spam professionnel (ex: Mailinblack, Vade Secure)');
  checkItem(doc, 'Activer DMARC, DKIM et SPF sur votre domaine de messagerie');
  checkItem(doc, 'Tester vos équipes avec des simulations de phishing (GoPhish, KnowBe4)');
  checkItem(doc, 'Tenir un registre des incidents de sécurité, même mineurs');

  infoBox(
    doc,
    'Ressource officielle : cybermalveillance.gouv.fr — Assistance gratuite aux particuliers et associations victimes de cybercriminalité.'
  );

  sectionTitle(doc, '5. Configuration technique recommandée');
  bulletItem(
    doc,
    'SPF : enregistrement DNS qui liste les serveurs autorisés à envoyer en votre nom'
  );
  bulletItem(doc, 'DKIM : signature cryptographique ajoutée à chaque e-mail sortant');
  bulletItem(
    doc,
    "DMARC : politique déclarant ce que les destinataires doivent faire en cas d'échec SPF/DKIM"
  );
  bulletItem(doc, "HTTPS obligatoire sur votre site (certificat SSL Let's Encrypt = gratuit)");
  bulletItem(doc, 'Filtre de contenu sur les navigateurs des postes de travail');

  footer(doc, 1);
  doc.end();
  return new Promise((resolve) => out.on('finish', resolve));
}

// ── 3. Checklist RGPD ────────────────────────────────────────────────────────

function generateChecklistRGPD() {
  const doc = newDoc();
  const out = fs.createWriteStream(path.join(OUT_DIR, 'checklist-rgpd.pdf'));
  doc.pipe(out);

  header(
    doc,
    'Checklist RGPD pour Associations',
    'Mise en conformité Règlement Général sur la Protection des Données — Biscuits IA 2026'
  );

  bodyText(
    doc,
    "Le RGPD s'applique à TOUTE association qui collecte ou traite des données personnelles de personnes physiques dans l'UE. Une mise en conformité n'est pas optionnelle : les amendes peuvent atteindre 2 % du budget annuel."
  );

  sectionTitle(doc, '1. Cartographie des données (obligatoire)');
  checkItem(doc, 'Tenir un Registre des Activités de Traitement (RAT) à jour');
  checkItem(
    doc,
    'Identifier toutes les données personnelles collectées (noms, e-mails, téléphones, santé…)'
  );
  checkItem(
    doc,
    'Documenter la finalité de chaque traitement (pourquoi collectez-vous ces données ?)'
  );
  checkItem(
    doc,
    'Identifier la base légale de chaque traitement (consentement, contrat, intérêt légitime…)'
  );
  checkItem(
    doc,
    'Recenser tous les sous-traitants qui accèdent à vos données (hébergeur, CRM, prestataire…)'
  );
  checkItem(doc, 'Définir la durée de conservation pour chaque catégorie de données');

  sectionTitle(doc, '2. Droits des personnes');
  checkItem(
    doc,
    'Informer les personnes lors de la collecte (politique de confidentialité accessible)'
  );
  checkItem(doc, "Prévoir une procédure pour répondre aux demandes d'accès dans les 30 jours");
  checkItem(doc, 'Permettre la rectification des données inexactes');
  checkItem(doc, "Permettre la suppression des données sur demande (droit à l'effacement)");
  checkItem(doc, 'Permettre la portabilité des données (export dans un format lisible)');
  checkItem(doc, 'Mettre en place un mécanisme de retrait du consentement simple et accessible');

  warningBox(
    doc,
    'Le consentement doit être libre, éclairé, spécifique et univoque. Une case pré-cochée est INVALIDE.'
  );

  sectionTitle(doc, '3. Sécurité des données');
  checkItem(doc, 'Chiffrer les bases de données contenant des données personnelles');
  checkItem(
    doc,
    'Sauvegarder les données régulièrement (règle 3-2-1 : 3 copies, 2 supports, 1 hors site)'
  );
  checkItem(doc, "Limiter l'accès aux données selon le principe du moindre privilège");
  checkItem(doc, "Tracer les accès aux données sensibles (journaux d'audit)");
  checkItem(
    doc,
    "Protéger les échanges d'e-mails contenant des données personnelles (chiffrement)"
  );
  checkItem(doc, 'Mettre à jour régulièrement tous les logiciels et plugins utilisés');

  sectionTitle(doc, '4. En cas de violation de données');
  checkItem(doc, 'Détecter et documenter tout incident touchant des données personnelles');
  checkItem(doc, 'Notifier la CNIL dans les 72h si risque pour les personnes concernées');
  checkItem(doc, 'Informer les personnes concernées si le risque est élevé');
  checkItem(doc, 'Tenir un registre interne des violations (même celles non notifiées)');
  checkItem(doc, 'Analyser les causes et mettre en place des mesures correctives');

  sectionTitle(doc, '5. Contrats et sous-traitance');
  checkItem(doc, 'Signer un DPA (Data Processing Agreement) avec chaque sous-traitant');
  checkItem(doc, 'Vérifier que les sous-traitants hors UE offrent des garanties équivalentes');
  checkItem(
    doc,
    'Ne transférer des données hors UE que vers des pays adéquats ou avec des garanties (SCC)'
  );
  checkItem(doc, 'Vérifier les clauses RGPD dans les CGU des outils utilisés (Google, Mailchimp…)');

  sectionTitle(doc, '6. Documents obligatoires');
  checkItem(doc, 'Registre des Activités de Traitement (RAT)');
  checkItem(doc, 'Politique de confidentialité publiée sur le site web');
  checkItem(doc, 'Mentions légales complètes');
  checkItem(doc, "Mentions d'information lors de chaque collecte de données");
  checkItem(doc, 'Contrats de sous-traitance avec les prestataires');
  checkItem(doc, "Analyses d'impact (AIPD) pour les traitements à risque élevé");

  infoBox(
    doc,
    'Ressource officielle : cnil.fr/fr/les-outils-de-la-conformite — La CNIL propose des modèles de registre et de politique de confidentialité gratuits adaptés aux associations.'
  );

  footer(doc, 1);
  doc.end();
  return new Promise((resolve) => out.on('finish', resolve));
}

// ── 4. Outils Open Source Associations 2026 ──────────────────────────────────

function generateOutilsOpenSource() {
  const doc = newDoc();
  const out = fs.createWriteStream(path.join(OUT_DIR, 'outils-open-source-associations-2026.pdf'));
  doc.pipe(out);

  header(
    doc,
    'Outils Open Source pour Associations',
    'Sélection 2026 — Outils gratuits et respectueux des données — Biscuits IA'
  );

  bodyText(
    doc,
    'Ce guide recense les meilleurs outils open source et gratuits pour les associations en 2026. Tous respectent le RGPD et peuvent être auto-hébergés ou utilisés en SaaS. Une alternative éthique et souveraine à chaque outil propriétaire.'
  );

  sectionTitle(doc, '1. Communication interne & messagerie');
  bulletItem(
    doc,
    'Element / Matrix — Messagerie chiffrée de bout en bout, alternative à Slack/Teams'
  );
  bulletItem(doc, '  → Idéal pour les échanges confidentiels, hébergeable sur vos serveurs', 14);
  bulletItem(doc, "Rocket.Chat — Plateforme de messagerie d'équipe open source");
  bulletItem(doc, '  → Plus de 30 fonctionnalités, intégrations avec Nextcloud et GitLab', 14);
  bulletItem(doc, 'Mattermost — Alternative à Teams, très adaptée aux structures avec SI interne');

  sectionTitle(doc, '2. Gestion de projet & collaboration');
  bulletItem(
    doc,
    'Nextcloud — Suite bureautique complète (fichiers, agenda, visio, notes, tableur)'
  );
  bulletItem(doc, '  → Hébergeables chez Infomaniak, Hetzner ou sur votre serveur', 14);
  bulletItem(doc, 'Gitea / Forgejo — Gestion de code source et de projets techniques');
  bulletItem(doc, 'Taiga — Gestion de projet agile (Kanban, Scrum) très intuitive');
  bulletItem(doc, 'OpenProject — Gestion de projets complexes avec jalons, ressources, rapports');
  bulletItem(doc, 'Framapad — Éditeur collaboratif en ligne (par Framasoft, 100 % français)');

  sectionTitle(doc, '3. Site web & CMS');
  bulletItem(doc, 'WordPress — Le CMS le plus populaire, gratuit, milliers de thèmes associatifs');
  bulletItem(
    doc,
    'Astro — Générateur de sites statiques ultra-performant (utilisé par Biscuits IA !)'
  );
  bulletItem(doc, 'Ghost — Blog/newsletter open source, excellente alternative à Substack');
  bulletItem(doc, 'Grav — CMS sans base de données, idéal pour les petites structures');
  bulletItem(doc, 'Odoo Community — ERP complet incluant un site web e-commerce');

  sectionTitle(doc, '4. Gestion des membres & CRM');
  bulletItem(doc, 'CiviCRM — CRM open source spécialement conçu pour les associations et ONG');
  bulletItem(
    doc,
    "  → Gestion des adhérents, dons, événements, envois d'e-mails, compatible WordPress",
    14
  );
  bulletItem(doc, 'Dolibarr — ERP/CRM complet, gratuit, adapté aux associations et PME');
  bulletItem(doc, '  → Gestion des cotisations, devis, factures, projets, congés', 14);
  bulletItem(doc, 'Paheko — Logiciel de gestion associative français, conforme RGPD');

  sectionTitle(doc, '5. Newsletter & communication externe');
  bulletItem(doc, 'Listmonk — Newsletter auto-hébergée, interface moderne, haute performance');
  bulletItem(doc, 'Mautic — Marketing automation open source (alternative à Mailchimp/HubSpot)');
  bulletItem(doc, 'phpList — Envoi de newsletters simple et léger, très utilisé en associatif');

  sectionTitle(doc, '6. Visioconférence');
  bulletItem(
    doc,
    'Jitsi Meet — Visioconférence sans compte, chiffrée, hébergée par Framasoft (Framatalk)'
  );
  bulletItem(
    doc,
    "BigBlueButton — Plateforme d'enseignement en ligne avec tableau blanc, quiz, sondages"
  );
  bulletItem(doc, 'Galène — Serveur de visioconférence léger, idéal pour petites équipes');

  sectionTitle(doc, '7. Comptabilité & finances');
  bulletItem(doc, 'GNU Cash — Logiciel de comptabilité libre, adapté aux comptes associatifs');
  bulletItem(doc, 'Dolibarr (module compta) — Comptabilité complète intégrée à la gestion');
  bulletItem(doc, 'Paheko — Comptabilité associative simplifiée avec plan comptable associatif');

  sectionTitle(doc, '8. Sécurité & protection des données');
  bulletItem(doc, 'Bitwarden — Gestionnaire de mots de passe open source, auto-hébergeable');
  bulletItem(doc, 'Vaultwarden — Version légère de Bitwarden pour petit serveur');
  bulletItem(doc, 'KeePassXC — Gestionnaire de mots de passe local, sans cloud');
  bulletItem(doc, 'Cryptomator — Chiffrement de dossiers cloud (Google Drive, Nextcloud...)');
  bulletItem(doc, 'VeraCrypt — Chiffrement de disques et volumes portables');

  infoBox(
    doc,
    "Conseil Biscuits IA : commencez par Nextcloud (fichiers + agenda + visio) et Bitwarden (mots de passe). Ces deux outils couvrent 80 % des besoins numériques d'une association et peuvent être configurés en une journée."
  );

  sectionTitle(doc, '9. Ressources pour aller plus loin');
  bulletItem(doc, "Framasoft — framasoft.org — Catalogue d'outils libres en français");
  bulletItem(doc, 'CHATONS — chatons.org — Hébergeurs alternatifs éthiques en France');
  bulletItem(doc, 'Socio-GISS — Accompagnement numérique des associations');
  bulletItem(doc, 'Numérique en Commun[s] — numerique-en-communs.fr — Ressources pour asso');

  footer(doc, 1);
  doc.end();
  return new Promise((resolve) => out.on('finish', resolve));
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log('Génération des PDFs...');
await generateChecklistAntiArnaque();
console.log('✓ checklist-anti-arnaque.pdf');
await generateGuidePhishing();
console.log('✓ guide-phishing-associations.pdf');
await generateChecklistRGPD();
console.log('✓ checklist-rgpd.pdf');
await generateOutilsOpenSource();
console.log('✓ outils-open-source-associations-2026.pdf');
console.log('Tous les PDFs ont été générés dans public/ressources/');
