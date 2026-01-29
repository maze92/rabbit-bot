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
        const res = await apiGet(url);

        listEl.innerHTML = '';

        const items = (res && res.items) || [];
        renderLogs(items);
      } catch (err) {
        console.error('Failed to load logs', err);
        listEl.innerHTML = '';
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = t('logs_error_generic');
        listEl.appendChild(empty);
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
      loading.textContent = '...';
      listEl.appendChild(loading);

      try {
        const res = await apiGet('/cases?guildId=' + encodeURIComponent(state.guildId) + '&limit=25&page=1');
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
        console.error('Failed to load cases', err);
        listEl.innerHTML = '';
        const div = document.createElement('div');
        div.className = 'empty';
        div.textContent = t('cases_error_generic');
        listEl.appendChild(div);
      }
    }

  // Substituir as funções no namespace pela versão deste módulo
  D.loadLogs = loadLogs;
  D.loadCases = loadCases;
})();
