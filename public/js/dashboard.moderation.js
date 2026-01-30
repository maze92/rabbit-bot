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
      params.push('limit=50');
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
        '/mod/overview?guildId=' + encodeURIComponent(guildId)
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

    // Painel de últimos tickets (24h)
    try {
      ticketsList.innerHTML = '';
      const loadingTickets = document.createElement('li');
      loadingTickets.className = 'empty';
      loadingTickets.textContent = t('logs_tickets_panel_loading') || 'A carregar tickets...';
      ticketsList.appendChild(loadingTickets);

      const resTickets = await apiGet(
        '/logs?type=tickets&limit=5&page=1&guildId=' + encodeURIComponent(guildId)
      );

      const items = (resTickets && resTickets.items) || [];
      const now = Date.now();
      const cutoff = now - 24 * 60 * 60 * 1000;

      const recent = items.filter(function (it) {
        if (!it.time) return true; // se não houver time normalizado, não filtrar agressivamente
        const ts = Date.parse(it.time);
        if (Number.isNaN(ts)) return true;
        return ts >= cutoff;
      });

      ticketsList.innerHTML = '';

      if (!recent.length) {
        const li = document.createElement('li');
        li.className = 'empty';
        li.textContent = t('logs_tickets_panel_empty') || 'Não existem tickets nas últimas 24 horas.';
        ticketsList.appendChild(li);
      } else {
        recent.forEach(function (it) {
          const li = document.createElement('li');
          const title = it.title || 'Ticket';
          const desc = it.description || '';
          li.innerHTML = '<div class="title">' + escapeHtml(String(title)) + '</div>' +
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

// Substituir as funções no namespace pela versão deste módulo
  D.loadLogs = loadLogs;
  D.loadModerationOverview = loadModerationOverview;
})();
