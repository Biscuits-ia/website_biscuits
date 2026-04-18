# Système de Rendez-vous Bénévolat - Exemples & Bonnes Pratiques

## 🎯 Flux complet d'utilisation

### Scénario 1: Admin crée un lien et l'envoie par email

```typescript
// 1. Admin clique "Nouveau rendez-vous"
const response = await fetch('/api/appointments/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    candidate_email: 'john.doe@example.com',
    admin_notes: 'Candidature pour projet IA - 2 jours/semaine',
  }),
});

const appointment = await response.json();
// {
//   id: "uuid-123",
//   token: "a1b2c3d4...",
//   appointment_url: "https://biscuits.ai/rdv/a1b2c3d4...",
//   status: "pending",
//   expires_at: "2026-04-20T18:00:00Z",
//   ...
// }

// 2. Lien copié automatiquement → envoyer par email

// Email template:
const emailBody = `
Bonjour John,

Merci pour votre intérêt pour Biscuits IA !

Cliquez ici pour choisir un créneau de rendez-vous en visio:
${appointment.appointment_url}

⏰ Ce lien expire dans 48 heures.

À très bientôt!
L'équipe Biscuits IA
`;
```

### Scénario 2: Candidat réserve un créneau

```typescript
// 1. Candidat accède à /rdv/{token}
// → Frontend vérifie le token
const verification = await fetch(`/api/appointments/verify/${token}`);
const appointment = await verification.json();
// Status: "pending" → Afficher le calendrier

// 2. Récupère les créneaux disponibles
const slots = await fetch(
  `/api/appointments/available-slots?date=2026-04-19&timezone=Europe/Paris`
);
const slotsData = await slots.json();
// {
//   date: "2026-04-19",
//   timezone: "Europe/Paris",
//   slots: [
//     { time: "09:00", available: true },
//     { time: "09:30", available: true },
//     { time: "10:00", available: false }, // Réservé
//     ...
//   ],
//   available_count: 15
// }

// 3. Candidat sélectionne: date=2026-04-19, time=10:30, timezone=Europe/Paris
// 4. Confirme la réservation
const bookResponse = await fetch(`/api/appointments/${appointment.id}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    selected_date: '2026-04-19T10:30:00',
    selected_timezone: 'Europe/Paris',
  }),
});

const booked = await bookResponse.json();
// Status: "booked" → Afficher confirmation
```

### Scénario 3: Admin suit les rendez-vous

```typescript
// Admin va sur /dashboard/admin/appointments

// Frontend fetch tous les RDV:
const appointments = await fetch('/api/appointments/');
const list = await appointments.json();
// [
//   {
//     id: "uuid-123",
//     candidate_email: "john@example.com",
//     status: "booked",
//     selected_date: "2026-04-19T10:30:00",
//     expires_at: "2026-04-20T18:00:00Z",
//     created_at: "2026-04-18T10:00:00Z",
//     admin_notes: "Candidature pour projet IA",
//   },
//   ...
// ]

// Admin peut copier le lien, supprimer, ou noter des infos
```

---

## 🔧 Customisation avancée

### Modifier les créneaux horaires

```typescript
// src/pages/api/appointments/available-slots.ts

// Changement simple: paramètres de requête
// GET /api/appointments/available-slots?date=2026-04-19&start_hour=10&end_hour=17&duration_minutes=45

// Changement permanent: modifier le fichier
const startHour = 10;  // Au lieu de 9
const endHour = 17;    // Au lieu de 18
const durationMinutes = 45;  // Au lieu de 60
```

### Ajouter une whitelist de dates non disponibles

```typescript
// src/pages/api/appointments/available-slots.ts

const unavailableDates = ['2026-04-20', '2026-04-21']; // Week-ends, jours fériés

if (unavailableDates.includes(dateParam)) {
  return new Response(
    JSON.stringify({ error: 'Cette date n\'est pas disponible', slots: [] }),
    { status: 400, headers: { 'Content-Type': 'application/json' } }
  );
}
```

### Exclure certaines heures

```typescript
// src/components/react/AppointmentCalendar.tsx

// Dans les props:
interface AppointmentCalendarProps {
  blockedTimes?: string[];  // ["12:00", "13:00"]
}

// Dans le rendu:
{slots
  .filter(slot => !blockedTimes?.includes(slot.time))
  .map(slot => (...))}
```

### Ajouter une durée d'atelier

```typescript
// Si certains créneaux doivent être plus longs

const SLOT_DURATION = {
  'visio-court': 30,      // 30 min
  'visio-long': 60,       // 60 min
  'atelier-complet': 120, // 2h
};
```

---

## 📧 Intégration Email (Exemple Resend)

```typescript
// src/pages/api/appointments/[id].ts - Dans le PUT

import { Resend } from 'resend';

const resend = new Resend(import.meta.env.RESEND_API_KEY);

// Après confirmation du rendez-vous:
if (body.selected_date) {
  const formattedDate = new Date(body.selected_date).toLocaleString('fr-FR');
  
  await resend.emails.send({
    from: 'noreply@biscuits.ai',
    to: existingAppt.candidate_email,
    subject: '✅ Votre rendez-vous est confirmé',
    html: `
      <h2>Rendez-vous confirmé!</h2>
      <p>Date: ${formattedDate}</p>
      <p>Lien de la visio: https://meet.google.com/xxx (à générer)</p>
    `,
  });
}
```

---

## 🔗 Intégration Google Meet (Exemple)

```typescript
// Générer lien Google Meet automatiquement

import { google } from 'googleapis';

const calendar = google.calendar('v3');

const event = {
  summary: 'Rendez-vous Biscuits IA',
  description: existingAppt.admin_notes,
  start: {
    dateTime: body.selected_date,
    timeZone: body.selected_timezone,
  },
  end: {
    dateTime: new Date(new Date(body.selected_date).getTime() + 60 * 60000).toISOString(),
    timeZone: body.selected_timezone,
  },
  conferenceData: {
    createRequest: {
      requestId: `appointmentid-${existingAppt.id}`,
      conferenceSolutionKey: { type: 'hangoutsMeet' },
    },
  },
};

const response = await calendar.events.insert({
  calendarId: 'primary',
  resource: event,
  conferenceDataVersion: 1,
});

// Sauvegarder le lien Meet en DB
await supabase
  .from('volunteer_appointments')
  .update({ meet_url: response.data.conferenceData?.entryPoints?.[0].uri })
  .eq('id', id);
```

---

## 🛡️ Sécurité en production

### Rate limiting sur créneaux

```typescript
// Ajouter rate limit pour éviter les brute force

import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 10, // 10 tentatives
});

export const GET: APIRoute = limiter(async ({ request }) => {
  // ...
});
```

### Validation stricte du token

```typescript
// Vérifier que le token est au bon format

if (!isValidToken(token)) {
  return new Response(
    JSON.stringify({ error: 'Token invalide' }),
    { status: 400, headers: { 'Content-Type': 'application/json' } }
  );
}
```

### CORS pour la page publique

```typescript
// src/middleware.ts

export function onRequest(context, next) {
  // Permettre accès public sans auth
  if (context.request.url.includes('/rdv/')) {
    return next();
  }
  // Sinon vérifier auth
  return next();
}
```

---

## 📊 Statistiques & Monitoring

### Dashboard stats

```typescript
// src/pages/api/appointments/stats.ts

export const GET: APIRoute = async ({ request, cookies }) => {
  // Vérifier admin
  const supabase = createSupabaseClient({ request, cookies });
  
  const { count: totalCount } = await supabase
    .from('volunteer_appointments')
    .select('*', { count: 'exact' });

  const { count: bookedCount } = await supabase
    .from('volunteer_appointments')
    .select('*', { count: 'exact' })
    .eq('status', 'booked');

  const { count: expiredCount } = await supabase
    .from('volunteer_appointments')
    .select('*', { count: 'exact' })
    .eq('status', 'expired');

  return new Response(
    JSON.stringify({
      total: totalCount,
      booked: bookedCount,
      expired: expiredCount,
      conversion_rate: ((bookedCount / totalCount) * 100).toFixed(2) + '%',
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
```

---

## 🧪 Tests

### Test unitaire pour helpers

```typescript
// src/lib/appointmentHelpers.test.ts

import { describe, it, expect } from 'vitest';
import {
  generateSecureToken,
  isValidToken,
  getTimeUntilExpiry,
  buildAppointmentURL,
} from './appointmentHelpers';

describe('Appointment Helpers', () => {
  it('should generate a valid token', () => {
    const token = generateSecureToken();
    expect(isValidToken(token)).toBe(true);
  });

  it('should format expiry time correctly', () => {
    const futureDate = new Date(Date.now() + 2 * 60 * 60 * 1000); // +2h
    const result = getTimeUntilExpiry(futureDate.toISOString());
    expect(result.hours).toBe(2);
    expect(result.expired).toBe(false);
  });

  it('should build correct appointment URL', () => {
    const url = buildAppointmentURL('abc123', 'https://biscuits.ai');
    expect(url).toBe('https://biscuits.ai/rdv/abc123');
  });
});
```

### Test e2e

```typescript
// tests/appointments.e2e.ts

import { test, expect } from '@playwright/test';

test.describe('Appointment System', () => {
  test('should create and book an appointment', async ({ page }) => {
    // 1. Admin crée un lien
    await page.goto('/dashboard/admin/appointments');
    await page.click('button:has-text("+ Nouveau rendez-vous")');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.click('button:has-text("Créer le lien")');

    // 2. Candidat accède au lien
    const appointmentUrl = await page.url();
    const newPage = await page.context().newPage();
    await newPage.goto(appointmentUrl);

    // 3. Sélectionne et réserve
    await newPage.click('input[type="date"]');
    await newPage.fill('input[type="date"]', '2026-04-20');
    await newPage.click('button:has-text("09:00")');
    await newPage.click('button:has-text("Confirmer le rendez-vous")');

    // 4. Vérifie la confirmation
    await expect(newPage.locator('text=confirmé')).toBeVisible();
  });
});
```

---

## 📱 Responsive Design

L'UI est responsive grâce aux grid CSS. Sur mobile:
- Calendrier: 2 colonnes au lieu de 4
- Admin table: Affichage réduit avec actions sur clic
- Forms: Full-width avec meilleur spacing

---

## 🚀 Performance Tips

1. **Cacher le calendrier** après booking (useMemo)
2. **Lazy load** les créneaux seulement si date sélectionnée
3. **Pagination** si > 1000 rendez-vous en admin
4. **Indices SQL** sur `expires_at`, `token`, `status`
5. **CDN** pour assets statiques

---

## ✅ Checklist avant production

- [ ] CRON_SECRET généré et configuré
- [ ] Cron job testé (tous les expirés marqués)
- [ ] Emails de confirmation configurés
- [ ] Rate limiting activé
- [ ] CORS configuré
- [ ] RLS policies vérifiées
- [ ] Tokens au bon format (64 hex chars)
- [ ] Tests e2e passant
- [ ] Monitoring logs en place
- [ ] Backup DB réguliers

Vous êtes prêt! 🎉
