# Intégration Système de Rendez-vous - Guide d'installation

## ✅ Étape 1 : Appliquer la migration SQL

Ouvrir **Supabase SQL Editor** et exécuter les migrations:

1. Aller sur: https://app.supabase.com → Votre projet
2. Aller dans **SQL Editor** → **New Query**
3. Copier et exécuter le contenu de `/supabase/migration/migration.sql`

**Ou via CLI:**
```bash
supabase db push
```

**Vérifier que la table a été créée:**
```sql
SELECT * FROM volunteer_appointments LIMIT 1;
```

---

## ✅ Étape 2 : Tester les API routes

Démarrer le serveur de développement:
```bash
npm run dev
```

Tester la création d'un rendez-vous (admin auth required):
```bash
curl -X POST http://localhost:3000/api/appointments/ \
  -H "Content-Type: application/json" \
  -d '{
    "candidate_email": "test@example.com",
    "admin_notes": "Candidature bénévolat"
  }'
```

---

## ✅ Étape 3 : Configurer les variables d'environnement

### Ajouter dans `.env.local`:
```env
# Cron secret - générer une clé aléatoire forte
CRON_SECRET=your-very-secret-random-key-min-32-chars
```

### Ajouter dans `.env.production` (Vercel/Netlify):
```env
CRON_SECRET=same-secret-as-above
```

---

## ✅ Étape 4 : Configurer le Cron Job

### Option A: Vercel (Recommandé si déployé sur Vercel)

Modifier `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/appointments/cron/expire",
      "schedule": "0 * * * *"
    }
  ]
}
```

Puis deployer:
```bash
vercel deploy --prod
```

### Option B: Supabase Cron (Si possible)

Dans **Supabase SQL Editor**, exécuter:
```sql
-- Installer extension pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Créer le job (toutes les heures)
SELECT cron.schedule('expire-volunteer-appointments', '0 * * * *',
  $$
  UPDATE public.volunteer_appointments
  SET status = 'expired'
  WHERE status = 'pending' AND expires_at < now()
  $$
);
```

### Option C: Service externe (pour test/dev)

Utiliser **EasyCron** ou équivalent:
- URL: `https://your-site.com/api/appointments/cron/expire`
- Method: POST
- Headers: `Authorization: Bearer {CRON_SECRET}`
- Frequency: Hourly

---

## ✅ Étape 5 : Tester le flux complet

### 1️⃣ Créer un rendez-vous en tant qu'admin

1. Aller sur `/dashboard/admin/appointments`
2. Cliquer **+ Nouveau rendez-vous**
3. Entrer (optionnel) email et notes
4. Cliquer **Créer le lien**
5. Lien est copié automatiquement

### 2️⃣ Accéder au lien en tant que candidat

1. Copier-coller le lien dans un nouvel onglet incognito
2. Voir le calendrier (30 prochains jours)
3. Sélectionner une date
4. Sélectionner une heure
5. Cliquer **Confirmer le rendez-vous**
6. Voir le message de confirmation

### 3️⃣ Vérifier dans l'admin

Retourner sur `/dashboard/admin/appointments`:
- Status doit être "Réservé"
- Date/heure doit être affichée
- Lien doit montrer "Expiré" en rouge

---

## ✅ Étape 6 : Customisation (Optionnel)

### Changer les créneaux disponibles

Modifier `src/pages/api/appointments/available-slots.ts`:
```typescript
const startHour = parseInt(url.searchParams.get('start_hour') || '9');      // ← Changer ici
const endHour = parseInt(url.searchParams.get('end_hour') || '18');        // ← Changer ici
const durationMinutes = parseInt(url.searchParams.get('duration_minutes') || '60');
```

### Changer l'expiration (48h)

Modifier `src/pages/api/appointments/index.ts`:
```typescript
const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000); // ← Changer la durée ici
```

### Ajouter plus de fuseaux horaires

Modifier `src/components/react/AppointmentCalendar.tsx`:
```typescript
<option value="Asia/Shanghai">Asia/Shanghai (UTC+8)</option>
<option value="America/Mexico_City">America/Mexico_City (UTC-6/-5)</option>
```

---

## ✅ Étape 7 : Ajouter le lien dans le Header/Navigation

Modifier `src/components/Header.astro` pour ajouter un lien "Rendez-vous" si Admin:

```astro
<li class="nav-item">
  <a href="/dashboard/admin/appointments" class="nav-link">
    Gestion rendez-vous
  </a>
</li>
```

---

## ✅ Étape 8 : Email de confirmation (Optionnel)

Pour envoyer des emails quand un rendez-vous est confirmé, modifier `src/pages/api/appointments/[id].ts`:

```typescript
// Après update, avant return
if (updateData.selected_date) {
  // Envoyer email via Supabase / SendGrid / Resend
  await sendConfirmationEmail({
    to: existingAppt.candidate_email,
    date: body.selected_date,
    link: appointment_url, // Lien Google Meet / Zoom
  });
}
```

---

## 📋 Checklist de déploiement

- [ ] Migration SQL appliquée
- [ ] Variables d'env configurées (CRON_SECRET)
- [ ] Cron job configuré (Vercel / Supabase / Externe)
- [ ] Flux complet testé (créer → confirmer → vérifier)
- [ ] Dashboard admin accessible et fonctionnel
- [ ] Lien public `/rdv/{token}` fonctionne
- [ ] Créneaux s'affichent correctement
- [ ] Status s'update après confirmation
- [ ] Tests d'expiration (attendre 48h ou modifier expires_at en DB)

---

## 🚀 Fichiers créés/modifiés

### Tables & Migrations
- ✅ `supabase/migration/migration.sql` - Table `volunteer_appointments` + RLS + Triggers

### API Routes
- ✅ `src/pages/api/appointments/index.ts` - GET/POST (list + create)
- ✅ `src/pages/api/appointments/[id].ts` - PUT/DELETE (update + delete)
- ✅ `src/pages/api/appointments/verify/[token].ts` - GET (verify token)
- ✅ `src/pages/api/appointments/available-slots.ts` - GET (list slots)
- ✅ `src/pages/api/appointments/cron/expire.ts` - POST (expiration job)

### Pages
- ✅ `src/pages/rdv/[token].astro` - Page publique de booking
- ✅ `src/pages/dashboard/admin/appointments.astro` - Dashboard admin

### Composants React
- ✅ `src/components/react/AppointmentCalendar.tsx` - Calendrier + booking UI
- ✅ `src/components/react/AdminAppointmentsDashboard.tsx` - Admin dashboard

### Types
- ✅ `src/types/appointments.ts` - Interfaces TypeScript

---

## 📞 Support / Troubleshooting

### Lien ne fonctionne pas
- Vérifier que le token existe en DB
- Vérifier que status n'est pas 'expired'
- Vérifier que expires_at > now()

### Créneaux ne s'affichent pas
- Vérifier les params: `date` en YYYY-MM-DD
- Vérifier que `timezone` est valide
- Vérifier qu'il n'y a pas d'erreur en console

### Admin dashboard vide
- Vérifier que l'utilisateur est authentifié
- Vérifier que le user a le role 'admin' en table `profiles`
- Vérifier les RLS policies en Supabase

### Cron ne s'exécute pas
- Vérifier le header `Authorization: Bearer {CRON_SECRET}`
- Vérifier que CRON_SECRET est configuré
- Vérifier les logs (Vercel/Netlify/Supabase)
- Tester manuellement avec curl

---

## ✨ Prêt à utiliser!

Le système est maintenant prêt. Vous pouvez:

1. Aller sur `/dashboard/admin/appointments` pour créer des liens
2. Partager les liens avec les candidats
3. Les candidats peuvent réserver leurs créneaux
4. L'admin peut suivre tous les rendez-vous

Bon courage! 🚀
