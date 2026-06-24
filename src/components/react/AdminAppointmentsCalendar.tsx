// src/components/react/AdminAppointmentsCalendar.tsx
//
// Vue calendrier des rendez-vous pour l'admin.
// - Grille mensuelle 7×6
// - Cellules colorées selon le nb de RDV par statut + badge "créneau dispo"
// - Navigation mois précédent / suivant
// - Clic sur un jour → modale de détail qui affiche :
//     * les RDV existants du jour
//     * les créneaux disponibles (slots) du jour
//     * un formulaire inline pour AJOUTER un nouveau créneau sur ce jour précis
//     * un bouton supprimer par créneau
//
// Données : /api/admin/appointments (RDV) + /api/appointment-slots (slots dispo).
// Anti-overlap déjà géré côté serveur (cf. src/pages/api/appointment-slots.ts POST).

import { Component, useCallback, useEffect, useMemo, useState, type ErrorInfo, type ReactNode } from 'react';
import type { VolunteerAppointment, AppointmentSlot, AppointmentStatus } from '@/types/appointments';

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MONTH_LABELS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  pending:   'En attente',
  confirmed: 'Confirmé',
  cancelled: 'Annulé',
};

const STATUS_COLORS: Record<AppointmentStatus, string> = {
  pending:   '#E89A3C',  // warn (orange)
  confirmed: '#3D5A47',  // ok   (vert)
  cancelled: '#9A7E5A',  // muted (gris)
};

interface CalendarAppointment {
  id: string;
  status: AppointmentStatus;
  start_time: string; // ISO
  end_time: string;   // ISO
  notes?: string | null;
  candidate_email?: string | null;
  user_profile?: { full_name: string | null; email: string | null } | null;
}

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** Renvoie une matrice 7×6 de dates (lundi = 0) pour le mois contenant `d`. */
function buildMonthGrid(d: Date): Date[] {
  const first = startOfMonth(d);
  // Lundi = 0 … Dimanche = 6. getUTCDay() renvoie 0=dimanche, on remap.
  const firstWeekday = (first.getUTCDay() + 6) % 7;
  const cells: Date[] = [];
  // Commence au lundi précédent (ou le 1er si c'est un lundi)
  for (let i = 0; i < 42; i++) {
    const day = new Date(first);
    day.setUTCDate(first.getUTCDate() - firstWeekday + i);
    cells.push(day);
  }
  return cells;
}

function isSameDayUTC(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear()
    && a.getUTCMonth() === b.getUTCMonth()
    && a.getUTCDate() === b.getUTCDate();
}

function toDateKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function formatTimeUTC(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/** Convertit une date YYYY-MM-DD + heure HH:mm en ISO UTC. */
function toIsoFromDateAndTime(dateKey: string, time: string): string {
  return new Date(`${dateKey}T${time}:00.000Z`).toISOString();
}

// ── ErrorBoundary : capture les crashes React et les affiche au lieu de
// laisser la zone vide. Particulièrement utile quand un import ou un hook
// plante au mount (ex: erreur d'hydratation SSR/CSR).
interface ErrorBoundaryProps { children: ReactNode; }
interface ErrorBoundaryState { error: Error | null; }
class CalendarErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };
  static getDerivedStateFromError(error: Error): ErrorBoundaryState { return { error }; }
  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[AdminAppointmentsCalendar] crash:', error, info);
  }
  override render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="appts-cal-fatal">
          <h3>❌ Le calendrier n'a pas pu se charger.</h3>
          <pre>{this.state.error.message}</pre>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => location.reload()}>
            Recharger la page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function AdminAppointmentsCalendarInner() {
  // ── Anti SSR/CSR mismatch ─────────────────────────────────────────────
  // `new Date()` au moment du SSR fige l'instant serveur ; à l'hydratation
  // client, le composant reçoit un `today` légèrement différent → React 19
  // peut planter en mode strict. On attend donc le mount client avant
  // d'afficher la grille.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState<Date>(() => startOfMonth(today));
  const [appointments, setAppointments] = useState<CalendarAppointment[]>([]);
  const [slots, setSlots] = useState<AppointmentSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  // Form state pour l'ajout de créneau inline
  const [newSlotStart, setNewSlotStart] = useState('09:00');
  const [newSlotEnd,   setNewSlotEnd]   = useState('10:00');
  const [addingSlot,   setAddingSlot]   = useState(false);
  const [addError,     setAddError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Charge en parallèle : RDV (admin) + tous les slots (admin only, retourne aussi
      // les créneaux is_available=false, ce qu'on veut pour l'aperçu mensuel).
      const [apptsRes, slotsRes] = await Promise.all([
        fetch('/api/admin/appointments', {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        }),
        fetch('/api/appointment-slots', {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        }),
      ]);

      if (!apptsRes.ok) {
        const text = await apptsRes.text();
        throw new Error(`Erreur ${apptsRes.status} (RDV) : ${text}`);
      }
      if (!slotsRes.ok) {
        const text = await slotsRes.text();
        throw new Error(`Erreur ${slotsRes.status} (créneaux) : ${text}`);
      }

      const rawAppts: Array<VolunteerAppointment & { appointment_slots?: AppointmentSlot | null }> = await apptsRes.json();
      const rawSlots: AppointmentSlot[] = await slotsRes.json();

      const flat: CalendarAppointment[] = ((rawAppts ?? [])
        .map((a): CalendarAppointment | null => {
          const slot = a.appointment_slots;
          if (!slot) return null; // pas de slot = pas affichable
          return {
            id: a.id,
            status: a.status,
            start_time: slot.start_time,
            end_time: slot.end_time,
            notes: a.notes,
            candidate_email: a.candidate_email,
            user_profile: a.user_profile,
          };
        })
        .filter((x): x is CalendarAppointment => x !== null));

      setAppointments(flat);
      setSlots(Array.isArray(rawSlots) ? rawSlots : []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur';
      setError(msg);
      setAppointments([]);
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Index appointments et slots par date (YYYY-MM-DD UTC)
  const apptsByDay = useMemo(() => {
    const map = new Map<string, CalendarAppointment[]>();
    for (const a of appointments) {
      const key = toDateKey(new Date(a.start_time));
      const list = map.get(key);
      if (list) list.push(a);
      else map.set(key, [a]);
    }
    for (const list of map.values()) {
      list.sort((x, y) => Date.parse(x.start_time) - Date.parse(y.start_time));
    }
    return map;
  }, [appointments]);

  const slotsByDay = useMemo(() => {
    const map = new Map<string, AppointmentSlot[]>();
    for (const s of slots) {
      const key = toDateKey(new Date(s.start_time));
      const list = map.get(key);
      if (list) list.push(s);
      else map.set(key, [s]);
    }
    for (const list of map.values()) {
      list.sort((x, y) => Date.parse(x.start_time) - Date.parse(y.start_time));
    }
    return map;
  }, [slots]);

  const cells = useMemo(() => buildMonthGrid(cursor), [cursor]);
  const monthLabel = `${MONTH_LABELS[cursor.getUTCMonth()]} ${cursor.getUTCFullYear()}`;

  const goPrev = () => {
    const d = new Date(cursor);
    d.setUTCMonth(d.getUTCMonth() - 1);
    setCursor(startOfMonth(d));
    setSelectedDay(null);
  };
  const goNext = () => {
    const d = new Date(cursor);
    d.setUTCMonth(d.getUTCMonth() + 1);
    setCursor(startOfMonth(d));
    setSelectedDay(null);
  };
  const goToday = () => {
    setCursor(startOfMonth(today));
    openDay(today);
  };

  // Quand on change de jour, on pré-remplit le formulaire avec des horaires
  // cohérents (09:00 → 10:00 par défaut).
  const openDay = (d: Date) => {
    setSelectedDay(d);
    setAddError(null);
    setNewSlotStart('09:00');
    setNewSlotEnd('10:00');
  };

  // ── Ajout d'un créneau ─────────────────────────────────────────────────────
  const submitNewSlot = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedDay) return;
    if (!newSlotStart || !newSlotEnd) {
      setAddError('Veuillez saisir une heure de début et de fin.');
      return;
    }
    if (newSlotStart >= newSlotEnd) {
      setAddError('L\'heure de fin doit être après l\'heure de début.');
      return;
    }
    setAddingSlot(true);
    setAddError(null);
    const dateKey = toDateKey(selectedDay);
    try {
      const res = await fetch('/api/appointment-slots', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_time: toIsoFromDateAndTime(dateKey, newSlotStart),
          end_time:   toIsoFromDateAndTime(dateKey, newSlotEnd),
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        try {
          const json = JSON.parse(text);
          throw new Error(json.error || text || 'Erreur de création');
        } catch {
          throw new Error(text || 'Erreur de création');
        }
      }
      window.showToast?.('Créneau ajouté', 'success');
      // Avance l'heure de début à l'heure de fin pour faciliter la création
      // de créneaux consécutifs (09:00-10:00 → 10:00-11:00 par défaut).
      setNewSlotStart(newSlotEnd);
      const [eh, em] = newSlotEnd.split(':').map(Number);
      const nextEnd = `${String(Math.min(eh + 1, 23)).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
      setNewSlotEnd(nextEnd);
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur';
      setAddError(msg);
      window.showToast?.(msg, 'error');
    } finally {
      setAddingSlot(false);
    }
  };

  // ── Suppression d'un créneau ───────────────────────────────────────────────
  const deleteSlot = async (slotId: string) => {
    if (!window.showConfirm) {
      const ok = window.confirm('Supprimer ce créneau ?');
      if (!ok) return;
    } else {
      const ok = await window.showConfirm({
        title: 'Supprimer ce créneau',
        message: 'Cette action est définitive. Si un utilisateur a réservé ce créneau, sa réservation sera également supprimée.',
        confirmLabel: 'Supprimer',
        danger: true,
      });
      if (!ok) return;
    }
    try {
      const res = await fetch(`/api/appointment-slots/${slotId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Erreur de suppression');
      }
      window.showToast?.('Créneau supprimé', 'success');
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur';
      window.showToast?.(msg, 'error');
    }
  };

  const selectedAppointments = selectedDay ? (apptsByDay.get(toDateKey(selectedDay)) ?? []) : [];
  const selectedSlots = selectedDay ? (slotsByDay.get(toDateKey(selectedDay)) ?? []) : [];

  if (!mounted) {
    // Pendant le SSR et jusqu'à l'hydratation, on affiche un placeholder
    // neutre pour éviter tout mismatch React 19 sur les dates.
    return (
      <div className="appts-cal appts-cal-pending">
        <div className="appts-cal-loading">Préparation du calendrier…</div>
      </div>
    );
  }

  return (
    <div className="appts-cal">
      <div className="appts-cal-toolbar">
        <div className="appts-cal-nav">
          <button type="button" className="btn btn-ghost btn-sm" onClick={goPrev} aria-label="Mois précédent">‹</button>
          <h2 className="appts-cal-title">{monthLabel}</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={goNext} aria-label="Mois suivant">›</button>
        </div>
        <div className="appts-cal-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={goToday}>Aujourd'hui</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
            {loading ? '…' : '↻ Rafraîchir'}
          </button>
        </div>
      </div>

      {error && <div className="appts-cal-error" role="alert">❌ {error}</div>}

      {loading ? (
        <div className="appts-cal-loading">Chargement des rendez-vous…</div>
      ) : (
        <>
          {/* ── Banner d'accueil : guide l'admin quand il n'y a rien ──── */}
          {appointments.length === 0 && slots.length === 0 && !selectedDay && (
            <div className="appts-cal-welcome" role="status">
              <div className="appts-cal-welcome-icon" aria-hidden="true">📅</div>
              <div className="appts-cal-welcome-body">
                <strong>Le calendrier est vide.</strong>
                <p>Cliquez sur n'importe quel jour pour ajouter un créneau de rendez-vous disponible.</p>
              </div>
            </div>
          )}

          <div className="appts-cal-grid" role="grid" aria-label={`Calendrier ${monthLabel}`}>
            {WEEKDAY_LABELS.map((w) => (
              <div key={w} className="appts-cal-weekday" role="columnheader">{w}</div>
            ))}
            {cells.map((d) => {
              const key = toDateKey(d);
              const inMonth = d.getUTCMonth() === cursor.getUTCMonth();
              const isToday = isSameDayUTC(d, today);
              const isSelected = selectedDay ? isSameDayUTC(d, selectedDay) : false;
              const dayAppts = apptsByDay.get(key) ?? [];
              const daySlots = slotsByDay.get(key) ?? [];
              const counts: Record<AppointmentStatus, number> = { pending: 0, confirmed: 0, cancelled: 0 };
              for (const a of dayAppts) counts[a.status]++;

              return (
                <button
                  key={key}
                  type="button"
                  role="gridcell"
                  aria-selected={isSelected}
                  className={[
                    'appts-cal-cell',
                    inMonth ? '' : 'appts-cal-cell--out',
                    isToday ? 'appts-cal-cell--today' : '',
                    isSelected ? 'appts-cal-cell--selected' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => openDay(d)}
                >
                  <span className="appts-cal-day-num">{d.getUTCDate()}</span>
                  {dayAppts.length > 0 && (
                    <span className="appts-cal-dots" aria-label={`${dayAppts.length} rendez-vous`}>
                      {(['confirmed', 'pending', 'cancelled'] as AppointmentStatus[]).map((s) =>
                        counts[s] > 0 ? (
                          <span
                            key={s}
                            className="appts-cal-dot"
                            style={{ backgroundColor: STATUS_COLORS[s] }}
                            title={`${counts[s]} ${STATUS_LABELS[s]}`}
                          />
                        ) : null,
                      )}
                    </span>
                  )}
                  {daySlots.length > 0 && (
                    <span className="appts-cal-slots-count" title={`${daySlots.length} créneau(x) configuré(s)`}>
                      🕒 {daySlots.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {selectedDay && (
            <div className="appts-cal-detail">
              <div className="appts-cal-detail-header">
                <h3>
                  {selectedDay.toLocaleDateString('fr-FR', {
                    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
                  })}
                </h3>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedDay(null)}>
                  Fermer
                </button>
              </div>

              {/* ── Section créneaux configurés ─────────────────────────────── */}
              <section className="appts-cal-section">
                <header className="appts-cal-section-header">
                  <h4>🕒 Créneaux configurés <span className="appts-cal-section-count">{selectedSlots.length}</span></h4>
                </header>

                {selectedSlots.length === 0 ? (
                  <p className="appts-cal-empty">Aucun créneau configuré pour ce jour.</p>
                ) : (
                  <ul className="appts-cal-slots-list">
                    {selectedSlots.map((s) => {
                      const taken = selectedAppointments.some((a) => a.start_time === s.start_time);
                      return (
                        <li key={s.id} className={`appts-cal-slot-item ${taken ? 'appts-cal-slot-item--taken' : ''} ${s.is_available ? '' : 'appts-cal-slot-item--disabled'}`}>
                          <span className="appts-cal-slot-time">
                            {formatTimeUTC(s.start_time)} – {formatTimeUTC(s.end_time)}
                          </span>
                          <span className="appts-cal-slot-flags">
                            {taken && <span className="appts-cal-flag appts-cal-flag--taken">Réservé</span>}
                            {!s.is_available && <span className="appts-cal-flag appts-cal-flag--off">Désactivé</span>}
                            {!taken && s.is_available && <span className="appts-cal-flag appts-cal-flag--free">Libre</span>}
                          </span>
                          <button
                            type="button"
                            className="appts-cal-slot-delete"
                            onClick={() => deleteSlot(s.id)}
                            aria-label={`Supprimer le créneau ${formatTimeUTC(s.start_time)}`}
                            title="Supprimer"
                          >
                            🗑
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {/* Formulaire inline d'ajout de créneau */}
                <form className="appts-cal-add-form" onSubmit={submitNewSlot}>
                  <div className="appts-cal-add-fields">
                    <label>
                      <span>Début</span>
                      <input
                        type="time"
                        value={newSlotStart}
                        onChange={(e) => setNewSlotStart(e.currentTarget.value)}
                        required
                      />
                    </label>
                    <label>
                      <span>Fin</span>
                      <input
                        type="time"
                        value={newSlotEnd}
                        onChange={(e) => setNewSlotEnd(e.currentTarget.value)}
                        required
                      />
                    </label>
                    <button type="submit" className="btn btn-primary btn-sm" disabled={addingSlot}>
                      {addingSlot ? '…' : '+ Ajouter'}
                    </button>
                  </div>
                  {addError && <p className="appts-cal-add-error" role="alert">❌ {addError}</p>}
                  <p className="appts-cal-add-hint">
                    L'anti-chevauchement est vérifié côté serveur (chevauche un créneau existant → erreur 409).
                  </p>
                </form>
              </section>

              {/* ── Section rendez-vous du jour ────────────────────────────── */}
              <section className="appts-cal-section">
                <header className="appts-cal-section-header">
                  <h4>📅 Rendez-vous <span className="appts-cal-section-count">{selectedAppointments.length}</span></h4>
                </header>

                {selectedAppointments.length === 0 ? (
                  <p className="appts-cal-empty">Aucun rendez-vous ce jour-là.</p>
                ) : (
                  <ul className="appts-cal-list">
                    {selectedAppointments.map((a) => (
                      <li key={a.id} className="appts-cal-list-item">
                        <span
                          className="appts-cal-status"
                          style={{ backgroundColor: STATUS_COLORS[a.status] }}
                          aria-label={STATUS_LABELS[a.status]}
                        />
                        <div className="appts-cal-list-body">
                          <div className="appts-cal-list-time">
                            {formatTimeUTC(a.start_time)} – {formatTimeUTC(a.end_time)}
                          </div>
                          <div className="appts-cal-list-who">
                            {a.user_profile?.full_name ?? a.candidate_email ?? 'Anonyme'}
                            {a.user_profile?.email && (
                              <span className="appts-cal-list-email"> · {a.user_profile.email}</span>
                            )}
                          </div>
                          {a.notes && <div className="appts-cal-list-notes">📝 {a.notes}</div>}
                        </div>
                        <span className="appts-cal-list-status-label">{STATUS_LABELS[a.status]}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}

          <div className="appts-cal-legend" aria-label="Légende des statuts">
            {(Object.keys(STATUS_COLORS) as AppointmentStatus[]).map((s) => (
              <span key={s} className="appts-cal-legend-item">
                <span className="appts-cal-dot" style={{ backgroundColor: STATUS_COLORS[s] }} />
                {STATUS_LABELS[s]}
              </span>
            ))}
          </div>
        </>
      )}

      <style>{`
        .appts-cal { font-family: 'Geist', sans-serif; }
        .appts-cal-toolbar {
          display: flex; align-items: center; justify-content: space-between;
          gap: 12px; margin-bottom: 14px; flex-wrap: wrap;
        }
        .appts-cal-nav { display: flex; align-items: center; gap: 8px; }
        .appts-cal-title { font-size: 18px; font-weight: 700; margin: 0; min-width: 180px; text-align: center; }
        .appts-cal-actions { display: flex; gap: 6px; }
        .btn { font-family: 'Geist', sans-serif; cursor: pointer; }
        .btn-ghost { background: #fff; color: #2C2014; border: 2px solid #000; border-radius: 6px; }
        .btn-primary { background: oklch(53.958% 0.10717 58.243); color: #FDFAF4; border: 2px solid #000; border-radius: 6px; }
        .btn-sm { font-size: 13px; padding: 6px 10px; font-weight: 600; }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .appts-cal-error {
          background: #FAEAE4; border: 1.5px solid #E8B9A6; color: #8B3820;
          padding: 10px 14px; border-radius: 8px; margin-bottom: 12px; font-size: 14px;
        }
        .appts-cal-fatal {
          background: #FAEAE4; border: 2px solid #8B3820; color: #8B3820;
          padding: 20px; border-radius: 8px; margin: 16px 0;
        }
        .appts-cal-fatal h3 { margin: 0 0 12px; font-size: 16px; }
        .appts-cal-fatal pre {
          background: #fff; padding: 10px; border-radius: 4px;
          font-size: 12px; white-space: pre-wrap; overflow-x: auto;
          margin: 0 0 12px;
        }
        .appts-cal-loading { padding: 32px; text-align: center; color: #9A7E5A; }

        .appts-cal-welcome {
          display: flex;
          gap: 16px;
          align-items: center;
          background: linear-gradient(135deg, #FFF4E0 0%, #FDFAF4 100%);
          border: 2px dashed oklch(53.958% 0.10717 58.243);
          border-radius: 8px;
          padding: 16px 20px;
          margin-bottom: 14px;
        }
        .appts-cal-welcome-icon { font-size: 32px; line-height: 1; }
        .appts-cal-welcome-body strong {
          display: block;
          color: #2C2014;
          font-size: 15px;
          margin-bottom: 2px;
        }
        .appts-cal-welcome-body p {
          margin: 0;
          color: #6B5B45;
          font-size: 13px;
          line-height: 1.45;
        }

        .appts-cal-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 4px;
          background: #F7F2E8;
          padding: 4px;
          border: 2px solid #000;
          border-radius: 8px;
        }
        .appts-cal-weekday {
          font-size: 11px; font-weight: 700; text-transform: uppercase;
          color: #9A7E5A; text-align: center; padding: 6px 0;
          font-family: 'Geist Mono', monospace; letter-spacing: 0.05em;
        }
        .appts-cal-cell {
          background: #FDFAF4;
          border: 1.5px solid transparent;
          border-radius: 6px;
          min-height: 64px;
          padding: 6px;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          justify-content: space-between;
          font: inherit;
          color: #2C2014;
          cursor: pointer;
          transition: border-color 0.1s, background 0.1s;
          position: relative;
        }
        .appts-cal-cell:hover { border-color: #C4B89A; }
        .appts-cal-cell--out { background: #F2EBDB; color: #9A7E5A; }
        .appts-cal-cell--today { border-color: oklch(53.958% 0.10717 58.243); }
        .appts-cal-cell--selected {
          border-color: #000;
          background: #FFF4E0;
          box-shadow: inset 0 0 0 2px #000;
        }
        .appts-cal-day-num { font-size: 14px; font-weight: 600; }
        .appts-cal-dots { display: inline-flex; gap: 3px; }
        .appts-cal-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
        .appts-cal-slots-count {
          position: absolute; top: 4px; right: 4px;
          font-size: 10px; color: #9A7E5A;
          font-family: 'Geist Mono', monospace; font-weight: 600;
        }

        .appts-cal-detail {
          margin-top: 16px;
          background: #FDFAF4;
          border: 2px solid #000;
          border-radius: 8px;
          padding: 16px;
          display: flex; flex-direction: column; gap: 18px;
        }
        .appts-cal-detail-header {
          display: flex; justify-content: space-between; align-items: center;
        }
        .appts-cal-detail-header h3 {
          margin: 0; font-size: 15px; font-weight: 700; text-transform: capitalize;
        }
        .appts-cal-empty { color: #9A7E5A; font-size: 14px; margin: 8px 0 0; }

        .appts-cal-section { display: flex; flex-direction: column; gap: 8px; }
        .appts-cal-section-header h4 {
          margin: 0; font-size: 13px; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.05em;
          color: #372c1f; font-family: 'Geist Mono', monospace;
          display: flex; align-items: center; gap: 8px;
        }
        .appts-cal-section-count {
          background: #F7F2E8; color: #2C2014;
          padding: 1px 8px; border-radius: 99px;
          font-size: 11px; font-weight: 700;
        }

        .appts-cal-slots-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
        .appts-cal-slot-item {
          display: flex; align-items: center; gap: 12px;
          padding: 8px 12px;
          background: #FFFCF5;
          border: 1.5px solid #DDD0B8;
          border-radius: 6px;
        }
        .appts-cal-slot-item--taken    { background: #FEF3C7; border-color: #FCD34D; }
        .appts-cal-slot-item--disabled { background: #F3F4F6; border-color: #E5E7EB; opacity: 0.6; }
        .appts-cal-slot-time {
          font-family: 'Geist Mono', monospace; font-weight: 700;
          font-size: 14px; min-width: 130px;
        }
        .appts-cal-slot-flags { display: inline-flex; gap: 4px; flex: 1; }
        .appts-cal-flag {
          font-size: 10px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.05em; padding: 2px 6px; border-radius: 99px;
          font-family: 'Geist Mono', monospace;
        }
        .appts-cal-flag--free  { background: #D1FAE5; color: #065f46; }
        .appts-cal-flag--taken { background: #FEF3C7; color: #92400E; }
        .appts-cal-flag--off   { background: #E5E7EB; color: #6B7280; }
        .appts-cal-slot-delete {
          background: transparent; border: none; cursor: pointer;
          padding: 4px 8px; font-size: 14px; opacity: 0.55;
          border-radius: 4px; transition: opacity 0.1s, background 0.1s;
        }
        .appts-cal-slot-delete:hover { opacity: 1; background: #FAEAE4; }

        .appts-cal-add-form {
          margin-top: 8px;
          background: #F7F2E8;
          border: 1.5px dashed #C4B89A;
          border-radius: 6px;
          padding: 12px;
        }
        .appts-cal-add-fields {
          display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap;
        }
        .appts-cal-add-fields label {
          display: flex; flex-direction: column; gap: 4px;
          font-size: 11px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.05em; color: #9A7E5A;
          font-family: 'Geist Mono', monospace;
        }
        .appts-cal-add-fields input {
          font-family: 'Geist Mono', monospace; font-size: 14px; font-weight: 600;
          padding: 6px 10px; border: 1.5px solid #DDD0B8;
          border-radius: 4px; background: white; color: #2C2014;
        }
        .appts-cal-add-fields input:focus {
          outline: none; border-color: oklch(53.958% 0.10717 58.243);
          box-shadow: 0 0 0 3px rgba(196, 98, 58, .12);
        }
        .appts-cal-add-error {
          margin: 8px 0 0; color: #8B3820; font-size: 13px;
          background: #FAEAE4; padding: 6px 10px; border-radius: 4px;
        }
        .appts-cal-add-hint {
          margin: 8px 0 0; color: #9A7E5A; font-size: 11px;
          font-style: italic;
        }

        .appts-cal-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
        .appts-cal-list-item {
          display: flex; align-items: center; gap: 12px;
          padding: 10px 12px;
          background: #F7F2E8;
          border: 1.5px solid #DDD0B8;
          border-radius: 6px;
        }
        .appts-cal-status { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
        .appts-cal-list-body { flex: 1; min-width: 0; }
        .appts-cal-list-time { font-size: 14px; font-weight: 700; }
        .appts-cal-list-who { font-size: 13px; color: #372c1f; margin-top: 2px; }
        .appts-cal-list-email { color: #9A7E5A; font-family: 'Geist Mono', monospace; font-size: 12px; }
        .appts-cal-list-notes { font-size: 12px; color: #9A7E5A; margin-top: 4px; font-style: italic; }
        .appts-cal-list-status-label {
          font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
          color: #9A7E5A; font-family: 'Geist Mono', monospace;
        }

        .appts-cal-legend {
          display: flex; gap: 16px; margin-top: 12px;
          font-size: 12px; color: #9A7E5A; flex-wrap: wrap;
        }
        .appts-cal-legend-item { display: inline-flex; align-items: center; gap: 6px; }
      `}</style>
    </div>
  );
}

// Wrap dans l'ErrorBoundary pour qu'un crash React au mount affiche
// un message au lieu de laisser la zone vide.
export default function AdminAppointmentsCalendar() {
  return (
    <CalendarErrorBoundary>
      <AdminAppointmentsCalendarInner />
    </CalendarErrorBoundary>
  );
}
