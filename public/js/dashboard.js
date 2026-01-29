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
  const TOKEN_KEY = 'DASHBOARD_TOKEN';

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

  function clearToken() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch (e) {
      // ignore
    }
  }

  function getAuthHeaders() {
    const headers = {};
    const token = getToken();
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

        login_title: 'Login',
        login_subtitle: 'Autentica-te para aceder ao painel.',
        login_username_label: 'Utilizador',
        login_password_label: 'Password',
        login_submit: 'Entrar',
        login_error_required: 'Preenche utilizador e password.',
        login_error_invalid: 'Credenciais inválidas ou não autorizadas.',
        login_error_generic: 'Erro ao tentar autenticar. Tenta novamente.',

      tab_overview: 'Visão geral',
      tab_logs: 'Moderação',
      tab_cases: 'Casos',
      tab_tickets: 'Tickets',
      tab_gamenews: 'Extras',
      extras_title: 'Extras',
      extras_hint: 'Additional tools: news feeds and temporary voice channels.',
      extras_feeds_tab: 'Feeds',
      extras_tempvoice_tab: 'Temporary voice',
        extras_title: 'Extras',
        extras_hint: 'Ferramentas adicionais: feeds de notícias e voz temporária.',
        extras_feeds_tab: 'Feeds',
        extras_tempvoice_tab: 'Voz temporária',
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
      gamenews_reload_status: 'Recarregar estado',
      gamenews_select_guild: 'Selecione um servidor para configurar GameNews.',
      gamenews_error_generic: 'Não foi possível carregar GameNews.',

      gamenews_add_section_title: 'Adicionar novo feed',
      gamenews_add_section_hint: 'Cria rapidamente um novo feed. Podes depois ajustar o canal, URL, intervalo e logs na lista de feeds configurados.',

      gamenews_feeds_section_title: 'Feeds configurados',
      gamenews_feeds_section_hint: 'Adiciona, edita ou remove feeds e escolhe o canal de envio, canal de logs e intervalo por feed.',

      gamenews_history_title: 'Histórico de GameNews',
      gamenews_history_hint: 'Resumo do estado dos feeds: últimos envios, erros recentes e pausas automáticas.',

      gamenews_detail_title: 'Histórico do feed',
      gamenews_detail_state_title: 'Estado do feed',
      gamenews_detail_actions_title: 'Ações rápidas do feed',
      gamenews_detail_empty: 'Selecione um feed para ver o histórico e editar a configuração.',

      tempvoice_title: 'Voz temporária',
      tempvoice_hint: 'Cria canais de voz temporários por utilizador, que são apagados quando ficam vazios.',
      tempvoice_enabled_label: 'Ativar voz temporária',
      tempvoice_disabled: 'Desativado',
      tempvoice_enabled: 'Ativado',
      tempvoice_base_channels_label: 'Canais base (onde os utilizadores clicam para criar salas)',
      tempvoice_category_label: 'Categoria para criar salas temporárias',
      tempvoice_delete_delay_label: 'Tempo para apagar sala vazia (segundos)',
      tempvoice_save_btn: 'Guardar',
      tempvoice_active_title: 'Salas temporárias ativas',
      tempvoice_active_empty: 'Não existem salas temporárias neste momento.',
      tempvoice_base_list_title: 'Canais base',
      tempvoice_base_list_hint: 'Canais de voz que funcionam como "botões" para criar salas temporárias.',
      tempvoice_base_list_empty: 'Ainda não existem canais base configurados.',
      tempvoice_add_base_btn: 'Adicionar',
      tempvoice_detail_title: 'Configuração',
      tempvoice_detail_hint: 'Define o comportamento global das salas temporárias criadas a partir dos canais base.',
      tempvoice_delete_btn: 'Remover',
      tempvoice_base_list_title: 'Canais base',
      tempvoice_base_list_hint: 'Canais de voz que funcionam como "botões" para criar salas temporárias.',
      tempvoice_base_list_empty: 'Ainda não existem canais base configurados.',
      tempvoice_add_base_btn: 'Adicionar',
      tempvoice_detail_title: 'Configuração',
      tempvoice_detail_hint: 'Define o comportamento global das salas temporárias criadas a partir dos canais base.',
      tempvoice_saved: 'Configuração de voz temporária guardada.',
      tempvoice_save_error: 'Falha ao guardar configuração de voz temporária.',
      gamenews_detail_config_title: 'Configuração do feed',
      gamenews_detail_config_hint: 'Altera os detalhes do feed. As alterações só são guardadas depois de clicares em "Guardar".',
      gamenews_detail_last_sent: 'Último envio',
      gamenews_detail_fail_count: 'Falhas',
      gamenews_detail_action_save: 'Guardar',
      gamenews_detail_action_toggle: 'Ativar/Desativar',
      gamenews_detail_action_remove: 'Remover',
      gamenews_detail_state_empty: 'Ainda não há histórico disponível para este feed.',


      gamenews_editor_title: 'Configuração de feeds',
      gamenews_editor_hint: 'Adiciona, edita ou remove feeds e escolhe o canal para cada um.',
      gamenews_add_feed: 'Adicionar',
      gamenews_save_feeds: 'Guardar alterações',
      gamenews_save_success: 'Feeds de GameNews guardados.',
      gamenews_editor_empty: 'Ainda não existem feeds configurados. Adiciona o primeiro feed para começar.',
      gamenews_feeds_count_zero: '0 feeds configurados',
      gamenews_feeds_count_single: '1 feed configurado',
      gamenews_feeds_count_multiple_prefix: '',
      gamenews_feeds_count_multiple_suffix: ' feeds configurados',

      gamenews_feed_name_label: 'Nome',
      gamenews_feed_url_label: 'URL do feed',
      gamenews_feed_channel_label: 'Canal',
      gamenews_feed_enabled_label: 'Ativo',
      gamenews_feed_url_label: 'URL do feed',
      gamenews_feed_channel_label: 'Canal ID',
      gamenews_feed_remove_label: 'Remover',
      gamenews_feed_log_channel_label: 'Canal de logs (opcional)',
      gamenews_feed_interval_label: 'Intervalo (minutos)',
      gamenews_feed_interval_placeholder: 'Usar intervalo global',

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

        login_title: 'Login',
        login_subtitle: 'Autentica-te para aceder ao painel.',
        login_username_label: 'Utilizador',
        login_password_label: 'Password',
        login_submit: 'Entrar',
        login_error_required: 'Preenche utilizador e password.',
        login_error_invalid: 'Credenciais inválidas ou não autorizadas.',
        login_error_generic: 'Erro ao tentar autenticar. Tenta novamente.',

      tab_overview: 'Overview',
      tab_logs: 'Moderation',
      tab_cases: 'Cases',
      tab_tickets: 'Tickets',
      tab_gamenews: 'Extras',
      extras_title: 'Extras',
      extras_hint: 'Additional tools: news feeds and temporary voice channels.',
      extras_feeds_tab: 'Feeds',
      extras_tempvoice_tab: 'Temporary voice',
        extras_title: 'Extras',
        extras_hint: 'Ferramentas adicionais: feeds de notícias e voz temporária.',
        extras_feeds_tab: 'Feeds',
        extras_tempvoice_tab: 'Voz temporária',
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
      gamenews_reload_status: 'Reload status',
      gamenews_select_guild: 'Select a server to configure GameNews.',
      gamenews_error_generic: 'Could not load GameNews.',

      gamenews_add_section_title: 'Add new feed',
      gamenews_add_section_hint: 'Quickly create a new feed. You can later adjust channel, URL, interval and logs in the configured feeds list.',

      gamenews_feeds_section_title: 'Configured feeds',
      gamenews_feeds_section_hint: 'Add, edit or remove feeds and choose the delivery channel, log channel and per-feed interval.',

      gamenews_history_title: 'GameNews history',
      gamenews_history_hint: 'Overview of feed status: last deliveries, recent errors and automatic pauses.',

      gamenews_detail_title: 'Feed history',
      gamenews_detail_state_title: 'Feed status',
      gamenews_detail_actions_title: 'Quick actions',
      gamenews_detail_empty: 'Select a feed to view its history and edit the configuration.',
      gamenews_detail_config_title: 'Feed configuration',
      gamenews_detail_config_hint: 'Change this feed settings. Changes are only saved after you click "Save".',
      gamenews_detail_last_sent: 'Last sent',
      gamenews_detail_fail_count: 'Failures',
      gamenews_detail_action_save: 'Save',
      gamenews_detail_action_toggle: 'Enable/Disable',
      gamenews_detail_action_remove: 'Remove',
      gamenews_detail_state_empty: 'No history available for this feed yet.',


      gamenews_editor_title: 'Feeds configuration',
      gamenews_editor_hint: 'Add, edit or remove feeds and choose the target channel for each one.',
      gamenews_add_feed: 'Add',
      gamenews_save_feeds: 'Save changes',
      gamenews_save_success: 'GameNews feeds saved.',
      gamenews_editor_empty: 'No feeds configured yet. Add your first feed to get started.',
      gamenews_feeds_count_zero: '0 feeds configured',
      gamenews_feeds_count_single: '1 feed configured',
      gamenews_feeds_count_multiple_prefix: '',
      gamenews_feeds_count_multiple_suffix: ' feeds configured',

      gamenews_feed_name_label: 'Name',
      gamenews_feed_url_label: 'Feed URL',
      gamenews_feed_channel_label: 'Channel',
      gamenews_feed_enabled_label: 'Enabled',
      gamenews_feed_url_label: 'Feed URL',
      gamenews_feed_channel_label: 'Channel ID',
      gamenews_feed_remove_label: 'Remove',
      gamenews_feed_log_channel_label: 'Log channel (optional)',
      gamenews_feed_interval_label: 'Interval (minutes)',
      gamenews_feed_interval_placeholder: 'Use global interval',

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

    // Reset seleção de utilizadores / GameNews ao entrar nas tabs
    if (name === 'user') {
      const userDetail = document.getElementById('userDetailPanel');
      if (userDetail) {
        userDetail.innerHTML = `<div class="empty">${escapeHtml(t('users_detail_empty'))}</div>`;
      }
      const userList = document.querySelector('#tab-user .list');
      if (userList) {
        userList.querySelectorAll('.list-item').forEach(function (row) {
          row.classList.remove('active');
        });
      }
    } else if (name === 'gamenews') {
      state.activeGameNewsFeedIndex = null;
      const feedDetail = document.getElementById('gamenewsFeedDetailPanel');
      if (feedDetail) {
        feedDetail.innerHTML = `<div class="empty">${escapeHtml(t('gamenews_detail_empty'))}</div>`;
      }
      const feedList = document.getElementById('gamenewsFeedsList');
      if (feedList) {
        feedList.querySelectorAll('.list-item').forEach(function (row) {
          row.classList.remove('active');
        });
      }
    }


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
      window.OzarkDashboard.loadLogs().catch(function () {});
    } else if (name === 'cases') {
      window.OzarkDashboard.loadCases().catch(function () {});
    } else if (name === 'gamenews') {
      window.OzarkDashboard.loadGameNews().catch(function () {});
        loadTempVoiceConfig().catch(function () {});
        loadTempVoiceActive().catch(function () {});
    } else if (name === 'user') {
      window.OzarkDashboard.loadUsers().catch(function () {});
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

  

  

  // -----------------------------
  // GameNews (status + editor)
  // -----------------------------

  

  

  
  function collectGameNewsEditorFeeds() {
    const listEl = document.getElementById('gamenewsFeedsList');
    if (!listEl) return [];
    const rows = Array.prototype.slice.call(listEl.querySelectorAll('.list-item'));
    return rows
      .map(function (row) {
        const name = row.querySelector('.feed-name').value.trim();
        const feedUrl = row.querySelector('.feed-url').value.trim();
        const channelId = row.querySelector('.feed-channel').value.trim();
        const logChannelInput = row.querySelector('.feed-log-channel');
        const intervalInput = row.querySelector('.feed-interval');
        const enabled = row.querySelector('.feed-enabled').checked;

        const logChannelId = logChannelInput ? logChannelInput.value.trim() : '';
        const intervalMinutesRaw = intervalInput ? Number(intervalInput.value) : 0;
        const intervalMs =
          Number.isFinite(intervalMinutesRaw) && intervalMinutesRaw > 0
            ? Math.round(intervalMinutesRaw * 60 * 1000)
            : null;

        if (!feedUrl || !channelId) return null;

        return {
          name: name || 'Feed',
          feedUrl: feedUrl,
          channelId: channelId,
          logChannelId: logChannelId || null,
          enabled: enabled,
          intervalMs: intervalMs
        };
      })
      .filter(function (x) {
        return !!x;
      });
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
      await window.OzarkDashboard.loadGameNews();
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

  

  // -----------------------------
  // Cases (infractions history)
  // -----------------------------

  

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

    async function loadTempVoiceConfig() {
      if (!state.guildId) return;

      try {
        const res = await apiGet(`/temp-voice/config?guildId=${encodeURIComponent(state.guildId)}`);
        if (!res || !res.ok) return;

        var cfg = res.config || {};
        var enabledSel = document.getElementById('tempVoiceEnabled');
        var baseIdInput = document.getElementById('tempVoiceBaseId');
        var catInput = document.getElementById('tempVoiceCategoryId');
        var delayInput = document.getElementById('tempVoiceDeleteDelay');

        var baseIds = Array.isArray(cfg.baseChannelIds) ? cfg.baseChannelIds : [];

        state.tempVoiceBase = state.tempVoiceBase || { items: [], selectedIndex: -1 };
        state.tempVoiceBase.items = baseIds.slice();
        state.tempVoiceBase.selectedIndex = baseIds.length ? 0 : -1;

        if (enabledSel) {
          enabledSel.value = cfg.enabled ? 'true' : 'false';
        }
        if (baseIdInput) {
          baseIdInput.value = baseIds.length ? baseIds[0] : '';
        }
        if (catInput) {
          catInput.value = cfg.categoryId || '';
        }
        if (delayInput) {
          delayInput.value = typeof cfg.deleteDelaySeconds === 'number' ? String(cfg.deleteDelaySeconds) : '10';
        }

        if (typeof renderTempVoiceBaseList === 'function') {
          renderTempVoiceBaseList();
        }
      } catch (err) {
        console.error('Failed to load temp voice config', err);
      }
    }

    async function saveTempVoiceConfig() {
      if (!state.guildId) return;

      var enabledSel = document.getElementById('tempVoiceEnabled');
      var catInput = document.getElementById('tempVoiceCategoryId');
      var delayInput = document.getElementById('tempVoiceDeleteDelay');

      if (typeof syncTempVoiceBaseFromInput === 'function') {
        syncTempVoiceBaseFromInput();
      }

      var enabled = enabledSel && enabledSel.value === 'true';
      var categoryId = (catInput && catInput.value) || '';
      var delayRaw = (delayInput && delayInput.value) || '10';

      var baseChannelIds = (state.tempVoiceBase && state.tempVoiceBase.items || []).filter(function (s) { return !!s; });

      var delaySeconds = parseInt(delayRaw, 10);
      if (!Number.isFinite(delaySeconds) || delaySeconds < 2) delaySeconds = 10;

      try {
        const body = {
          guildId: state.guildId,
          enabled: enabled,
          baseChannelIds: baseChannelIds,
          categoryId: categoryId,
          deleteDelaySeconds: delaySeconds
        };
        const res = await apiPost('/temp-voice/config', body);
        if (res && res.ok) {
          toast(t('tempvoice_saved') || 'Configuração de voz temporária guardada.');
          loadTempVoiceConfig().catch(function () {});
        } else {
          toast(t('tempvoice_save_error') || 'Falha ao guardar configuração de voz temporária.', 'error');
        }
      } catch (err) {
        console.error('Failed to save temp voice config', err);
        toast(t('tempvoice_save_error') || 'Falha ao guardar configuração de voz temporária.', 'error');
      }
    }

    async function loadTempVoiceActive() {
      if (!state.guildId) return;

      try {
        const res = await apiGet(`/temp-voice/active?guildId=${encodeURIComponent(state.guildId)}`);
        const listEl = document.getElementById('tempVoiceActiveList');
        if (!listEl) return;

        listEl.innerHTML = '';

        if (!res || !res.ok || !Array.isArray(res.items) || !res.items.length) {
          listEl.innerHTML = `<div class="empty">${escapeHtml(t('tempvoice_active_empty'))}</div>`;
          return;
        }

        res.items.forEach(function (item) {
          var el = document.createElement('div');
          el.className = 'list-item';
          el.innerHTML = `
            <div class="row space">
              <div>
                <div class="title">#${escapeHtml(item.channelId || '')}</div>
                <div class="subtitle">
                  Owner: ${escapeHtml(item.ownerId || '?')} · Base: ${escapeHtml(item.baseChannelId || '?')}
                </div>
              </div>
            </div>
          `;
          listEl.appendChild(el);
        });
      } catch (err) {
        console.error('Failed to load temp voice active list', err);
      }
    }



  function renderTempVoiceBaseList() {
    var listEl = document.getElementById('tempVoiceBaseList');
    if (!listEl) return;

    listEl.innerHTML = '';

    var items = state.tempVoiceBase.items || [];
    if (!items.length) {
      listEl.innerHTML = '<div class="empty">' + escapeHtml(t('tempvoice_base_list_empty')) + '</div>';
      return;
    }

    items.forEach(function (id, index) {
      var row = document.createElement('div');
      row.className = 'list-item' + (index === state.tempVoiceBase.selectedIndex ? ' selected' : '');
      row.dataset.index = String(index);
      row.innerHTML = `
        <div class="row space">
          <div>
            <div class="title">#${escapeHtml(id || '')}</div>
            <div class="subtitle">${escapeHtml(t('tempvoice_base_list_hint'))}</div>
          </div>
        </div>
      `;
      row.addEventListener('click', function () {
        // mostrar estado de loading ao estilo dos feeds
        if (typeof showPanelLoading === 'function') {
          showPanelLoading('tempVoiceDetailPanel');
        }
        selectTempVoiceBaseIndex(index);
      });
      listEl.appendChild(row);
    });
  }

  function selectTempVoiceBaseIndex(index) {
    var items = state.tempVoiceBase.items || [];
    if (index < 0 || index >= items.length) {
      state.tempVoiceBase.selectedIndex = -1;
      var baseIdInput = document.getElementById('tempVoiceBaseId');
      if (baseIdInput) baseIdInput.value = '';
      renderTempVoiceBaseList();
      return;
    }

    state.tempVoiceBase.selectedIndex = index;
    var baseIdInput = document.getElementById('tempVoiceBaseId');
    if (baseIdInput) baseIdInput.value = items[index] || '';
    renderTempVoiceBaseList();
  }

  function addTempVoiceBaseChannel() {
    if (!state.tempVoiceBase.items) state.tempVoiceBase.items = [];
    state.tempVoiceBase.items.push('');
    state.tempVoiceBase.selectedIndex = state.tempVoiceBase.items.length - 1;
    renderTempVoiceBaseList();

    var baseIdInput = document.getElementById('tempVoiceBaseId');
    if (baseIdInput) {
      baseIdInput.focus();
      baseIdInput.select();
    }
  }

  function syncTempVoiceBaseFromInput() {
    var baseIdInput = document.getElementById('tempVoiceBaseId');
    if (!baseIdInput) return;
    var val = (baseIdInput.value || '').trim();
    var idx = state.tempVoiceBase.selectedIndex;
    if (!state.tempVoiceBase.items) state.tempVoiceBase.items = [];
    if (idx >= 0 && idx < state.tempVoiceBase.items.length) {
      state.tempVoiceBase.items[idx] = val;
    } else if (val) {
      state.tempVoiceBase.items.push(val);
      state.tempVoiceBase.selectedIndex = state.tempVoiceBase.items.length - 1;
    }
    state.tempVoiceBase.items = state.tempVoiceBase.items.filter(function (s) { return !!s; });
    renderTempVoiceBaseList();
  }

  function deleteTempVoiceBaseAt(index) {
    if (!state.tempVoiceBase || !Array.isArray(state.tempVoiceBase.items)) return;
    if (index < 0 || index >= state.tempVoiceBase.items.length) return;

    state.tempVoiceBase.items.splice(index, 1);
    if (state.tempVoiceBase.items.length === 0) {
      state.tempVoiceBase.selectedIndex = -1;
      var baseIdInput = document.getElementById('tempVoiceBaseId');
      if (baseIdInput) baseIdInput.value = '';
    } else if (state.tempVoiceBase.selectedIndex >= state.tempVoiceBase.items.length) {
      state.tempVoiceBase.selectedIndex = state.tempVoiceBase.items.length - 1;
      var baseIdInput2 = document.getElementById('tempVoiceBaseId');
      if (baseIdInput2) baseIdInput2.value = state.tempVoiceBase.items[state.tempVoiceBase.selectedIndex] || '';
    }
    renderTempVoiceBaseList();
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
    // Subtabs inside Extras
    document.querySelectorAll('#tab-gamenews .subtabs .subtab').forEach(function (sub) {
      sub.addEventListener('click', function () {
        var name = sub.getAttribute('data-subtab');
        if (!name) return;

        document.querySelectorAll('#tab-gamenews .subtabs .subtab').forEach(function (btn) {
          btn.classList.remove('active');
        });
        sub.classList.add('active');

        document.querySelectorAll('#tab-gamenews .subtab-panel').forEach(function (panel) {
          panel.classList.remove('active');
        });
        var panel = document.getElementById('extras-' + name + '-panel');
        if (panel) panel.classList.add('active');
      });
    });

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
            window.OzarkDashboard.loadLogs().catch(function () {});
          } else if (state.currentTab === 'gamenews') {
            window.OzarkDashboard.loadGameNews().catch(function () {});
            loadTempVoiceConfig().catch(function () {});
            loadTempVoiceActive().catch(function () {});
          } else if (state.currentTab === 'user') {
            window.OzarkDashboard.loadUsers().catch(function () {});
          } else if (state.currentTab === 'config') {
            loadGuildConfig().catch(function () {});
          }
        }
      });
    }

          // Temp voice config
      var btnDeleteTempVoiceBase = document.getElementById('btnDeleteTempVoiceBase');
      if (btnDeleteTempVoiceBase) {
        btnDeleteTempVoiceBase.addEventListener('click', function () {
          if (!state.tempVoiceBase) return;
          var idx = state.tempVoiceBase.selectedIndex;
          if (typeof deleteTempVoiceBaseAt === 'function') {
            deleteTempVoiceBaseAt(idx);
          }
        });
      }


      // Temp voice base channels
      var btnTempVoiceAddBase = document.getElementById('btnTempVoiceAddBase');
      if (btnTempVoiceAddBase) {
        btnTempVoiceAddBase.addEventListener('click', function () {
          addTempVoiceBaseChannel();
        });
      }
      var baseIdInput = document.getElementById('tempVoiceBaseId');
      if (baseIdInput) {
        baseIdInput.addEventListener('change', function () {
          syncTempVoiceBaseFromInput();
        });
        baseIdInput.addEventListener('blur', function () {
          syncTempVoiceBaseFromInput();
        });
      }


      var btnSaveTempVoice = document.getElementById('btnSaveTempVoice');
      if (btnSaveTempVoice) {
        btnSaveTempVoice.addEventListener('click', function () {
          saveTempVoiceConfig().catch(function () {});
        });
      }

// Logs controls
    var btnReloadLogs = document.getElementById('btnReloadLogs');
    if (btnReloadLogs) {
      btnReloadLogs.addEventListener('click', function () {
        window.OzarkDashboard.loadLogs().catch(function () {});
      });
    }

    var logTypeSelect = document.getElementById('logType');
    if (logTypeSelect) {
      logTypeSelect.addEventListener('change', function () {
        window.OzarkDashboard.loadLogs().catch(function () {});
      });
    }

    var logSearchInput = document.getElementById('logSearch');
    if (logSearchInput) {
      logSearchInput.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') {
          window.OzarkDashboard.loadLogs().catch(function () {});
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

    // Login form
    var loginScreen = document.getElementById('loginScreen');
    var loginForm = document.getElementById('loginForm');
    var loginUser = document.getElementById('loginUsername');
    var loginPass = document.getElementById('loginPassword');
    var loginError = document.getElementById('loginError');
    var loginSubmitBtn = document.getElementById('loginSubmitBtn');

    function showLogin() {
      if (loginScreen) loginScreen.classList.remove('hidden');
      if (loginError) loginError.textContent = '';
      if (loginUser) loginUser.focus();
    }

    function hideLogin() {
      if (loginScreen) loginScreen.classList.add('hidden');
      if (loginError) loginError.textContent = '';
    }

    if (loginForm) {
      loginForm.addEventListener('submit', function (ev) {
        ev.preventDefault();
        if (!loginUser || !loginPass || !loginSubmitBtn) return;
        var u = loginUser.value.trim();
        var p = loginPass.value;
        if (!u || !p) {
          if (loginError) loginError.textContent = t('login_error_required') || 'Preenche utilizador e password.';
          return;
        }
        loginSubmitBtn.disabled = true;
        loginSubmitBtn.classList.add('is-loading');
        fetch(API_BASE + '/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: u, password: p })
        })
          .then(function (res) { return res.json().catch(function () { return {}; }); })
          .then(function (data) {
            if (!data || !data.ok || !data.token) {
              if (loginError) {
                loginError.textContent =
                  (data && data.error && String(data.error)) ||
                  (t('login_error_invalid') || 'Credenciais inválidas ou não autorizadas.');
              }
              return;
            }
            setToken(data.token);
            hideLogin();
            // Depois de login, carrega guilds e visão geral
            loadGuilds().catch(function () {});
            setTab('overview');
          })
          .catch(function () {
            if (loginError) {
              loginError.textContent = t('login_error_generic') || 'Erro ao tentar autenticar. Tenta novamente.';
            }
          })
          .finally(function () {
            loginSubmitBtn.disabled = false;
            loginSubmitBtn.classList.remove('is-loading');
          });
      });
    }

    // Carrega guilds e visão geral inicial, se já houver token guardado
    if (getToken()) {
      hideLogin();
      loadGuilds().catch(function () {});
      setTab('overview');
    } else {
      showLogin();
    }
  });

  // Expose key parts on global namespace for future multi-file split
  window.OzarkDashboard.state = state;
  window.OzarkDashboard.API_BASE = API_BASE;
  window.OzarkDashboard.getToken = getToken;
  window.OzarkDashboard.setToken = setToken;
  window.OzarkDashboard.clearToken = clearToken;
window.OzarkDashboard.apiGet = apiGet;
  window.OzarkDashboard.apiPost = apiPost;
  window.OzarkDashboard.toast = toast;
  window.OzarkDashboard.t = t;
  window.OzarkDashboard.escapeHtml = escapeHtml;
  window.OzarkDashboard.setTab = setTab;
  window.OzarkDashboard.loadGuilds = loadGuilds;

  // Users

  // Moderation (logs / cases)
  window.OzarkDashboard.createLogRow = createLogRow;
  window.OzarkDashboard.createCaseRow = createCaseRow;
  window.OzarkDashboard.renderLogs = renderLogs;

  // GameNews
    
})();