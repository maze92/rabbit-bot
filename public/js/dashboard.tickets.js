// Tickets module for OzarkDashboard
// List (left) + detail (right) inside Extras -> Tickets panel.

(function () {
  if (!window.OzarkDashboard) return;

  const D = window.OzarkDashboard;
  const state = D.state;
  const apiGet = D.apiGet;
  const apiPost = D.apiPost;
  const toast = D.toast;
  const t = D.t;
  const escapeHtml = D.escapeHtml;

  let _loading = false;
  let _detailTimeout = null;

  function waitForI18nReady(maxMs) {
    const deadline = Date.now() + (typeof maxMs === 'number' ? maxMs : 4000);
    return new Promise((resolve) => {
      (function tick() {
        try {
          const I = D && D.I18n;
          const ok = I && I.translations && Object.keys(I.translations).length > 0;
          if (ok) return resolve(true);
        } catch (e) {}
        if (Date.now() >= deadline) return resolve(false);
        setTimeout(tick, 50);
      })();
    });
  }

  function getGuildId() {
    return state.guildId ? String(state.guildId) : '';
  }

  function fmtDate(v) {
    if (!v) return '';
    try {
      if (D && typeof D.formatDateTime === 'function') return D.formatDateTime(v);
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleString();
    } catch (e) {
      return '';
    }
  }

  function setListActive(index) {
    const listEl = document.getElementById('ticketsList');
    if (!listEl) return;
    listEl.querySelectorAll('.list-item').forEach((el) => el.classList.remove('active'));
    const row = listEl.querySelector(`.list-item[data-index="${index}"]`);
    if (row) row.classList.add('active');
  }

  function renderList(items) {
    const listEl = document.getElementById('ticketsList');
    if (!listEl) return;

    listEl.innerHTML = '';

    if (!Array.isArray(items) || !items.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = t('tickets_empty');
      listEl.appendChild(empty);
      return;
    }

    items.forEach((it, idx) => {
      const row = document.createElement('div');
      row.className = 'list-item';
      row.dataset.index = String(idx);

      const num = it.ticketNumber != null ? String(it.ticketNumber) : (String(it._id || '').slice(-6));
      const subject = it.subject || t('tickets_subject_default');
      const username = it.username || it.userId || '';
      const status = (it.status || 'open') === 'closed' ? t('tickets_status_closed') : t('tickets_status_open');
      const created = fmtDate(it.createdAt);

      row.innerHTML = `
        <div class="user-row-header">
          <div class="title">#${escapeHtml(num)} • ${escapeHtml(subject)}</div>
          <div class="user-type-badge ${it.status === 'closed' ? 'bot' : 'human'}">${escapeHtml(status)}</div>
        </div>
        <div class="subtitle">${escapeHtml(username)}${created ? ' • ' + escapeHtml(created) : ''}</div>
      `;

      row.addEventListener('click', () => {
        setListActive(idx);
        selectTicketByIndex(idx);
      });

      listEl.appendChild(row);
    });
  }

  function renderDetailSkeleton() {
    return `<div class="empty">${escapeHtml(t('loading'))}</div>`;
  }

  function renderDetailEmpty() {
    const panel = document.getElementById('ticketDetailPanel');
    if (!panel) return;
    panel.innerHTML = `<div class="empty">${escapeHtml(t('tickets_detail_empty'))}</div>`;
  }

  function selectTicketByIndex(index) {
    const idx = Number(index);
    if (!Number.isInteger(idx) || idx < 0) return;
    const items = Array.isArray(state.ticketsItems) ? state.ticketsItems : [];
    const it = items[idx];
    if (!it) return;

    state.activeTicketIndex = idx;
    const panel = document.getElementById('ticketDetailPanel');
    if (panel) panel.innerHTML = renderDetailSkeleton();

    if (_detailTimeout) clearTimeout(_detailTimeout);
    _detailTimeout = setTimeout(() => {
      const curItems = Array.isArray(state.ticketsItems) ? state.ticketsItems : [];
      const cur = curItems[idx];
      if (!cur) return;
      renderDetail(cur);
      _detailTimeout = null;
    }, 300);
  }

  function renderDetail(ticket) {
    const panel = document.getElementById('ticketDetailPanel');
    if (!panel) return;

    const num = ticket.ticketNumber != null ? String(ticket.ticketNumber) : (String(ticket._id || '').slice(-6));
    const subject = ticket.subject || t('tickets_subject_default');
    const username = ticket.username || ticket.userId || '';
    const status = ticket.status === 'closed' ? t('tickets_status_closed') : t('tickets_status_open');
    const created = fmtDate(ticket.createdAt);
    const closedAt = fmtDate(ticket.closedAt);

    const canClose = ticket.status !== 'closed';
    const canReopen = ticket.status === 'closed';

    // Keep the header minimal: the list already shows "#N • subject".
    // Here we show only a generic title + status badge.
    panel.innerHTML = `
      <div class="user-row-header" style="margin-bottom:10px;">
        <div class="title">${escapeHtml(t('tickets_detail_title'))}</div>
        <div class="user-type-badge ${ticket.status === 'closed' ? 'bot' : 'human'}">${escapeHtml(status)}</div>
      </div>

      <div class="history-section">
        <h3>${escapeHtml(t('tickets_detail_messages'))}</h3>
        <div id="ticketsMessagesBox" class="ticket-messages">
          <div class="empty">${escapeHtml(t('loading'))}</div>
        </div>
      </div>

      <div class="history-section">
        <h3>${escapeHtml(t('tickets_detail_info'))}</h3>
        <div class="row gap">
          <div class="badge">${escapeHtml(t('tickets_detail_user'))}: ${escapeHtml(username)}</div>
          <div class="badge">${escapeHtml(t('tickets_detail_status'))}: ${escapeHtml(status)}</div>
          <div class="badge">${escapeHtml(t('tickets_detail_created'))}: ${escapeHtml(created || '-')}</div>
          ${closedAt ? `<div class="badge">${escapeHtml(t('tickets_detail_closed'))}: ${escapeHtml(closedAt)}</div>` : ''}
        </div>
      </div>

      <div class="history-section user-actions">
        <h3>${escapeHtml(t('tickets_detail_actions'))}</h3>
        <div class="ticket-actions">
          <textarea id="ticketReplyContent" class="input ticket-reply" placeholder="${escapeHtml(t('tickets_reply_placeholder'))}"></textarea>
          <div class="ticket-actions-row">
            <button type="button" class="btn xs" id="btnTicketSendReply">${escapeHtml(t('tickets_action_reply'))}</button>
            ${canClose ? `<button type="button" class="btn xs" id="btnTicketClose">${escapeHtml(t('tickets_action_close'))}</button>` : ''}
            ${canReopen ? `<button type="button" class="btn xs" id="btnTicketReopen">${escapeHtml(t('tickets_action_reopen'))}</button>` : ''}
            <button type="button" class="btn xs" id="btnTicketRefresh">${escapeHtml(t('reload'))}</button>
          </div>
        </div>
      </div>
    `;

    const guildId = getGuildId();
    const ticketId = ticket._id;

    // Load recent messages for context (so you can reply with history).
    (async () => {
      try {
        const box = panel.querySelector('#ticketsMessagesBox');
        if (!box) return;
        const res = await apiGet(`/tickets/${encodeURIComponent(ticketId)}/messages?guildId=${encodeURIComponent(guildId)}&limit=25`);
        const items = (res && Array.isArray(res.items)) ? res.items : [];
        if (!items.length) {
          box.innerHTML = `<div class="empty">${escapeHtml(t('tickets_messages_empty'))}</div>`;
          return;
        }
        // Filter out bot/system/empty messages on the UI too (backend also filters, but keep it defensive).
        const visible = items.filter((m) => {
          const c = String(m?.content || '').trim();
          if (!c) return false;
          if (!m?.isBot) return true;
          return !!m?.isStaffReply;
        });
        if (!visible.length) {
          box.innerHTML = `<div class="empty">${escapeHtml(t('tickets_messages_empty'))}</div>`;
          return;
        }

        box.innerHTML = visible.map((m) => {
          const who = m.isStaffReply ? (t('tickets_staff_label') || 'Staff') : (m.authorUsername || m.authorId || '');
          const when = m.createdAt ? fmtDate(m.createdAt) : '';
          const content = (m.content || '').toString();
          return `
            <div class="ticket-msg">
              <div class="ticket-msg-meta">
                 <strong>${escapeHtml(who)}</strong>${m.isStaffReply ? ' <span class="ticket-msg-badge">' + escapeHtml(t('tickets_staff_badge') || 'Dashboard') + '</span>' : ''}${when ? ' • ' + escapeHtml(when) : ''}
              </div>
              <div class="ticket-msg-body">${escapeHtml(content)}</div>
            </div>
          `;
        }).join('');
      } catch (e) {
        const box = panel.querySelector('#ticketsMessagesBox');
        if (box) box.innerHTML = `<div class="empty">${escapeHtml(t('tickets_messages_error'))}</div>`;
      }
    })();

    const btnSend = panel.querySelector('#btnTicketSendReply');
    if (btnSend) {
      btnSend.addEventListener('click', async () => {
        const ta = panel.querySelector('#ticketReplyContent');
        const content = (ta && ta.value ? ta.value : '').trim();
        if (!content) {
          toast(t('tickets_reply_empty'));
          return;
        }
        try {
          btnSend.disabled = true;
          const res = await apiPost(`/tickets/${encodeURIComponent(ticketId)}/reply`, { guildId, content });
          if (res && res.ok) {
            if (ta) ta.value = '';
            toast(t('tickets_reply_sent'));
            await loadTickets(true);
            // keep selection
            const idx = state.activeTicketIndex;
            if (typeof idx === 'number') setListActive(idx);
          } else {
            toast(t('tickets_error_generic'));
          }
        } catch (e) {
          toast((e && e.apiMessage) || t('tickets_error_generic'));
        } finally {
          btnSend.disabled = false;
        }
      });
    }

    const btnClose = panel.querySelector('#btnTicketClose');
    if (btnClose) {
      btnClose.addEventListener('click', async () => {
        try {
          btnClose.disabled = true;
          const res = await apiPost(`/tickets/${encodeURIComponent(ticketId)}/close`, { guildId });
          if (res && res.ok) {
            toast(t('tickets_closed'));
            await loadTickets(true);
          } else {
            toast(t('tickets_error_generic'));
          }
        } catch (e) {
          toast((e && e.apiMessage) || t('tickets_error_generic'));
        } finally {
          btnClose.disabled = false;
        }
      });
    }

    const btnReopen = panel.querySelector('#btnTicketReopen');
    if (btnReopen) {
      btnReopen.addEventListener('click', async () => {
        try {
          btnReopen.disabled = true;
          const res = await apiPost(`/tickets/${encodeURIComponent(ticketId)}/reopen`, { guildId });
          if (res && res.ok) {
            toast(t('tickets_reopened'));
            await loadTickets(true);
          } else {
            toast(t('tickets_error_generic'));
          }
        } catch (e) {
          toast((e && e.apiMessage) || t('tickets_error_generic'));
        } finally {
          btnReopen.disabled = false;
        }
      });
    }

    const btnRefresh = panel.querySelector('#btnTicketRefresh');
    if (btnRefresh) btnRefresh.addEventListener('click', () => loadTickets(true));
  }

  async function loadTickets(force) {
    const listEl = document.getElementById('ticketsList');
    if (!listEl) return;

    if (_loading && !force) return;
    _loading = true;

    try {
      await waitForI18nReady();
      const guildId = getGuildId();
      if (!guildId) {
        renderList([]);
        renderDetailEmpty();
        return;
      }

      const filterEl = document.getElementById('ticketsStatusFilter');
      const status = filterEl ? (filterEl.value || 'open') : 'open';

      listEl.innerHTML = `<div class="empty">${escapeHtml(t('tickets_loading'))}</div>`;
      renderDetailEmpty();

      const res = await apiGet(`/tickets?guildId=${encodeURIComponent(guildId)}&status=${encodeURIComponent(status)}&limit=100`);
      const items = (res && Array.isArray(res.items)) ? res.items : [];

      state.ticketsItems = items;
      state.activeTicketIndex = null;

      renderList(items);
      if (items.length) {
        selectTicketByIndex(0);
        setListActive(0);
      } else {
        renderDetailEmpty();
      }
    } catch (e) {
      console.error('loadTickets error', e);
      const listEl2 = document.getElementById('ticketsList');
      if (listEl2) listEl2.innerHTML = `<div class="empty">${escapeHtml(t('tickets_error_generic'))}</div>`;
      renderDetailEmpty();
    } finally {
      _loading = false;
    }
  }

  function initTicketsUI() {
    const reloadBtn = document.getElementById('btnReloadTickets');
    if (reloadBtn) reloadBtn.addEventListener('click', () => loadTickets(true));

    const filterEl = document.getElementById('ticketsStatusFilter');
    if (filterEl) filterEl.addEventListener('change', () => loadTickets(true));
  }

  document.addEventListener('DOMContentLoaded', function () {
    initTicketsUI();
  });

  // Expose
  D.loadTickets = loadTickets;
})();