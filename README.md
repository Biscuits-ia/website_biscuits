# 🍪 Biscuits AI

Biscuits AI est une plateforme orientée **développeurs & créateurs** proposant des **starter-kits production-ready**, des outils d'automatisation et des solutions SaaS pour accélérer la création de projets web et applicatifs modernes.

Le projet s'adresse aux **vibe coders**, indépendants, startups et équipes techniques souhaitant gagner du temps tout en respectant les **meilleures pratiques 2025** (sécurité, performance, CI/CD, SEO, typage strict).

---

## 🚀 Stack principale

### Frontend
- **Astro 5+** (Static + Islands)
- **React / TypeScript strict**
- **Tailwind CSS + DaisyUI**
- **SEO avancé & Lighthouse 100/100**

### Backend
- **Laravel 12 – Breeze API**
- **Auth API sécurisée (tokens, rôles)**
- **Stripe / Mollie (paiement)**

### Base de données
- **PostgreSQL**
- **RLS (Row Level Security)**
- **Migrations & seeds**

### DevOps & Sécurité
- GitHub Actions (CI/CD)
- Docker
- MFA, WebAuthn / FIDO2
- Headers de sécurité
- Audit & monitoring

---

## ✨ Fonctionnalités principales

- ✅ Starter-kits SaaS prêts à l'emploi
- ✅ Authentification sécurisée (JWT, MFA)
- ✅ Dashboard Admin
- ✅ Système de paiement
- ✅ Facturation & devis
- ✅ Gestion des utilisateurs & rôles
- ✅ API REST moderne
- ✅ SEO avancé
- ✅ Architecture scalable

---

## 📦 Installation

### Prérequis
- Node.js >= 20
- PHP >= 8.3
- Composer
- PostgreSQL
- Docker (optionnel)

---

### 1. Frontend (Astro)

```bash
cd frontend
npm install
npm run dev
```

Build production :

```bash
npm run build
```

---

### 2. Backend (Laravel)

```bash
cd backend
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate --seed
php artisan serve
```

---

### 3. Variables d'environnement

#### Frontend
```env
PUBLIC_API_URL=http://localhost:8000
```

#### Backend
```env
APP_NAME=Biscuits AI
APP_ENV=local
APP_KEY=
APP_DEBUG=true
DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=biscuits
DB_USERNAME=postgres
DB_PASSWORD=
STRIPE_KEY=
STRIPE_SECRET=
```

---

## 🧠 Philosophie du projet

Biscuits AI repose sur une vision simple :

> **Accélérer la création de produits tech fiables, performants et sécurisés sans sacrifier la qualité.**

Les starter-kits sont conçus pour être :
- 🔒 Sécurisés
- ⚡ Rapides
- 🧩 Modulaires
- 🛠️ Facilement personnalisables
- 📈 Prêts pour le business

---

## 📊 Typage & Qualité

- TypeScript strict
- ESLint + Prettier
- Tests unitaires & API
- Convention Git flow stricte

---

## 🧑‍💻 Auteur

Projet développé par **Alexis Gallard**

- Marke : **Biscuits AI**
- Écosystème : Optea Tech
- Orientation : Dev, SaaS, Sécurité, IA

---

## 📄 Licence

Projet propriétaire – Tous droits réservés.
Toute reproduction ou redistribution sans autorisation est interdite.

---

## 📬 Contact

- 🌐 Site : https://biscuitsdev.com (à venir)
- 💬 Discord : en cours
- 📧 Email : contact@biscuitsdev.com

---

## 🛣️ Roadmap (extrait)

- [ ] Marketplace de plugins
- [ ] Starter-kit mobile (React Native)
- [ ] Offres entreprise
- [ ] Automatisation IA
- [ ] Multi-tenant SaaS

---

> 🍪 **Biscuits AI – Le code qui croustille en production.**

