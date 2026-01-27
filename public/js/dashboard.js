'use strict';

(function () {
  // Global namespace for multi-file-friendly dashboard
  window.OzarkDashboard = window.OzarkDashboard || {};

  const state = {
    lang: 'pt',
    guildId: null,
    currentTab: 'overview',
    guilds: []
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
      throw new Error(`HTTP ${res.status} for ${path}`);
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
      throw new Error(`HTTP ${res.status} for ${path}`);
    }
    return res.json();
  }


  function createLogRow(log) {
    const row = document.createElement('div');
    row.className = 'list-item';

    const title = log.title || 'Log';
    const subtitleParts = [];

    if (log.user && log.user.tag) {
      subtitleParts.push('User: ' + log.user.tag);
    }
    if (log.executor && log.executor.tag) {
      subtitleParts.push('Mod: ' + log.executor.tag);
    }
    if (log.description) {
      subtitleParts.push(log.description);
    }

    const createdAt = log.createdAt || log.time;
    if (createdAt) {
      try {
        const d = new Date(createdAt);
        if (!isNaN(d.getTime())) {
          subtitleParts.push(d.toLocaleString());
        }
      } catch (e) {
        // ignore
      }
    }

    row.innerHTML = `
        <div class="title">${escapeHtml(title)}</div>
        <div class="subtitle">${escapeHtml(subtitleParts.join(' • '))}</div>
      `;

    return row;
  }


  function createCaseRow(c) {
    const row = document.createElement('div');
    row.className = 'list-item';

    const title = (c.type || 'CASE') + ' • ' + (c.userId || '—');
    const subtitleParts = [];

    if (c.caseId) subtitleParts.push('#' + c.caseId);
    if (c.reason) subtitleParts.push(c.reason);
    if (c.createdAt) subtitleParts.push(new Date(c.createdAt).toLocaleString());

    row.innerHTML = `
          <div class="title">${escapeHtml(title)}</div>
          <div class="subtitle">${escapeHtml(subtitleParts.join(' • '))}</div>
        `;

    return row;
  }

  function createGameNewsFeedRow(f, idx) {
    const row = document.createElement('div');
    row.className = 'list-item';
    row.dataset.index = String(idx);

    row.innerHTML = `
        <div class="row gap">
          <div class="col">
            <label>${escapeHtml(t('gamenews_feed_name_label'))}</label>
            <input type="text" class="input feed-name" value="${escapeHtml(f.name || '')}" />
          </div>
          <div class="col">
            <label>${escapeHtml(t('gamenews_feed_url_label'))}</label>
            <input type="text" class="input feed-url" value="${escapeHtml(f.feedUrl || '')}" />
          </div>
        </div>
        <div class="row gap" style="margin-top:6px;">
          <div class="col">
            <label>${escapeHtml(t('gamenews_feed_channel_label'))}</label>
            <input type="text" class="input feed-channel" value="${escapeHtml(f.channelId || '')}" />
          </div>
          <div class="col" style="display:flex;align-items:center;gap:8px;">
            <label>
              <input type="checkbox" class="feed-enabled"${f.enabled === false ? '' : ' checked'}>
              ${escapeHtml(t('gamenews_feed_enabled_label'))}
            </label>
            <button type="button" class="btn btn-small btn-remove-feed">
              ${escapeHtml(t('gamenews_feed_remove_label'))}
            </button>
          </div>
        </div>
      `;

    return row;
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

      logs_title: 'Hub de moderação',
      logs_hint: 'Consulta centralizada de avisos, mutes, bans, tickets e restantes ações de moderação.',
      logs_search_placeholder: 'Procurar por utilizador, moderador ou detalhe do log',
      logs_filter_all: 'Todos os tipos',
      logs_filter_tickets: 'Tickets (suporte)',
      logs_reload: 'Recarregar',
      logs_empty: 'Não existem registos para o filtro atual.',
      logs_loading: 'A carregar logs...',
      logs_error_generic: 'Não foi possível carregar os logs.',
      overview_error_generic: 'Não foi possível carregar a visão geral.',
      guilds_error_generic: 'Não foi possível carregar a lista de servidores.',
      users_error_generic: 'Não foi possível carregar a lista de utilizadores.',
      cases_error_generic: 'Não foi possível carregar os casos.',
      tickets_error_action: 'Não foi possível executar a ação no ticket.',
      config_error_save: 'Não foi possível guardar a configuração.',

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
      gamenews_select_guild: 'Selecione um servidor para configurar GameNews.',
      gamenews_error_generic: 'Não foi possível carregar GameNews.',
      gamenews_editor_title: 'Configuração de feeds',
      gamenews_editor_hint: 'Adiciona, edita ou remove feeds e escolhe o canal para cada um.',
      gamenews_add_feed: 'Adicionar feed',
      gamenews_save_feeds: 'Guardar alterações',
      gamenews_save_success: 'Feeds de GameNews guardados.',
      gamenews_editor_empty: 'Ainda não existem feeds configurados. Adiciona o primeiro feed para começar.',
      gamenews_feed_name_label: 'Nome',
      gamenews_feed_url_label: 'URL do feed',
      gamenews_feed_channel_label: 'Canal',
      gamenews_feed_enabled_label: 'Ativo',
      gamenews_feed_url_label: 'URL do feed',
      gamenews_feed_channel_label: 'Canal ID',
      gamenews_feed_remove_label: 'Remover',
      gamenews_status_last_label: 'Último envio',
      gamenews_status_state_ok: 'Ativo',
      gamenews_status_state_paused: 'Em pausa',
      gamenews_status_state_error: 'Em erro',

      users_title: 'Utilizadores',
      users_hint: 'Lista de utilizadores e acesso rápido ao histórico de moderação.',
      users_empty: 'Selecione um servidor para ver utilizadores.',
      users_detail_empty: 'Selecione um utilizador para ver o histórico de moderação e tickets.',
      users_history_title: 'Histórico do utilizador',
      users_history_infractions: 'Infrações recentes',
      users_history_tickets: 'Tickets recentes',
      users_history_none: 'Sem histórico de moderação para este utilizador.',
      users_history_click_to_remove: 'Clique numa infração para a remover e ajustar o trust.',
      users_history_remove_confirm: 'Tens a certeza que queres remover esta infração? Isto pode ajustar o trust e o número de avisos.',
      users_history_remove_success: 'Infração removida com sucesso.',
      users_trust_title: 'Nível de confiança (trust)',
      users_trust_score: 'Trust',
      users_trust_next_penalty_prefix: 'Próximo auto-mute estimado após mais',
      users_trust_next_penalty_suffix: 'duração aproximada',
      users_trust_next_penalty_simple_prefix: 'Próximo auto-mute estimado:',
      users_trust_next_penalty_at_threshold: 'Já atingiu o limiar de auto-mute; próximo warn irá gerar um mute de aproximadamente',
      users_trust_automation_disabled: 'Automação de mute automática está desativada para este servidor.',
      users_actions_title: 'Ações rápidas de moderação',
      users_actions_warn: 'Warn',
      users_actions_unmute: 'Unmute',
      users_actions_reset: 'Repor trust/avisos',
      users_actions_reset_history: 'Limpar histórico',
      users_actions_reason_placeholder: 'Motivo (opcional)',

      config_title: 'Configuração do servidor',
      config_hint: 'Define canais de logs e cargos de staff para este servidor.',
      config_log_channel: 'Canal de logs principal',
      config_dashboard_log_channel: 'Canal de logs da dashboard',
      config_ticket_channel: 'Canal de suporte (tickets)',
      config_ticket_channel_hint:
        'Canal onde será publicada a mensagem de suporte com o emoji para criar tickets.',
      config_staff_roles: 'Cargos de staff',
      config_staff_roles_hint:
        'Se vazio, são usadas as roles de staff globais definidas no ficheiro de configuração.',
      config_reload: 'Recarregar',
      config_save: 'Guardar configuração',
      config_saved: 'Configuração do servidor guardada.',
      config_loading: 'A carregar configuração...',

      config_trust_title: 'Sistema de confiança (Trust)',
      config_trust_hint: 'Valores globais usados pelo AutoMod e pelos comandos de moderação. Não é possível alterar estes valores pela dashboard.',
      config_trust_base: 'Nível base',
      config_trust_minmax: 'Mínimo / Máximo',
      config_trust_penalties: 'Penalizações',
      config_trust_regen: 'Regeneração',
      config_trust_risk: 'Limiares',

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

      logs_title: 'Moderation hub',
      logs_hint: 'Centralised view of warns, mutes, bans, tickets and other moderation actions.',
      logs_search_placeholder: 'Search by user, moderator or log detail',
      logs_filter_all: 'All types',
      logs_filter_tickets: 'Tickets (support)',
      logs_reload: 'Reload',
      logs_empty: 'There are no records for the current filter.',
      logs_loading: 'Loading logs...',
      logs_error_generic: 'Could not load logs.',

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
      gamenews_select_guild: 'Select a server to configure GameNews.',
      gamenews_error_generic: 'Could not load GameNews.',
      gamenews_editor_title: 'Feeds configuration',
      gamenews_editor_hint: 'Add, edit or remove feeds and choose the target channel for each one.',
      gamenews_add_feed: 'Add feed',
      gamenews_save_feeds: 'Save changes',
      gamenews_save_success: 'GameNews feeds saved.',
      gamenews_editor_empty: 'No feeds configured yet. Add your first feed to get started.',
      gamenews_feed_name_label: 'Name',
      gamenews_feed_url_label: 'Feed URL',
      gamenews_feed_channel_label: 'Channel',
      gamenews_feed_enabled_label: 'Enabled',
      gamenews_feed_url_label: 'Feed URL',
      gamenews_feed_channel_label: 'Channel ID',
      gamenews_feed_remove_label: 'Remove',
      gamenews_status_last_label: 'Last sent',
      gamenews_status_state_ok: 'Active',
      gamenews_status_state_paused: 'Paused',
      gamenews_status_state_error: 'Error',

      users_title: 'Users',
      users_hint: 'Users list with quick access to their moderation history.',
      users_empty: 'Select a server to see the users list.',
      users_detail_empty: 'Select a user to see their moderation and ticket history.',
      users_history_title: 'User history',
      users_history_infractions: 'Recent infractions',
      users_history_tickets: 'Recent tickets',
      users_history_none: 'No moderation history for this user.',
      users_history_click_to_remove: 'Click an infraction to remove it and adjust trust.',
      users_history_remove_confirm: 'Are you sure you want to remove this infraction? This may adjust trust and warning count.',
      users_history_remove_success: 'Infraction removed successfully.',
      users_trust_title: 'Trust level',
      users_trust_score: 'Trust',
      users_trust_next_penalty_prefix: 'Next estimated auto-mute after',
      users_trust_next_penalty_suffix: 'estimated duration',
      users_trust_next_penalty_simple_prefix: 'Next estimated auto-mute:',
      users_trust_next_penalty_at_threshold: 'Already at the auto-mute threshold; next warn will trigger a mute of about',
      users_trust_automation_disabled: 'Automatic mute automation is disabled for this server.',
      users_actions_title: 'Quick moderation actions',
      users_actions_warn: 'Warn',
      users_actions_unmute: 'Unmute',
      users_actions_reset: 'Reset trust/warnings',
      users_actions_reset_history: 'Clear history',
      users_actions_reason_placeholder: 'Reason (optional)',

      config_title: 'Server configuration',
      config_hint: 'Define log channels, support channel and staff roles for this guild.',
      config_log_channel: 'Main log channel',
      config_dashboard_log_channel: 'Dashboard log channel',
      config_ticket_channel: 'Support channel (tickets)',
      config_ticket_channel_hint:
        'Channel where the support message with the ticket emoji will be posted.',
      config_staff_roles: 'Staff roles',
      config_staff_roles_hint:
        'If empty, the global staffRoles from config file are used.',
      config_reload: 'Reload',
      config_save: 'Save configuration',
      config_saved: 'Server configuration saved.',
      config_loading: 'Loading configuration...',

      config_trust_title: 'Trust system',
      config_trust_hint: 'Global values used by AutoMod and moderation commands. These values cannot be changed from the dashboard.',
      config_trust_base: 'Base level',
      config_trust_minmax: 'Minimum / Maximum',
      config_trust_penalties: 'Penalties',
      config_trust_regen: 'Regeneration',
      config_trust_risk: 'Thresholds',

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
    const tabsRequiringGuild = ['logs', 'cases', 'gamenews', 'user', 'config'];
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
    } else if (name === 'logs') {
      loadLogs().catch(function () {});
    } else if (name === 'cases') {
      loadCases().catch(function () {});
    } else if (name === 'gamenews') {
      loadGameNews().catch(function () {});
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

    const tabsRequiringGuild = ['logs', 'cases', 'gamenews', 'user', 'config'];
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
      toast(t('overview_error_generic'));
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
      state.guilds = items;
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
      toast(t('guilds_error_generic'));
    }
  }

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

      const detailEl = document.getElementById('userDetailPanel');
      // Limpar painel de detalhe quando se recarrega a lista
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
              ${escapeHtml(isBot ? 'BOT' : 'USER')}
            </div>
          </div>
          <div class="subtitle">
            ${escapeHtml(u.id)}${roles ? ' • ' + escapeHtml(roles) : ''}
          </div>
        `;

        row.addEventListener('click', function () {
          // Marcar seleção visual
          document.querySelectorAll('#tab-user .list .list-item').forEach(function (el) {
            el.classList.remove('active');
          });
          row.classList.add('active');

          loadUserHistory({
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

    // Placeholder for bots
    if (user.bot) {
      detailEl.innerHTML = `
        <div class="title">${escapeHtml(t('users_history_title'))}</div>
        <div class="subtitle">${escapeHtml(user.username || user.id)} • BOT</div>
        <div class="empty">${escapeHtml(t('users_history_none'))}</div>
      `;
      return;
    }

    detailEl.innerHTML = `<div class="empty">${escapeHtml(t('loading'))}</div>`;

    try {
      const [historyRes, userRes] = await Promise.all([
        apiGet(
          '/guilds/' +
            encodeURIComponent(state.guildId) +
            '/users/' +
            encodeURIComponent(user.id) +
            '/history'
        ),
        apiGet(
          '/user?guildId=' +
            encodeURIComponent(state.guildId) +
            '&userId=' +
            encodeURIComponent(user.id)
        )
      ]);

      if (!historyRes || historyRes.ok === false) {
        console.error('User history error', historyRes && historyRes.error);
        detailEl.innerHTML = `<div class="empty">${escapeHtml(t('cases_error_generic'))}</div>`;
        return;
      }

      const infractions = historyRes.infractions || [];
      const counts = historyRes.counts || {};
      const tickets = historyRes.tickets || [];

      const dbInfo = userRes && userRes.db ? userRes.db : null;

      let html = '';

      html += `<div class="title">${escapeHtml(t('users_history_title'))}</div>`;
      html += `<div class="subtitle">${escapeHtml(user.username || user.id)} • ${escapeHtml(user.id)}</div>`;

      // Trust e próxima penalização
      if (dbInfo && typeof dbInfo.trust === 'number') {
        html += '<div class="history-section user-trust">';
        html += `<h3>${escapeHtml(t('users_trust_title'))}</h3>`;

        html += '<div class="user-trust-main">';

        // Badge para nível de trust (baixo / médio / alto)
        var trustVal = dbInfo.trust;
        var trustLabel = dbInfo.trustLabel ? String(dbInfo.trustLabel) : '';
        var trustLabelLower = trustLabel.toLowerCase();
        var trustLevelClass = 'neutral';

        if (trustLabelLower.includes('alto') || trustLabelLower.includes('high')) {
          trustLevelClass = 'high';
        } else if (
          trustLabelLower.includes('médio') ||
          trustLabelLower.includes('medio') ||
          trustLabelLower.includes('medium')
        ) {
          trustLevelClass = 'medium';
        } else if (trustLabelLower.includes('baixo') || trustLabelLower.includes('low')) {
          trustLevelClass = 'low';
        }

        html += '<div class="user-trust-header">';
        html +=
          '<div class="user-trust-score">' +
          escapeHtml(t('users_trust_score')) +
          ': ' +
          String(trustVal) +
          '</div>';

        if (trustLabel) {
          html +=
            '<span class="trust-badge trust-badge-' +
            trustLevelClass +
            '">' +
            escapeHtml(trustLabel) +
            '</span>';
        }

        html += '</div>';

        if (dbInfo.nextPenalty && dbInfo.nextPenalty.automationEnabled) {
          var np = dbInfo.nextPenalty;
          var remaining =
            typeof np.remaining === 'number' ? np.remaining : null;
          var mins =
            typeof np.estimatedMuteMinutes === 'number'
              ? np.estimatedMuteMinutes
              : null;

          // Número atual de WARNs (para mostrar no texto de limiar)
          var currentWarns =
            dbInfo && typeof dbInfo.warnings === 'number'
              ? dbInfo.warnings
              : (counts && counts.WARN) || 0;

          html += '<div class="user-trust-next">';
          if (mins !== null) {
            if (remaining !== null && remaining > 0) {
              html += `<span>${escapeHtml(t('users_trust_next_penalty_prefix'))} ${String(
                remaining
              )} warn(s); ${escapeHtml(t('users_trust_next_penalty_suffix'))} ~${String(mins)} min</span>`;
            } else {
              html += `<span>${escapeHtml(
                t('users_trust_next_penalty_at_threshold')
              )} ~${String(mins)} min (${String(currentWarns)} WARN(s) atuais)</span>`;
            }
          }
          html += '</div>';
        } else {
          html +=
            '<div class="user-trust-next-disabled">' +
            escapeHtml(t('users_trust_automation_disabled')) +
            '</div>';
        }

        html += '</div>'; // user-trust-main
        html += '</div>'; // history-section user-trust
      }

      // Badges de resumo
      html += '<div class="badge-row">';

      const warnCount =
        dbInfo && typeof dbInfo.warnings === 'number'
          ? dbInfo.warnings
          : (counts.WARN || 0);
      const muteCount = counts.MUTE || 0;

      if (warnCount || muteCount) {
        if (warnCount) {
          html += `<div class="badge badge-warn">WARN: ${String(warnCount)}</div>`;
        }
        if (muteCount) {
          html += `<div class="badge badge-mute">MUTE: ${String(muteCount)}</div>`;
        }
      } else {
        html += `<div class="badge">${escapeHtml(t('users_history_none'))}</div>`;
      }

      html += '</div>';

      // Ações rápidas de moderação
      html += '<div class="history-section user-actions">';
      html += `<h3>${escapeHtml(t('users_actions_title'))}</h3>`;

      html += '<div class="user-actions-fields">';
      html += `<input type="text" class="input xs user-actions-reason" placeholder="${escapeHtml(
        t('users_actions_reason_placeholder')
      )}">`;
      html += '</div>';

      html += '<div class="badge-row user-actions-buttons">';
      html += `<button type="button" class="btn xs btn-warn" data-action="warn">${escapeHtml(
        t('users_actions_warn')
      )}</button>`;
      html += `<button type="button" class="btn xs btn-unmute" data-action="unmute">${escapeHtml(
        t('users_actions_unmute')
      )}</button>`;
      html += `<button type="button" class="btn xs btn-reset" data-action="reset">${escapeHtml(
        t('users_actions_reset')
      )}</button>`;
      html += '</div>';
      html += '</div>';

      // Infrações recentes
      html += '<div class="history-section">';
      html += `<h3>${escapeHtml(t('users_history_infractions'))}</h3>`;
      html +=
        '<div class="history-hint">' +
        escapeHtml(t('users_history_click_to_remove')) +
        '</div>';

      if (!infractions.length) {
        html += `<div class="empty" style="margin-top:4px;">${escapeHtml(t('users_history_none'))}</div>`;
      } else {
        html += '<ul class="infractions-list">';
        infractions.forEach(function (inf) {
          const id = (inf._id || inf.id || '').toString();
          const when = inf.createdAt
            ? new Date(inf.createdAt).toLocaleString()
            : '';
          const reason = inf.reason || '';
          const line =
            '[' +
            (inf.type || 'UNK') +
            '] ' +
            (reason ? reason : '') +
            (when ? ' • ' + when : '');
          html += `<li class="infraction-item" data-infraction-id="${escapeHtml(id)}">${escapeHtml(line)}</li>`;
        });
        html += '</ul>';
      }
      html += '</div>';

      // Tickets recentes
      html += '<div class="history-section">';
      html += `<h3>${escapeHtml(t('users_history_tickets'))}</h3>`;

      if (!tickets.length) {
        html += `<div class="empty" style="margin-top:4px;">${escapeHtml(t('users_history_none'))}</div>`;
      } else {
        html += '<ul>';
        tickets.forEach(function (tkt) {
          const opened = tkt.createdAt
            ? new Date(tkt.createdAt).toLocaleString()
            : '';
          const status = tkt.closedAt ? 'Fechado' : 'Aberto';
          const line =
            '#' +
            String(tkt.ticketNumber).padStart(3, '0') +
            ' • ' +
            status +
            (opened ? ' • ' + opened : '');
          html += `<li>${escapeHtml(line)}</li>`;
        });
        html += '</ul>';
      }
      html += '</div>';

      detailEl.innerHTML = html;

      // Bind quick moderation actions
      try {
        const container = detailEl.querySelector('.user-actions');
        if (container) {
          container.querySelectorAll('button[data-action]').forEach(function (btn) {
            btn.addEventListener('click', function () {
              const action = btn.getAttribute('data-action');
              if (!state.guildId || !user || !user.id) return;

              const reasonInput =
                container.querySelector('.user-actions-reason') || null;

              const reasonRaw = reasonInput && reasonInput.value ? reasonInput.value : '';
              const reason = reasonRaw.trim() || null;

              if (action === 'reset-history') {
                apiPost('/mod/reset-history', {
                  guildId: state.guildId,
                  userId: user.id,
                  reason: reason
                })
                  .then(function (res) {
                    if (!res || res.ok === false) {
                      console.error('Reset history failed', res && res.error);
                      toast(res && res.error ? String(res.error) : t('cases_error_generic'));
                      return;
                    }
                    toast(t('users_actions_reset_history') + ' OK');
                    loadUserHistory(user).catch(function () {});
                  })
                  .catch(function (err) {
                    console.error('Reset history error', err);
                    toast(t('cases_error_generic'));
                  });
              } else if (action === 'warn') {
                apiPost('/mod/warn', {
                  guildId: state.guildId,
                  userId: user.id,
                  reason: reason
                })
                  .then(function (res) {
                    if (!res || res.ok === false) {
                      console.error('Warn failed', res && res.error);
                      toast(res && res.error ? String(res.error) : t('cases_error_generic'));
                      return;
                    }
                    toast(t('users_actions_warn') + ' OK');
                    // reload history to reflect new infraction
                    loadUserHistory(user).catch(function () {});
                  })
                  .catch(function (err) {
                    console.error('Warn error', err);
                    toast(t('cases_error_generic'));
                  });
              } else if (action === 'unmute') {
                apiPost('/mod/unmute', {
                  guildId: state.guildId,
                  userId: user.id,
                  reason: reason
                })
                  .then(function (res) {
                    if (!res || res.ok === false) {
                      console.error('Unmute failed', res && res.error);
                      toast(res && res.error ? String(res.error) : t('cases_error_generic'));
                      return;
                    }
                    toast(t('users_actions_unmute') + ' OK');
                    loadUserHistory(user).catch(function () {});
                  })
                  .catch(function (err) {
                    console.error('Unmute error', err);
                    toast(t('cases_error_generic'));
                  });
              } else if (action === 'reset') {
                apiPost('/mod/reset-trust', {
                  guildId: state.guildId,
                  userId: user.id,
                  reason: reason
                })
                  .then(function (res) {
                    if (!res || res.ok === false) {
                      console.error('Reset trust failed', res && res.error);
                      toast(res && res.error ? String(res.error) : t('cases_error_generic'));
                      return;
                    }
                    toast(t('users_actions_reset') + ' OK');
                    loadUserHistory(user).catch(function () {});
                  })
                  .catch(function (err) {
                    console.error('Reset trust error', err);
                    toast(t('cases_error_generic'));
                  });
              }
            });
          });
        }

        // Bind infractions click-to-remove
        const infraList = detailEl.querySelector('.infractions-list');
        if (infraList) {
          infraList.querySelectorAll('.infraction-item').forEach(function (li) {
            li.addEventListener('click', function () {
              const id = li.getAttribute('data-infraction-id');
              if (!id || !state.guildId || !user || !user.id) return;

              if (!window.confirm(t('users_history_remove_confirm'))) return;

              apiPost('/mod/remove-infraction', {
                guildId: state.guildId,
                userId: user.id,
                infractionId: id
              })
                .then(function (res) {
                  if (!res || res.ok === false) {
                    console.error('Remove infraction failed', res && res.error);
                    toast(res && res.error ? String(res.error) : t('cases_error_generic'));
                    return;
                  }
                  // Feedback visual e reload de histórico
                  li.classList.add('removing');
                  toast(t('users_history_remove_success'));
                  loadUserHistory(user).catch(function () {});
                })
                .catch(function (err) {
                  console.error('Remove infraction error', err);
                  toast(t('cases_error_generic'));
                });
            });
          });
        }
      } catch (err) {
        console.error('Failed to bind user quick actions', err);
      }
    } catch (err) {
      console.error('Failed to load user history', err);
      detailEl.innerHTML =
        '<div class="empty">Erro ao carregar histórico / error loading history.</div>';
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

      let stateLabel;
      if (s.enabled === false) {
        stateLabel = t('gamenews_status_state_paused');
      } else if (s.paused) {
        stateLabel = t('gamenews_status_state_paused');
      } else if (s.failCount && s.failCount > 0) {
        stateLabel = t('gamenews_status_state_error');
      } else {
        stateLabel = t('gamenews_status_state_ok');
      }

      const statusText = stateLabel + ' • ' + 'Fails: ' + fails;

      row.innerHTML =
        '<div class="title">' +
        escapeHtml(s.feedName || s.source || 'Feed') +
        '</div>' +
        '<div class="subtitle">' +
        escapeHtml(s.feedUrl || '') +
        '</div>' +
        '<div class="meta">' +
        escapeHtml(statusText) +
        ' • ' + escapeHtml(t('gamenews_status_last_label')) + ': ' +
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
      empty.textContent = t('gamenews_editor_empty');
      listEl.appendChild(empty);
      return;
    }

    feeds.forEach(function (f, idx) {
      const row = createGameNewsFeedRow(f, idx);
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

    if (!state.guildId) {
      if (statusList) {
        statusList.innerHTML = '';
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = t('gamenews_select_guild');
        statusList.appendChild(empty);
      }
      if (feedsList) {
        feedsList.innerHTML = '';
        const empty2 = document.createElement('div');
        empty2.className = 'empty';
        empty2.textContent = t('gamenews_select_guild');
        feedsList.appendChild(empty2);
      }
      return;
    }

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

    const guildParam = '?guildId=' + encodeURIComponent(state.guildId);

    try {
      const status = await apiGet('/gamenews-status' + guildParam);
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
      const feeds = await apiGet('/gamenews/feeds' + guildParam);
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
    if (!state.guildId) {
      toast(t('gamenews_select_guild'));
      return;
    }

    try {
      const feeds = collectGameNewsEditorFeeds();
      const guildParam = '?guildId=' + encodeURIComponent(state.guildId);
      await apiPost('/gamenews/feeds' + guildParam, { guildId: state.guildId, feeds: feeds });
      toast(t('gamenews_save_success'));
      await loadGameNews();
    } catch (err) {
      console.error('Failed to save GameNews feeds', err);
      toast(t('gamenews_error_generic'));
    }
  }

  
  // -----------------------------
  // Logs de moderação + Tickets
  // -----------------------------

  function renderLogs(items) {
    const listEl = document.getElementById('logsList');
    if (!listEl) return;

    listEl.innerHTML = '';

    if (!items || !items.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = t('logs_empty');
      listEl.appendChild(empty);
      return;
    }

    items.forEach(function (log) {
      const row = createLogRow(log);
      listEl.appendChild(row);
    });
  }

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

      // Se tivermos informação da última resposta, usamos para um rótulo mais amigável
      let statusLabel = status;
      if (status === 'CLOSED') {
        statusLabel = t('tickets_status_closed') || 'CLOSED';
      } else if (tkt.reopenedAt) {
        statusLabel = t('tickets_status_reopened') || 'Reaberto';
      } else if (tkt.lastResponderName) {
        statusLabel = t('tickets_status_answered') || 'Respondido';
      } else {
        statusLabel = t('tickets_status_open') || 'OPEN';
      }

      let actionsHtml = '';

      if (status !== 'CLOSED') {
        actionsHtml += '  <button type="button" class="btn btn-small btn-ticket-reply">Responder</button>';
        actionsHtml += '  <button type="button" class="btn btn-small btn-ticket-close">Fechar</button>';
      } else {
        actionsHtml += '  <button type="button" class="btn btn-small btn-ticket-reopen">Reabrir</button>';
        actionsHtml += '  <button type="button" class="btn btn-small btn-ticket-delete">Apagar</button>';
      }

      // Texto da última resposta, se existir
      let lastResponderHtml = '';
      if (tkt.lastResponderName) {
        lastResponderHtml =
          '<div class="subtitle small">' +
          escapeHtml(t('tickets_last_reply') || 'Última resposta:') +
          ' ' +
          escapeHtml(tkt.lastResponderName) +
          '</div>';
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
        escapeHtml(statusLabel) +
        ' • ' +
        escapeHtml(created) +
        '</div>' +
        lastResponderHtml +
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
      toast(t('tickets_error_action'));
    }
  }


  async function reopenTicket(ticketId) {
    if (!state.guildId) return;
    const confirmMsg = t('tickets_reopen_confirm') || 'Tens a certeza que queres reabrir este ticket?';
    const ok = window.confirm(confirmMsg);
    if (!ok) return;

    try {
      await apiPost('/tickets/' + encodeURIComponent(ticketId) + '/reopen', {
        guildId: state.guildId,
      });
      toast(t('tickets_reopen_success') || 'Ticket reaberto com sucesso.');
      await loadTickets();
    } catch (err) {
      console.error('Failed to reopen ticket', err);
      toast(t('tickets_error_action'));
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
      await loadTickets();
    } catch (err) {
      console.error('Failed to reply ticket', err);
      toast(t('tickets_error_action'));
    }
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
      toast(t('tickets_error_action'));
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
      const ticketSelect = document.getElementById('configTicketChannel');
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

      if (ticketSelect) {
        ticketSelect.innerHTML = '';
        const optNone3 = document.createElement('option');
        optNone3.value = '';
        optNone3.textContent = state.lang === 'en' ? '— None —' : '— Nenhum —';
        ticketSelect.appendChild(optNone3);

        channels.forEach(function (ch) {
          const opt = document.createElement('option');
          opt.value = ch.id;
          opt.textContent = '#' + ch.name + ' (' + ch.id + ')';
          if (conf.ticketThreadChannelId && conf.ticketThreadChannelId === ch.id) opt.selected = true;
          ticketSelect.appendChild(opt);
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

      // Trust config preview (read-only, global)
      const trust = conf && conf.trust ? conf.trust : null;
      const baseEl = document.getElementById('trustBaseValue');
      const minMaxEl = document.getElementById('trustMinMaxValue');
      const penaltiesEl = document.getElementById('trustPenaltiesValue');
      const regenEl = document.getElementById('trustRegenValue');
      const riskEl = document.getElementById('trustRiskValue');

      if (trust && baseEl && minMaxEl && penaltiesEl && regenEl && riskEl) {
        const base = Number.isFinite(Number(trust.base)) ? Number(trust.base) : null;
        const min = Number.isFinite(Number(trust.min)) ? Number(trust.min) : null;
        const max = Number.isFinite(Number(trust.max)) ? Number(trust.max) : null;

        baseEl.textContent = base !== null ? String(base) : '—';
        minMaxEl.textContent = min !== null && max !== null ? min + ' / ' + max : '—';

        const warnPenalty = Number.isFinite(Number(trust.warnPenalty)) ? Number(trust.warnPenalty) : null;
        const mutePenalty = Number.isFinite(Number(trust.mutePenalty)) ? Number(trust.mutePenalty) : null;
        penaltiesEl.textContent =
          warnPenalty !== null && mutePenalty !== null
            ? 'WARN: -' + warnPenalty + ' • MUTE: -' + mutePenalty
            : '—';

        const regenPerDay = Number.isFinite(Number(trust.regenPerDay)) ? Number(trust.regenPerDay) : null;
        const regenMaxDays = Number.isFinite(Number(trust.regenMaxDays)) ? Number(trust.regenMaxDays) : null;
        regenEl.textContent =
          regenPerDay !== null && regenMaxDays !== null
            ? regenPerDay + ' / dia até ' + regenMaxDays + ' dias'
            : '—';

        const lowT = Number.isFinite(Number(trust.lowTrustThreshold)) ? Number(trust.lowTrustThreshold) : null;
        const highT = Number.isFinite(Number(trust.highTrustThreshold)) ? Number(trust.highTrustThreshold) : null;
        if (lowT !== null && highT !== null) {
          riskEl.textContent = `< ${lowT} (risco) • > ${highT} (confiança)`;
        } else {
          riskEl.textContent = '—';
        }
      } else if (baseEl && minMaxEl && penaltiesEl && regenEl && riskEl) {
        baseEl.textContent = '—';
        minMaxEl.textContent = '—';
        penaltiesEl.textContent = '—';
        regenEl.textContent = '—';
        riskEl.textContent = '—';
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
    const ticketSelect = document.getElementById('configTicketChannel');
    const staffSelect = document.getElementById('configStaffRoles');
    const statusEl = document.getElementById('configStatus');

    const logChannelId = logSelect && logSelect.value ? logSelect.value : null;
    const dashLogChannelId = dashLogSelect && dashLogSelect.value ? dashLogSelect.value : null;
    const ticketThreadChannelId = ticketSelect && ticketSelect.value ? ticketSelect.value : null;

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
        ticketThreadChannelId: ticketThreadChannelId,
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
      toast(t('config_error_save'));
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
          if (state.currentTab === 'logs') {
            loadLogs().catch(function () {});
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

    // Logs controls
    var btnReloadLogs = document.getElementById('btnReloadLogs');
    if (btnReloadLogs) {
      btnReloadLogs.addEventListener('click', function () {
        loadLogs().catch(function () {});
      });
    }

    var logTypeSelect = document.getElementById('logType');
    if (logTypeSelect) {
      logTypeSelect.addEventListener('change', function () {
        loadLogs().catch(function () {});
      });
    }

    var logSearchInput = document.getElementById('logSearch');
    if (logSearchInput) {
      logSearchInput.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') {
          loadLogs().catch(function () {});
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
        } else if (target.classList.contains('btn-ticket-reopen')) {
          reopenTicket(ticketId).catch(function () {});
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


  // Expose key parts on global namespace for future multi-file split
  window.OzarkDashboard.state = state;
  window.OzarkDashboard.API_BASE = API_BASE;
  window.OzarkDashboard.getToken = getToken;
  window.OzarkDashboard.setToken = setToken;
  window.OzarkDashboard.apiGet = apiGet;
  window.OzarkDashboard.apiPost = apiPost;
  window.OzarkDashboard.toast = toast;
  window.OzarkDashboard.setTab = setTab;
  window.OzarkDashboard.loadGuilds = loadGuilds;
  window.OzarkDashboard.loadUsers = loadUsers;
  window.OzarkDashboard.loadUserHistory = loadUserHistory;
  window.OzarkDashboard.loadLogs = loadLogs;
  window.OzarkDashboard.loadCases = loadCases;
  window.OzarkDashboard.loadGameNews = loadGameNews;

})();