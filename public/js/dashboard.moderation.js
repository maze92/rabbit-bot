// Moderation module extension for OzarkDashboard
// Lógica da tab de Moderação (Logs & Cases) extraída para este módulo.

(function () {
  if (!window.OzarkDashboard) return;

  const D = window.OzarkDashboard;
  const state = D.state;
  const apiGet = D.apiGet;
  const apiPost = D.apiPost;
  const toast = D.toast;
  const t = D.t;
  const escapeHtml = D.escapeHtml;
  const createLogRow = D.createLogRow;
  const createCaseRow = D.createCaseRow;
  const renderLogs = D.renderLogs;

  let logsAbortController = null;
  let casesAbortController = null;
  let modServerRange = '24h';
  let modTicketsRange = '24h';
  let modTicketsPage = 1;

  async function loadLogs() {
    const listEl = document.getElementById('logsList');
    const searchInput = document.getElementById('logSearch');
    const typeSelect = document.getElementById('logType');
    if (!listEl || !typeSelect) return;

    listEl.innerHTML = '';

    if (!state.guildId) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = t('warn_select_guild');
      listEl.appendChild(empty);
      return;
    }

    const loading = document.createElement('div');
    loading.className = 'empty';
    loading.textContent = t('logs_loading');
    listEl.appendChild(loading);

    if (logsAbortController) {
      logsAbortController.abort();
    }
    logsAbortController = new AbortController();
    const signal = logsAbortController.signal;

    try {
      const params = [];
      params.push('guildId=' + encodeURIComponent(state.guildId));
      let limit = 10;
      const limitSelect = document.getElementById('logLimit');
      if (limitSelect && limitSelect.value) {
        const n = Number(limitSelect.value);
        if (Number.isFinite(n) && n > 0) limit = n;
      }
      params.push('limit=' + String(limit));
      params.push('page=1');

      if (searchInput && searchInput.value) {
        const s = searchInput.value.toString().trim();
        if (s) params.push('search=' + encodeURIComponent(s));
      }

      const typeValue = (typeSelect.value || '').trim();
      if (typeValue) {
        params.push('type=' + encodeURIComponent(typeValue));
      }

      const url = '/logs?' + params.join('&');
      const res = await apiGet(url, { signal: signal });

      listEl.innerHTML = '';

      const items = (res && res.items) || [];
      renderLogs(items);
    } catch (err) {
      if (err && err.name === 'AbortError') {
        return;
      }
      console.error('Failed to load logs', err);
      listEl.innerHTML = '';
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = t('logs_error_generic');
      listEl.appendChild(empty);
    } finally {
      logsAbortController = null;
    }
  }

async function loadCases() {
    const section = document.getElementById('tab-cases');
    if (!section) return;

    const listEl = section.querySelector('.list');
    if (!listEl) return;

    listEl.innerHTML = '';

    if (!state.guildId) {
      const div = document.createElement('div');
      div.className = 'empty';
      div.textContent = t('cases_empty');
      listEl.appendChild(div);
      return;
    }

    const loading = document.createElement('div');
    loading.className = 'empty';
    loading.textContent = t('cases_loading') || 'A carregar casos...';
    listEl.appendChild(loading);

    if (casesAbortController) {
      casesAbortController.abort();
    }
    casesAbortController = new AbortController();
    const signal = casesAbortController.signal;

    try {
      const res = await apiGet(
        '/cases?guildId=' + encodeURIComponent(state.guildId) + '&limit=25&page=1',
        { signal: signal }
      );
      const items = (res && res.items) || [];
      listEl.innerHTML = '';

      if (!items.length) {
        const div = document.createElement('div');
        div.className = 'empty';
        div.textContent = t('cases_empty');
        listEl.appendChild(div);
        return;
      }

      items.forEach(function (c) {
        const row = createCaseRow(c);
        listEl.appendChild(row);
      });
    } catch (err) {
      if (err && err.name === 'AbortError') {
        return;
      }
      console.error('Failed to load cases', err);
      listEl.innerHTML = '';
      const div = document.createElement('div');
      div.className = 'empty';
      div.textContent = t('cases_error_generic');
      listEl.appendChild(div);
    } finally {
      casesAbortController = null;
    }
  }


  async function loadModerationOverview() {
    const guildId = state.guildId;
    const insightsContent = document.getElementById('modServerInsightsContent');
    const ticketsList = document.getElementById('modTicketsList');

    if (!insightsContent || !ticketsList) return;

    if (!guildId) {
      insightsContent.innerHTML = '';
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = t('logs_server_insights_no_guild') || 'Selecione um servidor para ver as análises.';
      insightsContent.appendChild(empty);

      ticketsList.innerHTML = '';
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = t('logs_tickets_panel_no_guild') || 'Selecione um servidor para ver os tickets.';
      ticketsList.appendChild(li);
      return;
    }

    // Painel de análises (moderação)
    try {
      insightsContent.innerHTML = '';
      const loading = document.createElement('div');
      loading.className = 'empty';
      loading.textContent = t('logs_server_insights_loading') || 'A carregar análises de moderação...';
      insightsContent.appendChild(loading);

      const res = await apiGet(
        '/mod/overview?guildId=' + encodeURIComponent(guildId) + '&range=' + encodeURIComponent(modServerRange)
      );

      insightsContent.innerHTML = '';

      if (!res || !res.ok) {
        const errBox = document.createElement('div');
        errBox.className = 'empty';
        errBox.textContent = t('logs_server_insights_error') || 'Não foi possível carregar as análises.';
        insightsContent.appendChild(errBox);
      } else {
        const counts = (res && res.moderationCounts) || {};
        const list = document.createElement('ul');
        list.className = 'simple-list';

        const rows = [
          { key: 'warn', label: t('logs_server_insights_warn') || 'Avisos (warn)', value: counts.warn || 0 },
          { key: 'mute', label: t('logs_server_insights_mute') || 'Mutes', value: counts.mute || 0 },
          { key: 'unmute', label: t('logs_server_insights_unmute') || 'Unmutes', value: counts.unmute || 0 },
          { key: 'kick', label: t('logs_server_insights_kick') || 'Kicks', value: counts.kick || 0 },
          { key: 'ban', label: t('logs_server_insights_ban') || 'Bans', value: counts.ban || 0 },
          { key: 'other', label: t('logs_server_insights_other') || 'Outros registos', value: counts.other || 0 }
        ];

        let total = 0;
        rows.forEach(function (r) { total += r.value; });

        if (!total) {
          const empty = document.createElement('div');
          empty.className = 'empty';
          empty.textContent = t('logs_server_insights_empty') || 'Ainda não existem dados de moderação no período selecionado.';
          insightsContent.appendChild(empty);
        } else {
          rows.forEach(function (r) {
            const li = document.createElement('li');
            li.innerHTML = '<strong>' + escapeHtml(String(r.label)) + ':</strong> ' + String(r.value);
            list.appendChild(li);
          });

          insightsContent.appendChild(list);
        }
      }
    } catch (err) {
      console.error('Failed to load moderation overview', err);
      insightsContent.innerHTML = '';
      const errBox = document.createElement('div');
      errBox.className = 'empty';
      errBox.textContent = t('logs_server_insights_error') || 'Não foi possível carregar as análises.';
      insightsContent.appendChild(errBox);
    }

    // Painel de análises de tickets (com intervalo e paginação)
    try {
      ticketsList.innerHTML = '';
      const loadingTickets = document.createElement('li');
      loadingTickets.className = 'empty';
      loadingTickets.textContent = t('logs_tickets_panel_loading') || 'A carregar tickets...';
      ticketsList.appendChild(loadingTickets);

      const resTickets = await apiGet(
        '/logs?type=tickets&limit=10&page=' +
          encodeURIComponent(String(modTicketsPage)) +
          '&guildId=' +
          encodeURIComponent(guildId)
      );

      const rawItems = (resTickets && resTickets.items) || [];

      const now = Date.now();
      let windowMs = 24 * 60 * 60 * 1000;
      if (modTicketsRange === '7d') windowMs = 7 * 24 * 60 * 60 * 1000;
      else if (modTicketsRange === '30d') windowMs = 30 * 24 * 60 * 60 * 1000;
      else if (modTicketsRange === '1y') windowMs = 365 * 24 * 60 * 60 * 1000;
      const cutoff = now - windowMs;

      const items = rawItems.filter(function (it) {
        const tsStr = it.createdAt || it.timestamp || it.time;
        if (!tsStr) return true;
        const ts = Date.parse(tsStr);
        if (!Number.isFinite(ts)) return true;
        return ts >= cutoff;
      });

      ticketsList.innerHTML = '';

      if (!items.length) {
        const li = document.createElement('li');
        li.className = 'empty';
        li.textContent =
          t('logs_tickets_panel_empty_range') ||
          t('logs_tickets_panel_empty') ||
          'Não existem tickets no período selecionado.';
        ticketsList.appendChild(li);
      } else {
        items.forEach(function (it) {
          const li = document.createElement('li');
          const title = it.title || 'Ticket';
          const desc = it.description || '';
          li.innerHTML =
            '<div class="title">' +
            escapeHtml(String(title)) +
            '</div>' +
            (desc ? '<div class="subtitle">' + escapeHtml(String(desc)) + '</div>' : '');
          ticketsList.appendChild(li);
        });
      }
    } catch (err) {
      console.error('Failed to load moderation tickets panel', err);
      ticketsList.innerHTML = '';
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = t('logs_tickets_panel_error') || 'Não foi possível carregar os tickets.';
      ticketsList.appendChild(li);
    }
  }


  document.addEventListener('DOMContentLoaded', function () {
    const serverRangeEl = document.getElementById('modServerInsightsRange');
    if (serverRangeEl) {
      serverRangeEl.addEventListener('click', function (ev) {
        const btn = ev.target.closest('.chip');
        if (!btn || !btn.dataset.range) return;
        const range = btn.dataset.range;
        if (!range) return;
        modServerRange = range;
        Array.from(serverRangeEl.querySelectorAll('.chip')).forEach(function (el) {
          el.classList.toggle('chip-active', el === btn);
        });
        loadModerationOverview();
      });
    }

    const ticketsRangeEl = document.getElementById('modTicketsRange');
    if (ticketsRangeEl) {
      ticketsRangeEl.addEventListener('click', function (ev) {
        const btn = ev.target.closest('.chip');
        if (!btn || !btn.dataset.range) return;
        const range = btn.dataset.range;
        if (!range) return;
        modTicketsRange = range;
        modTicketsPage = 1;
        Array.from(ticketsRangeEl.querySelectorAll('.chip')).forEach(function (el) {
          el.classList.toggle('chip-active', el === btn);
        });
        loadModerationOverview();
      });
    }

    const btnPrev = document.getElementById('modTicketsPrevPage');
    const btnNext = document.getElementById('modTicketsNextPage');
    if (btnPrev && btnNext) {
      btnPrev.addEventListener('click', function () {
        if (modTicketsPage > 1) {
          modTicketsPage -= 1;
          loadModerationOverview();
        }
      });
      btnNext.addEventListener('click', function () {
        modTicketsPage += 1;
        loadModerationOverview();
      });
    }
  });


// Substituir as funções no namespace pela versão deste módulo
  D.loadLogs = loadLogs;
  D.loadModerationOverview = loadModerationOverview;
})();
