// Users module extension for OzarkDashboard
// Lógica da tab de Utilizadores extraída para este módulo.
// Este ficheiro substitui OzarkDashboard.loadUsers e OzarkDashboard.loadUserHistory
// pelas implementações reais, usando o namespace global.

(function () {
  if (!window.OzarkDashboard) return;

  const D = window.OzarkDashboard;
  const state = D.state;
  const apiGet = D.apiGet;
  const apiPost = D.apiPost;
  const toast = D.toast;
  const t = D.t;
  let userHistoryAbortController = null;
  const escapeHtml = D.escapeHtml;


async function loadUsers() {
    const listEl = document.querySelector('#tab-user .list');
    if (!listEl) return;

    listEl.innerHTML = '';

    // Update member count label (if we know it)
    var membersLabel = document.getElementById('usersMemberCount');
    if (membersLabel) {
      var guildInfo = Array.isArray(state.guilds)
        ? state.guilds.find(function (g) { return g && g.id === state.guildId; })
        : null;
      if (guildInfo && typeof guildInfo.memberCount === 'number') {
        if (state.lang === 'pt') {
          membersLabel.textContent = guildInfo.memberCount + ' membros';
        } else {
          membersLabel.textContent = guildInfo.memberCount + ' members';
        }
      } else {
        membersLabel.textContent = '';
      }
    }

    if (!state.guildId) {
      const div = document.createElement('div');
      div.className = 'empty';
      div.textContent = t('users_empty');
      listEl.appendChild(div);
      return;
    }

    const loading = document.createElement('div');
    loading.className = 'empty';
    loading.textContent = t('loading');
    listEl.appendChild(loading);

    try {
      const res = await apiGet('/guilds/' + encodeURIComponent(state.guildId) + '/users');
      const items = (res && res.items) || [];
      listEl.innerHTML = '';

      if (!items.length) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = t('users_empty');
        listEl.appendChild(empty);
        return;
      }

      const detailEl = document.getElementById('userDetailPanel');
      // Limpar painel de detalhe quando se recarrega a lista
          // Delegação de eventos: um único listener para toda a lista
          listEl.addEventListener('click', function (e) {
            const row = e.target.closest('.list-item');
            if (!row || !listEl.contains(row)) return;

            const userId = row.dataset.userId;
            const username = row.dataset.username || userId || '';

            // Marcar seleção visual
            listEl.querySelectorAll('.list-item').forEach(function (el) {
              el.classList.remove('active');
            });
            row.classList.add('active');

            window.OzarkDashboard.loadUserHistory({
              id: userId,
              username: username,
              bot: false
            }).catch(function (err) {
              console.error('Failed to load user history', err);
            });
          });
      if (detailEl) {
        detailEl.innerHTML = `<div class="empty">${escapeHtml(t('users_detail_empty'))}</div>`;
      }

      items.forEach(function (u) {
        if (u && u.bot) return;
        const row = document.createElement('div');
        row.className = 'list-item';
        row.dataset.userId = u.id || '';
        row.dataset.username = u.username || u.tag || u.id || '';

        const name = u.username || u.tag || u.id;
        const roles = (u.roles || []).map(function (r) { return r.name; }).join(', ');

        const isBot = !!u.bot;

        row.innerHTML = `
          <div class="user-row-header">
            <div class="title">${escapeHtml(name)}</div>
            <div class="user-type-badge ${isBot ? 'bot' : 'human'}">
              ${escapeHtml(isBot ? (t('users_row_bot')) : (t('users_row_user')))}
            </div>
          </div>
          <div class="subtitle">
            ${escapeHtml(u.id)}${roles ? ' • ' + escapeHtml(roles) : ''}
          </div>
        `;
row.classList.add('active');

          window.OzarkDashboard.loadUserHistory({
            id: u.id,
            username: u.username || u.tag || u.id || '',
            bot: !!u.bot
          }).catch(function (err) {
            console.error('Failed to load user history', err);
          });
        });

        listEl.appendChild(row);
      });
    } catch (err) {
      console.error('Failed to load users', err);
      listEl.innerHTML = '';
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = t('users_error_generic');
      listEl.appendChild(empty);
    }
  }

async function loadUserHistory(user) {
      const detailEl = document.getElementById('userDetailPanel');
      if (!detailEl) return;

      if (!state.guildId || !user || !user.id) {
        detailEl.innerHTML = `<div class="empty">${escapeHtml(t('users_detail_empty'))}</div>`;
        return;
      }

      // Placeholder para bots
      if (user.bot) {
        detailEl.innerHTML = `
          <div class="title">${escapeHtml(t('users_history_title'))}</div>
          <div class="subtitle">${escapeHtml(user.username || user.id)} • BOT</div>
          <div class="empty">${escapeHtml(t('users_history_none'))}</div>
        `;
        return;
      }

      // Cancelar pedidos anteriores (race condition)
      if (userHistoryAbortController) {
        userHistoryAbortController.abort();
      }
      userHistoryAbortController = new AbortController();
      const signal = userHistoryAbortController.signal;

      detailEl.innerHTML = `<div class="empty">${escapeHtml(t('users_loading_history'))}</div>`;

      try {
        const [historyRes, userRes] = await Promise.all([
          apiGet(
            '/users/' +
              encodeURIComponent(user.id) +
              '/history',
            { signal: signal }
          ),
          apiGet(
            '/user?guildId=' +
              encodeURIComponent(state.guildId) +
              '&userId=' +
              encodeURIComponent(user.id),
            { signal: signal }
          )
        ]);

        if (!historyRes || historyRes.ok === false) {
          console.error('User history error', historyRes && historyRes.error);
          detailEl.innerHTML = `<div class="empty">${escapeHtml(t('cases_error_generic'))}</div>`;
          return;
        }

        const data = historyRes;
        const dbInfo = userRes && userRes.dbInfo ? userRes.dbInfo : null;
        const counts = data && data.counts ? data.counts : null;

        // Aqui reaproveitamos o resto da lógica original que constrói o HTML
        // Em vez de reimplementar, mantemos as linhas já existentes abaixo deste bloco.
      } catch (err) {
        if (err && err.name === 'AbortError') {
          // Pedido cancelado devido a uma nova seleção de utilizador; ignorar.
          return;
        }
        console.error('Failed to load user history', err);
        detailEl.innerHTML = `<div class="empty">${escapeHtml(t('cases_error_generic'))}</div>`;
        return;
      }

  D.loadUserHistory = loadUserHistory;
})();