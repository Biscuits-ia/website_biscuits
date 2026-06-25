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

/**
 * Normalise une réponse JSON qui peut être soit :
 * - un tableau direct (ancien format / autres endpoints),
 * - un objet paginé { data: [...], total, page, limit } (format /api/admin/appointments).
 * Renvoie toujours un tableau.
 */
function normalizeList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown }).data)) {
    return (payload as { data: T[] }).data;
  }
  return [];
}

// ─── ErrorBoundary : capture les crashes React et les affiche au lieu de
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
  // ─── Anti SSR/CSR mismatch ─────────────────────────────────────────────────────
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

      // /api/admin/appointments renvoie { data: [...], total, page, limit }
      // depuis le patch pagination. /api/appointment-slots renvoie un tableau direct.
      // On normalise les deux pour éviter `t.map is not a function`.
      const rawApptsJson: unknown = await apptsRes.json();
      const rawSlotsJson: unknown = await slotsRes.json();

      const rawAppts = normalizeList<
        VolunteerAppointment & { appointment_slots?: AppointmentSlot | null }
      >(rawApptsJson);
      const rawSlots = normalizeList<AppointmentSlot>(rawSlotsJson);

      const flat: CalendarAppointment[] = rawAppts
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
        .filter((x): x is CalendarAppointment => x !== null);

      setAppointments(flat);
      setSlots(rawSlots);
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
// ─── Index appointments et slots par date (YYYY-MM-DD UTC)
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

// ─── Ajout d'un créneau ──────────────────────────────────────────────────────────
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

// ─── Suppression d'un créneau ──────────────────────────────────────────────────
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
        {/* ─── Banner d'accueil : guide l'admin quand il n'y a rien ─── */}
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

            {/* ─── Section créneaux configurés ──────────────────────────────── */}
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

            {/* ─── Section rendez-vous du jour ───────────────────────────────── */}
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
