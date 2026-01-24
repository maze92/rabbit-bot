'use strict';

(function () {
  const state = {
    lang: 'pt',
    guildId: null,
    currentTab: 'overview',
  };

  const API_BASE = '/api';
  const TOKEN_KEY = 'OZARK_DASH_TOKEN';

  // -----------------------------
  // Small helpers
  // -----------------------------

  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function setToken(token) {
    try {
      if (token) {
        localStorage.setItem(TOKEN_KEY, token);
      }
    } catch (e) {
      // ignore
    }
  }

  function ensureToken() {
    let token = getToken();
    if (token) return token;

    const msg =
      state.lang === 'en'
        ? 'Enter the dashboard token (DASHBOARD_TOKEN from .env):'
        : 'Introduz o token do dashboard (DASHBOARD_TOKEN do .env):';
    token = window.prompt(msg, '') || '';
    token = token.trim();
    if (!token) return '';
    setToken(token);
    return token;
  }

  function getAuthHeaders() {
    const headers = {};
    const token = ensureToken();
    if (token) {
      // Backend aceita tanto Authorization Bearer como x-dashboard-token.
      headers['x-dashboard-token'] = token;
    }
    return headers;
  }

  async function apiGet(path) {
    const res = await fetch(API_BASE + path, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      throw new Error('HTTP ' + res.status + ' for ' + path);
    }
    return res.json();
  }

  async function apiPost(path, body) {
    const res = await fetch(API_BASE + path, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeaders()),
      body: JSON.stringify(body || {}),
    });
    if (!res.ok) {
      throw new Error('HTTP ' + res.status + ' for ' + path);
    }
    return res.json();
  }

  function toast(message) {
    const id = 'ozarkToast';
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.style.position = 'fixed';
      el.style.right = '16px';
      el.style.bottom = '16px';
      el.style.padding = '10px 14px';
      el.style.background = 'rgba(0,0,0,0.75)';
      el.style.color = '#fff';
      el.style.borderRadius = '6px';
      el.style.fontSize = '13px';
      el.style.zIndex = '9999';
      el.style.transition = 'opacity 0.25s ease';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.style.opacity = '1';
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(function () {
      el.style.opacity = '0';
    }, 2400);
  }

  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return value
      .toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // -----------------------------
  // i18n (simplificado)
  // -----------------------------

  const I18N = {
    pt: {
      app_subtitle: 'Dashboard de moderação e gestão',
      select_guild: 'Seleciona um servidor',
      badge_bot_online: '* Bot online',

      tab_overview: 'Visão geral',
      tab_logs: 'Moderação',
      tab_cases: 'Casos',
      tab_tickets: 'Tickets',
      tab_gamenews: 'GameNews',
      tab_user: 'Utilizadores',
      tab_config: 'Configuração',

      warn_select_guild: 'Selecione um servidor para aceder às restantes secções.',

      overview_title: 'Visão geral',
      overview_hint: 'Resumo rápido da atividade de moderação do bot.',
      kpi_guilds: 'Servidores ligados',
      kpi_users: 'Utilizadores monitorizados',
      kpi_actions_24h: 'Ações de moderação (últimas 24h)',

      tickets_title: 'Tickets',
      tickets_hint: 'Gerir pedidos de suporte abertos através do bot.',
      tickets_empty: 'Ainda não existem tickets neste servidor.',
      tickets_loading: 'A carregar tickets...',
      tickets_error_generic: 'Não foi possível carregar os tickets.',
      tickets_reply_placeholder: 'Escreve a resposta a enviar para o ticket...',
      tickets_reply_success: 'Resposta enviada para o ticket.',
      tickets_close_success: 'Ticket fechado.',
      tickets_close_confirm: 'Tens a certeza que queres fechar este ticket?',

      gamenews_title: 'GameNews',
      gamenews_hint: 'Estado dos feeds de notícias e últimas publicações.',
      gamenews_empty: 'Nenhum feed de GameNews configurado neste momento.',
      gamenews_loading: 'A carregar estado dos feeds...',
      gamenews_error_generic: 'Não foi possível carregar GameNews.',
      gamenews_editor_title: 'Configuração de feeds',
      gamenews_editor_hint: 'Adiciona, edita ou remove feeds e escolhe o canal para cada um.',
      gamenews_add_feed: 'Adicionar feed',
      gamenews_save_feeds: 'Guardar alterações',
      gamenews_save_success: 'Feeds de GameNews guardados.',

      users_title: 'Utilizadores',
      users_hint: 'Lista rápida de utilizadores do servidor.',
      users_empty: 'Selecione um servidor para ver utilizadores.',

      config_title: 'Configuração do servidor',
      config_hint: 'Define canais de logs e cargos de staff para este servidor.',
      config_log_channel: 'Canal de logs principal',
      config_dashboard_log_channel: 'Canal de logs da dashboard',
      config_staff_roles: 'Cargos de staff',
      config_staff_roles_hint:
        'Se vazio, são usadas as roles de staff globais definidas no ficheiro de configuração.',
      config_reload: 'Recarregar',
      config_save: 'Guardar configuração',
      config_saved: 'Configuração do servidor guardada.',
      config_loading: 'A carregar configuração...',
      config_error_generic: 'Não foi possível carregar a configuração.',
    },

    en: {
      app_subtitle: 'Moderation and management dashboard',
      select_guild: 'Select a server',
      badge_bot_online: '* Bot online',

      tab_overview: 'Overview',
      tab_logs: 'Moderation',
      tab_cases: 'Cases',
      tab_tickets: 'Tickets',
      tab_gamenews: 'GameNews',
      tab_user: 'Users',
      tab_config: 'Server config',

      warn_select_guild: 'Select a server to access the other sections.',

      overview_title: 'Overview',
      overview_hint: 'Quick summary of the bot moderation activity.',
      kpi_guilds: 'Connected guilds',
      kpi_users: 'Monitored users',
      kpi_actions_24h: 'Moderation actions (last 24h)',

      tickets_title: 'Tickets',
      tickets_hint: 'Manage support requests opened via the bot.',
      tickets_empty: 'There are no tickets for this guild yet.',
      tickets_loading: 'Loading tickets...',
      tickets_error_generic: 'Could not load tickets.',
      tickets_reply_placeholder: 'Write the reply to send to this ticket...',
      tickets_reply_success: 'Reply sent to ticket.',
      tickets_close_success: 'Ticket closed.',
      tickets_close_confirm: 'Are you sure you want to close this ticket?',

      gamenews_title: 'GameNews',
      gamenews_hint: 'Status of news feeds and last deliveries.',
      gamenews_empty: 'No GameNews feeds are configured at the moment.',
      gamenews_loading: 'Loading GameNews status...',
      gamenews_error_generic: 'Could not load GameNews.',
      gamenews_editor_title: 'Feeds configuration',
      gamenews_editor_hint: 'Add, edit or remove feeds and choose the target channel for each one.',
      gamenews_add_feed: 'Add feed',
      gamenews_save_feeds: 'Save changes',
      gamenews_save_success: 'GameNews feeds saved.',

      users_title: 'Users',
      users_hint: 'Quick list of guild users.',
      users_empty: 'Select a server to see the users list.',

      config_title: 'Server configuration',
      config_hint: 'Define log channels and staff roles for this guild.',
      config_log_channel: 'Main log channel',
      config_dashboard_log_channel: 'Dashboard log channel',
      config_staff_roles: 'Staff roles',
      config_staff_roles_hint:
        'If empty, the global staffRoles from config file are used.',
      config_reload: 'Reload',
      config_save: 'Save configuration',
      config_saved: 'Server configuration saved.',
      config_loading: 'Loading configuration...',
      config_error_generic: 'Could not load configuration.',
    },
  };

  function t(key) {
    const lang = I18N[state.lang] ? state.lang : 'pt';
    const table = I18N[lang] || I18N.pt;
    return Object.prototype.hasOwnProperty.call(table, key)
      ? table[key]
      : (I18N.pt && I18N.pt[key]) || key;
  }

  function applyI18n() {
    document.documentElement.lang = state.lang;

    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      const key = el.getAttribute('data-i18n');
      if (!key) return;
      el.textContent = t(key);
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      const key = el.getAttribute('data-i18n-placeholder');
      if (!key) return;
      el.setAttribute('placeholder', t(key));
    });

    const warn = document.getElementById('tabWarning');
    if (warn) warn.textContent = t('warn_select_guild');
  }

  function setLang(newLang) {
    state.lang = (newLang || 'pt').toLowerCase();
    applyI18n();
    const msg = state.lang === 'en' ? 'Language updated.' : 'Idioma alterado.';
    toast(msg);
  }

  // -----------------------------
  // Tab / layout helpers
  // -----------------------------

  function setTab(name) {
    const tabsRequiringGuild = ['logs', 'cases', 'tickets', 'gamenews', 'user', 'config'];
    if (!state.guildId && tabsRequiringGuild.indexOf(name) !== -1) {
      // Em vez de mudar tab, certifica-nos que overview está ativo
      state.currentTab = 'overview';
      const warn = document.getElementById('tabWarning');
      if (warn) {
        warn.style.display = 'block';
      }
      // Reforçar botões ativos
      document.querySelectorAll('.section').forEach(function (sec) {
        sec.classList.remove('active');
      });
      document.querySelectorAll('.tabs button[data-tab]').forEach(function (btn) {
        btn.classList.remove('active');
      });
      const section = document.getElementById('tab-overview');
      const button = document.querySelector('.topnav button[data-tab="overview"]');
      if (section) section.classList.add('active');
      if (button) button.classList.add('active');
      return;
    }
    state.currentTab = name;

    document.querySelectorAll('.section').forEach(function (sec) {
      sec.classList.remove('active');
    });
    document.querySelectorAll('.tabs button[data-tab]').forEach(function (btn) {
      btn.classList.remove('active');
    });

    const section = document.getElementById('tab-' + name);
    const button = document.querySelector('.topnav button[data-tab="' + name + '"]');
    if (section) section.classList.add('active');
    if (button) button.classList.add('active');

    updateTabAccess();
    if (name === 'overview') {
      loadOverview().catch(function () {});
    } else if (name === 'cases') {
      loadCases().catch(function () {});
    } else if (name === 'gamenews') {
      loadGameNews().catch(function () {});
    } else if (name === 'tickets') {
      loadTickets().catch(function () {});
    } else if (name === 'user') {
      loadUsers().catch(function () {});
    } else if (name === 'config') {
      loadGuildConfig().catch(function () {});
    }
  }

  function updateTabAccess() {
    const warn = document.getElementById('tabWarning');
    const hasGuild = !!state.guildId;
    if (warn) {
      warn.style.display = hasGuild ? 'none' : 'block';
    }

    const tabsRequiringGuild = ['logs', 'cases', 'tickets', 'gamenews', 'user', 'config'];
    tabsRequiringGuild.forEach(function (name) {
      const btn = document.querySelector('.topnav button[data-tab="' + name + '"]');
      if (!btn) return;
      btn.disabled = !hasGuild;
    });
  }

  // -----------------------------
  // Overview
  // -----------------------------

  async function loadOverview() {
    const guildsEl = document.getElementById('kpiGuilds');
    const usersEl = document.getElementById('kpiUsers');
    const actionsEl = document.getElementById('kpiActions24h');
    if (!guildsEl || !usersEl || !actionsEl) return;

    try {
      const data = await apiGet('/overview');
      if (!data || data.ok === false) {
        throw new Error('Bad payload');
      }
      guildsEl.textContent = String(data.guilds ?? 0);
      usersEl.textContent = String(data.users ?? 0);
      actionsEl.textContent = String(data.actions24h ?? 0);
    } catch (err) {
      console.error('Overview load error', err);
      toast('Erro ao carregar visão geral / overview error.');
    }
  }

  // -----------------------------
  // Guilds + Users
  // -----------------------------

  async function loadGuilds() {
    const select = document.getElementById('guildPicker');
    if (!select) return;

    select.innerHTML = '';
    const optLoading = document.createElement('option');
    optLoading.value = '';
    optLoading.textContent = '...';
    select.appendChild(optLoading);

    try {
      const res = await apiGet('/guilds');
      const items = (res && res.items) || [];
      select.innerHTML = '';

      const optEmpty = document.createElement('option');
      optEmpty.value = '';
      optEmpty.textContent = t('select_guild');
      select.appendChild(optEmpty);

      items.forEach(function (g) {
        const opt = document.createElement('option');
        opt.value = g.id;
        opt.textContent = g.name;
        select.appendChild(opt);
      });

      if (state.guildId) {
        select.value = state.guildId;
      }
    } catch (err) {
      console.error('Failed to load guilds', err);
      toast('Erro ao carregar lista de servidores / error loading guilds.');
    }
  }

  async function loadUsers() {
    const listEl = document.querySelector('#tab-user .list');
    if (!listEl) return;

    listEl.innerHTML = '';

    if (!state.guildId) {
      const div = document.createElement('div');
      div.className = 'empty';
      div.textContent = t('users_empty');
      listEl.appendChild(div);
      return;
    }

    const loading = document.createElement('div');
    loading.className = 'empty';
    loading.textContent = '...';
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

      items.forEach(function (u) {
        const row = document.createElement('div');
        row.className = 'list-item';

        const name = u.username || u.tag || u.id;
        const roles = (u.roles || []).map(function (r) { return r.name; }).join(', ');

        row.innerHTML =
          '<div class="title">' + escapeHtml(name) + '</div>' +
          '<div class="subtitle">' +
          escapeHtml(u.id) +
          (roles ? ' • ' + escapeHtml(roles) : '') +
          '</div>';

        listEl.appendChild(row);
      });
    } catch (err) {
      console.error('Failed to load users', err);
      listEl.innerHTML = '';
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'Erro ao carregar utilizadores / error loading users.';
      listEl.appendChild(empty);
    }
  }

  // -----------------------------
  // GameNews (status + editor)
  // -----------------------------

  function renderGameNewsStatus(items) {
    const listEl = document.getElementById('gamenewsStatusList');
    if (!listEl) return;
    listEl.innerHTML = '';

    if (!items || !items.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = t('gamenews_empty');
      listEl.appendChild(empty);
      return;
    }

    items.forEach(function (s) {
      const row = document.createElement('div');
      row.className = 'list-item';

      const lastSent = s.lastSentAt ? new Date(s.lastSentAt).toLocaleString() : '—';
      const fails = s.failCount != null ? String(s.failCount) : '0';
      const statusText =
        (s.enabled === false ? 'Desativado / Disabled' : 'Ativo / Active') +
        ' • Falhas: ' +
        fails;

      row.innerHTML =
        '<div class="title">' +
        escapeHtml(s.feedName || s.source || 'Feed') +
        '</div>' +
        '<div class="subtitle">' +
        escapeHtml(s.feedUrl || '') +
        '</div>' +
        '<div class="meta">' +
        escapeHtml(statusText) +
        ' • Último envio / last: ' +
        escapeHtml(lastSent) +
        '</div>';

      listEl.appendChild(row);
    });
  }

  function renderGameNewsEditor(feeds) {
    const listEl = document.getElementById('gamenewsFeedsList');
    if (!listEl) return;
    listEl.innerHTML = '';

    if (!feeds || !feeds.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent =
        state.lang === 'en'
          ? 'No feeds configured yet. Add your first feed to get started.'
          : 'Ainda não existem feeds configurados. Adiciona o primeiro feed para começar.';
      listEl.appendChild(empty);
      return;
    }

    feeds.forEach(function (f, idx) {
      const row = document.createElement('div');
      row.className = 'list-item';
      row.dataset.index = String(idx);

      row.innerHTML =
        '<div class="row gap">' +
        '  <div class="col">' +
        '    <label>Nome</label>' +
        '    <input type="text" class="input feed-name" value="' + escapeHtml(f.name || '') + '" />' +
        '  </div>' +
        '  <div class="col">' +
        '    <label>Feed URL</label>' +
        '    <input type="text" class="input feed-url" value="' + escapeHtml(f.feedUrl || '') + '" />' +
        '  </div>' +
        '</div>' +
        '<div class="row gap" style="margin-top:6px;">' +
        '  <div class="col">' +
        '    <label>Canal ID</label>' +
        '    <input type="text" class="input feed-channel" value="' + escapeHtml(f.channelId || '') + '" />' +
        '  </div>' +
        '  <div class="col" style="display:flex;align-items:center;gap:8px;">' +
        '    <label><input type="checkbox" class="feed-enabled"' +
        (f.enabled === false ? '' : ' checked') +
        '> Ativo</label>' +
        '    <button type="button" class="btn btn-small btn-remove-feed">Remover</button>' +
        '  </div>' +
        '</div>';

      listEl.appendChild(row);
    });
  }

  function collectGameNewsEditorFeeds() {
    const listEl = document.getElementById('gamenewsFeedsList');
    if (!listEl) return [];
    const rows = Array.prototype.slice.call(listEl.querySelectorAll('.list-item'));
    return rows
      .map(function (row) {
        const name = row.querySelector('.feed-name').value.trim();
        const feedUrl = row.querySelector('.feed-url').value.trim();
        const channelId = row.querySelector('.feed-channel').value.trim();
        const enabled = row.querySelector('.feed-enabled').checked;
        if (!feedUrl || !channelId) return null;
        return { name: name || 'Feed', feedUrl: feedUrl, channelId: channelId, enabled: enabled };
      })
      .filter(function (x) { return !!x; });
  }

  async function loadGameNews() {
    const statusList = document.getElementById('gamenewsStatusList');
    const feedsList = document.getElementById('gamenewsFeedsList');
    if (statusList) {
      statusList.innerHTML = '';
      const loading = document.createElement('div');
      loading.className = 'empty';
      loading.textContent = t('gamenews_loading');
      statusList.appendChild(loading);
    }
    if (feedsList) {
      feedsList.innerHTML = '';
      const loading2 = document.createElement('div');
      loading2.className = 'empty';
      loading2.textContent = t('gamenews_loading');
      feedsList.appendChild(loading2);
    }

    try {
      const status = await apiGet('/gamenews-status');
      renderGameNewsStatus((status && status.items) || []);
    } catch (err) {
      console.error('GameNews status error', err);
      if (statusList) {
        statusList.innerHTML = '';
        const div = document.createElement('div');
        div.className = 'empty';
        div.textContent = t('gamenews_error_generic');
        statusList.appendChild(div);
      }
    }

    try {
      const feeds = await apiGet('/gamenews/feeds');
      renderGameNewsEditor((feeds && feeds.items) || []);
    } catch (err) {
      console.error('GameNews feeds error', err);
      if (feedsList) {
        feedsList.innerHTML = '';
        const div = document.createElement('div');
        div.className = 'empty';
        div.textContent = t('gamenews_error_generic');
        feedsList.appendChild(div);
      }
    }
  }

  async function saveGameNewsFeeds() {
    try {
      const feeds = collectGameNewsEditorFeeds();
      await apiPost('/gamenews/feeds', { feeds: feeds });
      toast(t('gamenews_save_success'));
      await loadGameNews();
    } catch (err) {
      console.error('Failed to save GameNews feeds', err);
      toast('Erro ao guardar GameNews / error saving GameNews.');
    }
  }

  
  // -----------------------------
  // Cases (infractions history)
  // -----------------------------

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
        const row = document.createElement('div');
        row.className = 'list-item';

        const title = (c.type || 'CASE') + ' • ' + (c.userId || '—');
        const subtitleParts = [];

        if (c.caseId) subtitleParts.push('#' + c.caseId);
        if (c.reason) subtitleParts.push(c.reason);
        if (c.createdAt) subtitleParts.push(new Date(c.createdAt).toLocaleString());

        row.innerHTML =
          '<div class="title">' + escapeHtml(title) + '</div>' +
          '<div class="subtitle">' + escapeHtml(subtitleParts.join(' • ')) + '</div>';

        listEl.appendChild(row);
      });
    } catch (err) {
      console.error('Failed to load cases', err);
      listEl.innerHTML = '';
      const div = document.createElement('div');
      div.className = 'empty';
      div.textContent = 'Erro ao carregar casos / error loading cases.';
      listEl.appendChild(div);
    }
  }

// -----------------------------
  // Tickets
  // -----------------------------

  function renderTickets(items) {
    const listEl = document.getElementById('ticketsList');
    if (!listEl) return;
    listEl.innerHTML = '';

    if (!items || !items.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = t('tickets_empty');
      listEl.appendChild(empty);
      return;
    }

    items.forEach(function (tkt) {
      const row = document.createElement('div');
      row.className = 'list-item';
      row.dataset.ticketId = String(tkt._id || tkt.id);

      const created = tkt.createdAt ? new Date(tkt.createdAt).toLocaleString() : '—';
      const status = tkt.status || 'OPEN';

      let actionsHtml = '';
      actionsHtml += '  <button type="button" class="btn btn-small btn-ticket-reply">Responder</button>';
      if (status === 'CLOSED') {
        actionsHtml += '  <button type="button" class="btn btn-small btn-ticket-delete">Apagar</button>';
      } else {
        actionsHtml += '  <button type="button" class="btn btn-small btn-ticket-close">Fechar</button>';
      }

      row.innerHTML =
        '<div class="title">#' +
        escapeHtml(String(tkt._id || '').slice(-6)) +
        ' • ' +
        escapeHtml(tkt.subject || tkt.topic || 'Ticket') +
        '</div>' +
        '<div class="subtitle">' +
        escapeHtml(tkt.userTag || tkt.userId || '') +
        ' • ' +
        escapeHtml(status) +
        ' • ' +
        escapeHtml(created) +
        '</div>' +
        '<div class="actions" style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap;">' +
        actionsHtml +
        '</div>';

      listEl.appendChild(row);
    });
  }

  async function loadTickets() {
    const listEl = document.getElementById('ticketsList');
    if (!listEl) return;

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
    loading.textContent = t('tickets_loading');
    listEl.appendChild(loading);

    try {
      const res = await apiGet('/tickets?guildId=' + encodeURIComponent(state.guildId));
      renderTickets((res && res.items) || []);
    } catch (err) {
      console.error('Failed to load tickets', err);
      listEl.innerHTML = '';
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = t('tickets_error_generic');
      listEl.appendChild(empty);
    }
  }

  async function closeTicket(ticketId) {
    if (!state.guildId) return;
    const confirmMsg = t('tickets_close_confirm');
    const ok = window.confirm(confirmMsg);
    if (!ok) return;

    try {
      await apiPost('/tickets/' + encodeURIComponent(ticketId) + '/close', {
        guildId: state.guildId,
      });
      toast(t('tickets_close_success'));
      await loadTickets();
    } catch (err) {
      console.error('Failed to close ticket', err);
      toast('Erro ao fechar ticket / error closing ticket.');
    }
  }

  async function replyTicket(ticketId) {
    if (!state.guildId) return;
    const placeholder = t('tickets_reply_placeholder');
    const content = window.prompt(placeholder, '');
    if (!content) return;

    try {
      await apiPost('/tickets/' + encodeURIComponent(ticketId) + '/reply', {
        guildId: state.guildId,
        content: content,
      });
      toast(t('tickets_reply_success'));
    } catch (err) {
      console.error('Failed to reply ticket', err);
      toast('Erro ao responder ao ticket / error replying ticket.');
    }

  async function deleteTicket(ticketId) {
    if (!state.guildId) return;
    const confirmMsg = t('tickets_delete_confirm') || 'Tens a certeza que queres apagar este ticket?';
    const ok = window.confirm(confirmMsg);
    if (!ok) return;

    try {
      await apiPost('/tickets/' + encodeURIComponent(ticketId) + '/delete', {
        guildId: state.guildId
      });
      toast(t('tickets_delete_success') || 'Ticket apagado com sucesso.');
      await loadTickets();
    } catch (err) {
      console.error('Failed to delete ticket', err);
      toast('Erro ao apagar ticket / error deleting ticket.');
    }
  }

  }

  // -----------------------------
  // Guild Config
  // -----------------------------

  async function loadGuildConfig() {
    if (!state.guildId) {
      updateTabAccess();
      return;
    }

    const statusEl = document.getElementById('configStatus');
    if (statusEl) {
      statusEl.textContent = t('config_loading');
    }

    try {
      const meta = await apiGet('/guilds/' + encodeURIComponent(state.guildId) + '/meta');
      const cfg = await apiGet('/guilds/' + encodeURIComponent(state.guildId) + '/config');

      const channels = (meta && meta.channels) || [];
      const roles = (meta && meta.roles) || [];
      const conf = cfg && cfg.config ? cfg.config : {};

      const logSelect = document.getElementById('configLogChannel');
      const dashLogSelect = document.getElementById('configDashboardLogChannel');
      const staffSelect = document.getElementById('configStaffRoles');

      if (logSelect) {
        logSelect.innerHTML = '';
        const optNone = document.createElement('option');
        optNone.value = '';
        optNone.textContent = state.lang === 'en' ? '— None —' : '— Nenhum —';
        logSelect.appendChild(optNone);

        channels.forEach(function (ch) {
          const opt = document.createElement('option');
          opt.value = ch.id;
          opt.textContent = '#' + ch.name + ' (' + ch.id + ')';
          if (conf.logChannelId && conf.logChannelId === ch.id) opt.selected = true;
          logSelect.appendChild(opt);
        });
      }

      if (dashLogSelect) {
        dashLogSelect.innerHTML = '';
        const optNone2 = document.createElement('option');
        optNone2.value = '';
        optNone2.textContent = state.lang === 'en' ? '— None —' : '— Nenhum —';
        dashLogSelect.appendChild(optNone2);

        channels.forEach(function (ch) {
          const opt = document.createElement('option');
          opt.value = ch.id;
          opt.textContent = '#' + ch.name + ' (' + ch.id + ')';
          if (conf.dashboardLogChannelId && conf.dashboardLogChannelId === ch.id) opt.selected = true;
          dashLogSelect.appendChild(opt);
        });
      }

      if (staffSelect) {
        staffSelect.innerHTML = '';
        roles.forEach(function (r) {
          const opt = document.createElement('option');
          opt.value = r.id;
          opt.textContent = '@' + r.name + ' (' + r.id + ')';
          if (Array.isArray(conf.staffRoleIds) && conf.staffRoleIds.indexOf(r.id) !== -1) {
            opt.selected = true;
          }
          staffSelect.appendChild(opt);
        });
      }

      if (statusEl) {
        statusEl.textContent = '';
      }
    } catch (err) {
      console.error('Failed to load guild config', err);
      if (statusEl) {
        statusEl.textContent = t('config_error_generic');
      }
    }
  }

  async function saveGuildConfig() {
    if (!state.guildId) return;

    const logSelect = document.getElementById('configLogChannel');
    const dashLogSelect = document.getElementById('configDashboardLogChannel');
    const staffSelect = document.getElementById('configStaffRoles');
    const statusEl = document.getElementById('configStatus');

    const logChannelId = logSelect && logSelect.value ? logSelect.value : null;
    const dashLogChannelId = dashLogSelect && dashLogSelect.value ? dashLogSelect.value : null;

    const staffRoleIds = [];
    if (staffSelect) {
      Array.prototype.forEach.call(staffSelect.selectedOptions || [], function (opt) {
        if (opt.value) staffRoleIds.push(opt.value);
      });
    }

    try {
      await apiPost('/guilds/' + encodeURIComponent(state.guildId) + '/config', {
        logChannelId: logChannelId,
        dashboardLogChannelId: dashLogChannelId,
        staffRoleIds: staffRoleIds,
      });
      if (statusEl) {
        statusEl.textContent = t('config_saved');
      }
      toast(t('config_saved'));
    } catch (err) {
      console.error('Failed to save guild config', err);
      if (statusEl) {
        statusEl.textContent = t('config_error_generic');
      }
      toast('Erro ao guardar configuração / error saving config.');
    }
  }

  // -----------------------------
  // Init
  // -----------------------------

  document.addEventListener('DOMContentLoaded', function () {
    // i18n inicial
    applyI18n();

    // Lang picker
    var langPicker = document.getElementById('langPicker');
    if (langPicker) {
      langPicker.addEventListener('change', function () {
        setLang(langPicker.value);
      });
    }

    // Tabs
    document.querySelectorAll('.tabs button[data-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tab = btn.getAttribute('data-tab');
        if (!tab) return;
        setTab(tab);
      });
    });

    // Guild picker
    var guildPicker = document.getElementById('guildPicker');
    if (guildPicker) {
      guildPicker.addEventListener('change', function () {
        var v = guildPicker.value || '';
        state.guildId = v || null;
        updateTabAccess();

        // Se nenhum servidor estiver selecionado, volta sempre para a visão geral.
        if (!state.guildId) {
          setTab('overview');
          return;
        }

        if (state.currentTab !== 'overview') {
          // reload current tab data when guild changes
          if (state.currentTab === 'tickets') {
            loadTickets().catch(function () {});
          } else if (state.currentTab === 'gamenews') {
            loadGameNews().catch(function () {});
          } else if (state.currentTab === 'user') {
            loadUsers().catch(function () {});
          } else if (state.currentTab === 'config') {
            loadGuildConfig().catch(function () {});
          }
        }
      });
    }

    // GameNews buttons
    var btnAddGameNewsFeed = document.getElementById('btnAddGameNewsFeed');
    if (btnAddGameNewsFeed) {
      btnAddGameNewsFeed.addEventListener('click', function () {
        var listEl = document.getElementById('gamenewsFeedsList');
        if (!listEl) return;
        var feeds = collectGameNewsEditorFeeds();
        feeds.push({
          name: '',
          feedUrl: '',
          channelId: '',
          enabled: true,
        });
        renderGameNewsEditor(feeds);
      });
    }

    var btnSaveGameNewsFeeds = document.getElementById('btnSaveGameNewsFeeds');
    if (btnSaveGameNewsFeeds) {
      btnSaveGameNewsFeeds.addEventListener('click', function () {
        saveGameNewsFeeds().catch(function () {});
      });
    }

    // Delegação para botões de cada linha de feed (remover)
    var feedsList = document.getElementById('gamenewsFeedsList');
    if (feedsList) {
      feedsList.addEventListener('click', function (ev) {
        var target = ev.target;
        if (!target || !target.classList) return;
        if (target.classList.contains('btn-remove-feed')) {
          var row = target.closest('.list-item');
          if (!row) return;
          row.remove();
        }
      });
    }

    // Tickets: delegação para responder / fechar / apagar
    var ticketsList = document.getElementById('ticketsList');
    if (ticketsList) {
      ticketsList.addEventListener('click', function (ev) {
        var target = ev.target;
        if (!target || !target.classList) return;
        var row = target.closest('.list-item');
        if (!row) return;
        var ticketId = row.dataset.ticketId;
        if (!ticketId) return;

        if (target.classList.contains('btn-ticket-reply')) {
          replyTicket(ticketId).catch(function () {});
        } else if (target.classList.contains('btn-ticket-close')) {
          closeTicket(ticketId).catch(function () {});
        } else if (target.classList.contains('btn-ticket-delete')) {
          deleteTicket(ticketId).catch(function () {});
        }
      });

    }

    // Config buttons
    var btnReloadGuildConfig = document.getElementById('btnReloadGuildConfig');
    if (btnReloadGuildConfig) {
      btnReloadGuildConfig.addEventListener('click', function () {
        loadGuildConfig().catch(function () {});
      });
    }

    var btnSaveGuildConfig = document.getElementById('btnSaveGuildConfig');
    if (btnSaveGuildConfig) {
      btnSaveGuildConfig.addEventListener('click', function () {
        saveGuildConfig().catch(function () {});
      });
    }

    // Carrega guilds e visão geral inicial
    loadGuilds().catch(function () {});
    setTab('overview');
  });
})();