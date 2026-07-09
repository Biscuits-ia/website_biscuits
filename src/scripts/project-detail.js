// ============================================================================
// src/scripts/project-detail.js
// ----------------------------------------------------------------------------
// Comportement client de /dashboard/benevole/project/[id] :
// kanban (drag & drop), modales, commentaires + mentions @, watchers, chat.
//
// POURQUOI UN FICHIER .js INLINE PLUTOT QU'UN MODULE BUNDLE
// ---------------------------------------------------------
// La CSP des routes SSR est `script-src 'self' 'nonce-...' 'strict-dynamic'`.
// Sous 'strict-dynamic', 'self' est IGNORE : une balise script externe inseree
// par le parseur est bloquee, tout comme un island client:*. Seul un script
// portant le nonce s'execute. Ce fichier est donc importe en `?raw` et injecte
// via `set:html` dans une balise script inline nonce.
//
// Il reste un vrai fichier : lintable par ESLint, diffable, testable -- ce que
// n'etait pas le bloc de 660 lignes noye dans le .astro (audit P4 #31).
//
// Les donnees serveur arrivent par le data-block JSON #project-data.
// Cf. src/lib/jsonLd.ts et l'audit P4 #41.
// ============================================================================

(() => {
/* ── Helpers ──────────────────────────────────────────────────────────────── */
const { projectId, memberOptions: _memberOptions, userId, userName } =
  JSON.parse(document.getElementById('project-data').textContent);

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── Modals ─────────────────────────────────────────────────────────────────*/
const modalEdit    = document.getElementById('modal-edit-project');
const modalDetail  = document.getElementById('modal-task-detail');

document.getElementById('btn-edit-project')?.addEventListener('click', () => {
  if (modalEdit instanceof HTMLDialogElement) modalEdit.showModal();
});
document.getElementById('btn-close-edit-modal')?.addEventListener('click', () => {
  if (modalEdit instanceof HTMLDialogElement) modalEdit.close();
});
document.getElementById('btn-close-detail')?.addEventListener('click', () => {
  if (modalDetail instanceof HTMLDialogElement) modalDetail.close();
});

/* ── Drag & Drop ─────────────────────────────────────────────────────────── */
let draggedTaskId = null;
let draggedEl = null;

document.querySelectorAll('.task-card').forEach(card => {
  card.addEventListener('dragstart', (e) => {
    draggedTaskId = card.getAttribute('data-task-id');
    draggedEl = card;
    card.classList.add('is-dragging');
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('is-dragging');
    draggedTaskId = null;
    draggedEl = null;
    document.querySelectorAll('.kanban-cards').forEach(c => c.classList.remove('drop-target'));
  });
});

document.querySelectorAll('.kanban-cards').forEach(col => {
  col.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    col.classList.add('drop-target');
  });
  col.addEventListener('dragleave', (e) => {
    if (!col.contains(e.relatedTarget)) col.classList.remove('drop-target');
  });
  col.addEventListener('drop', async (e) => {
    e.preventDefault();
    col.classList.remove('drop-target');
    if (!draggedTaskId || !draggedEl) return;

    const colEl    = col.closest('.kanban-col');
    const newStatus = colEl?.getAttribute('data-status');
    const oldStatus = draggedEl.getAttribute('data-status');
    if (!newStatus || oldStatus === newStatus) return;

    // Optimistic update in DOM
    col.appendChild(draggedEl);
    draggedEl.setAttribute('data-status', newStatus);
    // Update column counts
    updateColCounts();

    try {
      const res = await fetch(`/api/benevole/tasks?id=${draggedTaskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) window.location.reload();
    } catch { window.location.reload(); }
  });
});

function updateColCounts() {
  document.querySelectorAll('.kanban-col').forEach(col => {
    const count  = col.querySelectorAll('.task-card').length;
    const badge  = col.querySelector('.kanban-col-count');
    if (badge) badge.textContent = String(count);
  });
}

/* ── Modifier projet ──────────────────────────────────────────────────────── */
document.getElementById('form-edit-project')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  if (!(form instanceof HTMLFormElement)) return;
  const data = Object.fromEntries(new FormData(form));

  const res = await fetch(`/api/benevole/projects?id=${projectId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (res.ok) {
    window.location.reload();
  } else {
    const err = await res.json().catch(() => ({}));
    alert('Erreur : ' + (err.error ?? 'Impossible de modifier le projet.'));
  }
});

/* ── Claim tâche ─────────────────────────────────────────────────────────── */
document.querySelectorAll('.btn-claim-task').forEach(btn => {
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const id = btn.getAttribute('data-id');
    if (!id) return;
    btn.disabled = true;
    btn.textContent = '…';
    try {
      const res = await fetch(`/api/benevole/tasks?id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'claim' }),
      });
      if (res.ok) {
        window.location.reload();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error ?? 'Impossible de prendre cette tâche.');
        btn.disabled = false;
        btn.textContent = '✋ Je prends cette tâche';
      }
    } catch {
      btn.disabled = false;
      btn.textContent = '✋ Je prends cette tâche';
    }
  });
});

/* ── Unclaim tâche ────────────────────────────────────────────────────────── */
document.querySelectorAll('.btn-unclaim-task').forEach(btn => {
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const id = btn.getAttribute('data-id');
    if (!id || !confirm('Libérer cette tâche ?')) return;
    const res = await fetch(`/api/benevole/tasks?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'unclaim' }),
    });
    if (res.ok) window.location.reload();
    else alert('Erreur lors de la libération.');
  });
});

/* ── Créer tâche (modale) ─────────────────────────────────────────────────── */
const modalAddTask = document.getElementById('modal-add-task');
const atStatusInput = document.getElementById('at-status');
const formAddTask = document.getElementById('form-add-task');

function openAddTaskModal(defaultStatus = 'todo') {
  if (!(modalAddTask instanceof HTMLDialogElement)) return;
  if (atStatusInput instanceof HTMLInputElement) atStatusInput.value = defaultStatus;
  const titleInput = document.getElementById('at-title');
  if (titleInput instanceof HTMLInputElement) {
    titleInput.value = '';
    modalAddTask.showModal();
    titleInput.focus();
  } else {
    modalAddTask.showModal();
  }
}

document.getElementById('btn-add-task')?.addEventListener('click', () => openAddTaskModal('todo'));
document.querySelectorAll('.btn-add-col-task').forEach((btn) => {
  btn.addEventListener('click', () => {
    const status = btn.getAttribute('data-target-status') ?? 'todo';
    openAddTaskModal(status);
  });
});
document.getElementById('btn-close-add-task')?.addEventListener('click', () => {
  if (modalAddTask instanceof HTMLDialogElement) modalAddTask.close();
});

formAddTask?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!(formAddTask instanceof HTMLFormElement)) return;
  const fd = new FormData(formAddTask);
  const body = {
    project_id:  fd.get('project_id') ?? projectId,
    title:       String(fd.get('title') ?? '').trim(),
    description: String(fd.get('description') ?? '').trim() || null,
    priority:    String(fd.get('priority') ?? 'medium'),
    status:      String(fd.get('status') ?? 'todo'),
    deadline:    String(fd.get('deadline') ?? '') || null,
    assignee_id: String(fd.get('assignee_id') ?? '') || null,
  };
  if (!body.title) {
    alert('Le titre est requis.');
    return;
  }
  const submitBtn = formAddTask.querySelector('button[type="submit"]');
  if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = true;
  try {
    const res = await fetch('/api/benevole/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      window.location.reload();
    } else {
      const err = await res.json().catch(() => ({}));
      alert('Erreur : ' + (err.error ?? 'Impossible de créer la tâche.'));
      if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = false;
    }
  } catch {
    if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = false;
    alert('Erreur réseau.');
  }
});

/* ── Supprimer tâche ──────────────────────────────────────────────────────── */
document.querySelectorAll('.btn-delete-task').forEach(btn => {
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const id = btn.getAttribute('data-id');
    if (!id || !confirm('Supprimer cette tâche ?')) return;
    const res = await fetch(`/api/benevole/tasks?id=${id}`, { method: 'DELETE' });
    if (res.ok) window.location.reload();
    else alert('Erreur lors de la suppression.');
  });
});

/* ── Avancement double-clic (fallback sans D&D) ───────────────────────────── */
document.querySelectorAll('.task-card').forEach(card => {
  card.addEventListener('dblclick', (e) => {
    if (e.target.closest('.task-card-actions')) return;
    const id      = card.getAttribute('data-task-id');
    const current = card.getAttribute('data-status');
    if (!id) return;
    const order = ['todo', 'in_progress', 'review', 'done'];
    const idx   = order.indexOf(current ?? '');
    if (idx === -1 || idx === order.length - 1) return;
    const next = order[idx + 1];
    card.setAttribute('data-status', next);
    updateColCounts();
    fetch(`/api/benevole/tasks?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    }).then(r => { if (!r.ok) window.location.reload(); });
  });
});

/* ── Task Detail Modal ───────────────────────────────────────────────────── */
document.querySelectorAll('.task-card').forEach(card => {
  card.addEventListener('click', (e) => {
    if (e.target.closest('.task-card-actions')) return;
    if (e.detail === 2) return; // ignore dblclick
    const taskId = card.getAttribute('data-task-id');
    if (!taskId) return;
    openTaskDetail(taskId, card);
  });
  // Keyboard accessibility
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const taskId = card.getAttribute('data-task-id');
      if (taskId) openTaskDetail(taskId, card);
    }
  });
});

async function openTaskDetail(taskId, card) {
  const detailTaskIdEl = document.getElementById('detail-task-id');
  const detailTitle    = document.getElementById('detail-title');
  const detailDesc     = document.getElementById('detail-description');
  const detailMeta     = document.getElementById('detail-meta');
  if (!detailTaskIdEl || !detailTitle || !detailDesc || !detailMeta) return;

  detailTaskIdEl.value = taskId;

  // Populate from card data attributes
  const title       = card.getAttribute('data-title')         ?? '';
  const desc        = card.getAttribute('data-description')   ?? '';
  const priority    = card.getAttribute('data-priority')      ?? '';
  const deadline    = card.getAttribute('data-deadline')      ?? '';
  const assigneeName = card.getAttribute('data-assignee-name') ?? '';

  detailTitle.textContent = title;
  detailDesc.textContent  = desc || '(Pas de description)';

  const priorityLabels = { low: 'Faible', medium: 'Moyenne', high: 'Haute' };
  const priorityClasses = { low: 'neutral', medium: 'info', high: 'err' };
  let metaHtml = `<span class="badge badge-${priorityClasses[priority] ?? 'neutral'}">${esc(priorityLabels[priority] ?? priority)}</span>`;
  if (deadline) metaHtml += `<span class="meta-item">📅 ${new Date(deadline).toLocaleDateString('fr-FR')}</span>`;
  if (assigneeName) metaHtml += `<span class="meta-item">👤 ${esc(assigneeName)}</span>`;
  detailMeta.innerHTML = metaHtml;

  // Reset comment form
  const commentInput = document.getElementById('comment-input');
  const commentParentId = document.getElementById('comment-parent-id');
  const replyIndicator = document.getElementById('reply-indicator');
  if (commentInput instanceof HTMLTextAreaElement) commentInput.value = '';
  if (commentParentId instanceof HTMLInputElement) commentParentId.value = '';
  if (replyIndicator) replyIndicator.style.display = 'none';

  // Update watch button
  await loadWatchers(taskId);
  // Load comments
  await loadComments(taskId);

  if (modalDetail instanceof HTMLDialogElement) modalDetail.showModal();
}

/* ── Comments ────────────────────────────────────────────────────────────── */
async function loadComments(taskId) {
  const container = document.getElementById('comments-container');
  if (!container) return;
  container.innerHTML = '<p class="loading-text">Chargement…</p>';
  try {
    const res = await fetch(`/api/benevole/task-comments?task_id=${taskId}`);
    if (!res.ok) throw new Error();
    const { data } = await res.json();
    renderComments(container, data ?? [], taskId);
  } catch {
    container.innerHTML = '<p class="error-text">Erreur de chargement.</p>';
  }
}

function renderComments(container, comments, taskId) {
  if (!comments.length) {
    container.innerHTML = '<p class="no-comments">Aucun commentaire.</p>';
    return;
  }
  const roots   = comments.filter(c => !c.parent_id);
  const replies = comments.filter(c =>  c.parent_id);
  container.innerHTML = roots.map(c => {
    const children = replies.filter(r => r.parent_id === c.id);
    return renderOneComment(c, false) + children.map(r => renderOneComment(r, true)).join('');
  }).join('');

  container.querySelectorAll('.btn-reply').forEach(btn => {
    btn.addEventListener('click', () => {
      const parentId   = btn.getAttribute('data-parent-id');
      const authorName = btn.getAttribute('data-author-name');
      const commentParentId = document.getElementById('comment-parent-id');
      const replyIndicator  = document.getElementById('reply-indicator');
      const replyToName     = document.getElementById('reply-to-name');
      const commentInput    = document.getElementById('comment-input');
      if (commentParentId instanceof HTMLInputElement) commentParentId.value = parentId ?? '';
      if (replyToName) replyToName.textContent = authorName ?? '';
      if (replyIndicator) replyIndicator.style.display = 'flex';
      if (commentInput) commentInput.focus();
    });
  });

  container.querySelectorAll('.btn-delete-comment').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      if (!id || !confirm('Supprimer ce commentaire ?')) return;
      const res = await fetch(`/api/benevole/task-comments?id=${id}`, { method: 'DELETE' });
      if (res.ok) await loadComments(taskId);
      else alert('Erreur lors de la suppression.');
    });
  });
}

function renderOneComment(c, isReply) {
  const date       = new Date(c.created_at).toLocaleDateString('fr-FR');
  const profileArr = c.profiles;
  const profile    = Array.isArray(profileArr) ? profileArr[0] : profileArr;
  const authorName = profile?.full_name ?? profile?.email ?? 'Inconnu';
  const isOwn      = c.author_id === userId;
  const body       = esc(c.content).replace(/@([a-zA-Z0-9_\-.]+)/g, '<span class="mention">@$1</span>');
  return `
    <div class="comment${isReply ? ' comment--reply' : ''}" data-comment-id="${esc(c.id)}">
      <div class="comment-header">
        <span class="comment-author">${esc(authorName)}</span>
        <span class="comment-date">${date}</span>
        ${!isReply ? `<button class="btn btn-ghost btn-xs btn-reply" data-parent-id="${esc(c.id)}" data-author-name="${esc(authorName)}">↩ Répondre</button>` : ''}
        ${isOwn ? `<button class="btn btn-ghost btn-xs btn-delete-comment" data-id="${esc(c.id)}" style="color:var(--err)">🗑</button>` : ''}
      </div>
      <div class="comment-body">${body}</div>
    </div>`;
}

document.getElementById('btn-cancel-reply')?.addEventListener('click', () => {
  const commentParentId = document.getElementById('comment-parent-id');
  const replyIndicator  = document.getElementById('reply-indicator');
  if (commentParentId instanceof HTMLInputElement) commentParentId.value = '';
  if (replyIndicator) replyIndicator.style.display = 'none';
});

document.getElementById('form-add-comment')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const taskId    = document.getElementById('detail-task-id')?.value;
  const content   = document.getElementById('comment-input')?.value?.trim();
  const parentId  = document.getElementById('comment-parent-id')?.value || null;
  if (!taskId || !content) return;

  const res = await fetch('/api/benevole/task-comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_id: taskId, content, parent_id: parentId }),
  });

  if (res.ok) {
    const commentInput    = document.getElementById('comment-input');
    const commentParentId = document.getElementById('comment-parent-id');
    const replyIndicator  = document.getElementById('reply-indicator');
    if (commentInput instanceof HTMLTextAreaElement) commentInput.value = '';
    if (commentParentId instanceof HTMLInputElement) commentParentId.value = '';
    if (replyIndicator) replyIndicator.style.display = 'none';
    await loadComments(taskId);
  } else {
    const err = await res.json().catch(() => ({}));
    alert('Erreur : ' + (err.error ?? 'Impossible d\'ajouter le commentaire.'));
  }
});

/* ── @Mention Autocomplete ───────────────────────────────────────────────── */
const commentInput     = document.getElementById('comment-input');
const mentionDropdown  = document.getElementById('mention-dropdown');

if (commentInput instanceof HTMLTextAreaElement && mentionDropdown) {
  commentInput.addEventListener('input', () => {
    const value  = commentInput.value;
    const cursor = commentInput.selectionStart ?? 0;
    const textBefore = value.slice(0, cursor);
    const mentionMatch = textBefore.match(/@([a-zA-Z0-9_\-.]*)$/);

    if (!mentionMatch) {
      mentionDropdown.style.display = 'none';
      return;
    }

    const query = mentionMatch[1].toLowerCase();
    const filtered = _memberOptions.filter(m =>
      m.name.toLowerCase().includes(query)
    ).slice(0, 5);

    if (!filtered.length) {
      mentionDropdown.style.display = 'none';
      return;
    }

    mentionDropdown.innerHTML = filtered.map(m =>
      `<li data-name="${esc(m.name)}">${esc(m.name)}</li>`
    ).join('');
    mentionDropdown.style.display = 'block';
  });

  mentionDropdown.addEventListener('mousedown', (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    e.preventDefault();
    const name   = li.getAttribute('data-name') ?? '';
    const value  = commentInput.value;
    const cursor = commentInput.selectionStart ?? 0;
    const before = value.slice(0, cursor).replace(/@[a-zA-Z0-9_\-.]*$/, `@${name} `);
    commentInput.value = before + value.slice(cursor);
    commentInput.focus();
    mentionDropdown.style.display = 'none';
  });

  document.addEventListener('click', (e) => {
    if (!commentInput.contains(e.target) && !mentionDropdown.contains(e.target)) {
      mentionDropdown.style.display = 'none';
    }
  });
}

/* ── Watchers ────────────────────────────────────────────────────────────── */
let currentUserIsWatcher = false;

async function loadWatchers(taskId) {
  const container = document.getElementById('watchers-container');
  const btn       = document.getElementById('btn-toggle-watch');
  if (!container) return;
  container.innerHTML = '<p class="loading-text">Chargement…</p>';
  try {
    const res = await fetch(`/api/benevole/task-watchers?task_id=${taskId}`);
    if (!res.ok) throw new Error();
    const { data } = await res.json();
    const watchers = data ?? [];
    currentUserIsWatcher = watchers.some(w => w.user_id === userId);

    if (!watchers.length) {
      container.innerHTML = '<p class="no-comments">Aucun watcher.</p>';
    } else {
      container.innerHTML = watchers.map(w => {
        const profileArr = w.profiles;
        const profile    = Array.isArray(profileArr) ? profileArr[0] : profileArr;
        const name       = profile?.full_name ?? profile?.email ?? w.user_id;
        const initials   = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        return `<div class="watcher-item"><div class="watcher-avatar">${esc(initials)}</div>${esc(name)}</div>`;
      }).join('');
    }

    if (btn) btn.textContent = currentUserIsWatcher ? 'Se désabonner' : 'S\'abonner';
  } catch {
    container.innerHTML = '<p class="error-text">Erreur.</p>';
  }
}

document.getElementById('btn-toggle-watch')?.addEventListener('click', async () => {
  const taskId = document.getElementById('detail-task-id')?.value;
  if (!taskId) return;

  if (currentUserIsWatcher) {
    await fetch(`/api/benevole/task-watchers?task_id=${taskId}`, { method: 'DELETE' });
  } else {
    await fetch('/api/benevole/task-watchers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: taskId }),
    });
  }
  await loadWatchers(taskId);
});

/* ── Chargement du nombre de commentaires par carte ──────────────────────── */
async function loadCommentCounts() {
  const spans = document.querySelectorAll('.task-comments-count[data-task-id]');
  // Batch: fetch all in parallel
  await Promise.all(Array.from(spans).map(async span => {
    const tId = span.getAttribute('data-task-id');
    if (!tId) return;
    try {
      const res = await fetch(`/api/benevole/task-comments?task_id=${tId}`);
      if (!res.ok) return;
      const { data } = await res.json();
      span.textContent = `💬 ${(data ?? []).length}`;
    } catch { /* silent */ }
  }));
}
// Load counts in background without blocking
loadCommentCounts();

  /* ── Chat ────────────────────────────────────────────────────────────────── */
  let lastMsgTime = '';

  function renderChatMsg(msg) {
    const isOwn = msg.is_own ?? msg.author_id === userId;
    const t = new Date(msg.created_at);
    const now = new Date();
    const sameDay = t.toDateString() === now.toDateString();
    const timeStr = sameDay
      ? t.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      : t.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ' + t.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const cls = isOwn ? 'chat-msg chat-msg--own' : 'chat-msg chat-msg--other';
    return `<div class="${cls}" data-msg-id="${esc(msg.id)}">
      <div class="chat-msg-header">
        <span class="chat-msg-author">${esc(isOwn ? 'Moi' : msg.author_name)}</span>
        <span class="chat-msg-time">${timeStr}</span>
      </div>
      <div class="chat-msg-body">${esc(msg.content)}</div>
    </div>`;
  }

  async function loadChatMessages(since = '') {
    let url = `/api/benevole/project-messages?project_id=${projectId}`;
    if (since) url += `&since=${encodeURIComponent(since)}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const { data } = await res.json();
    return data ?? [];
  }

  async function initChat() {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    const messages = await loadChatMessages();
    if (messages.length === 0) {
      container.innerHTML = "<p class=\"chat-placeholder\">Aucun message pour l'instant. Soyez le premier !</p>";
    } else {
      container.innerHTML = messages.map(renderChatMsg).join('');
      lastMsgTime = messages[messages.length - 1].created_at;
    }
    container.scrollTop = container.scrollHeight;

    // Migration polling -> Supabase Realtime. Latence < 500ms, charge nulle
    // tant que personne ne parle. La table project_messages doit être activée
    // pour Realtime dans Supabase (cf. supabase/config.toml `[realtime]`).
    // Fallback polling 30s uniquement si window.supabase est indispo
    // (vieux nav, CSP stricte désactivant WS).
    const supabaseRealtime = (window).supabase;
    if (supabaseRealtime) {
      supabaseRealtime
        .channel(`project-${projectId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'project_messages', filter: `project_id=eq.${projectId}` },
          (payload) => {
            const placeholder = container.querySelector('.chat-placeholder');
            if (placeholder) placeholder.remove();
            container.insertAdjacentHTML('beforeend', renderChatMsg(payload.new));
            lastMsgTime = payload.new.created_at;
            if (container.scrollHeight - container.scrollTop - container.clientHeight < 60) {
              container.scrollTop = container.scrollHeight;
            }
          },
        )
        .subscribe();
    } else {
      // Fallback polling 30s si client Realtime indispo.
      setInterval(async () => {
        const newMsgs = await loadChatMessages(lastMsgTime);
        if (!newMsgs.length) return;
        const placeholder = container.querySelector('.chat-placeholder');
        if (placeholder) placeholder.remove();
        container.insertAdjacentHTML('beforeend', newMsgs.map(renderChatMsg).join(''));
        lastMsgTime = newMsgs[newMsgs.length - 1]?.created_at ?? lastMsgTime;
        container.scrollTop = container.scrollHeight;
      }, 30000);
    }
  }

  document.getElementById('chat-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    if (!(input instanceof HTMLInputElement)) return;
    const content = input.value.trim();
    if (!content) return;
    const submitBtn = document.querySelector('#chat-form button[type="submit"]');
    if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = true;
    input.disabled = true;
    const res = await fetch('/api/benevole/project-messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId, content }),
    });
    if (res.ok) {
      const { data: msg } = await res.json();
      const container = document.getElementById('chat-messages');
      if (container && msg) {
        const placeholder = container.querySelector('.chat-placeholder');
        if (placeholder) placeholder.remove();
        container.insertAdjacentHTML('beforeend', renderChatMsg({ ...msg, author_name: userName, is_own: true }));
        lastMsgTime = msg.created_at;
        container.scrollTop = container.scrollHeight;
      }
      input.value = '';
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.error ?? "Impossible d'envoyer le message.");
    }
    input.disabled = false;
    if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = false;
    input.focus();
  });

  document.getElementById('chat-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      document.getElementById('chat-form')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    }
  });

  initChat();
})();
