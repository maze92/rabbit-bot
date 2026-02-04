'use strict';

(function () {
  // Global namespace for multi-file-friendly dashboard
  window.OzarkDashboard = window.OzarkDashboard || {};

  const state = {
    lang: 'pt',
    guildId: null,
    currentTab: 'overview',
    guilds: [],
    dashboardUsers: [],
    dashboardUsersEditingId: null
  };

  
  function formatDateTime(ts) {
    if (!ts) return '—';
    try {
      const d = new Date(ts);
      if (Number.isNaN(d.getTime())) return '—';
      const opts = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      };
      const tz = state && state.guildTimezone ? state.guildTimezone : undefined;
      const lang = state && state.lang ? state.lang : 'pt';
      return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'pt-PT', tz ? Object.assign({ timeZone: tz }, opts) : opts).format(d);
    } catch {
      try {
        return new Date(ts).toLocaleString();
      } catch {
        return String(ts);
      }
    }
  }

const API_BASE = '/api';
  const TOKEN_KEY = 'DASHBOARD_TOKEN';
    const LANG_KEY = 'OZARK_DASH_LANG';

  // Initialize language from localStorage (if available)
  try {
    var storedLang = null;
    try {
      storedLang = localStorage.getItem('OZARK_DASH_LANG');
    } catch (e) {}
    if (storedLang === 'pt' || storedLang === 'en') {
      state.lang = storedLang;
    }
  } catch (e) {}


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



  function handleAuthError(status) {
    if (status === 401) {
      clearToken();
      try {
        showLogin();
      } catch (e) {
        console.error('Failed to show login after 401', e);
      }
    }
  }

  async function apiGet(path, options) {
    const opts = options || {};
    const res = await fetch(API_BASE + path, {
      method: 'GET',
      headers: getAuthHeaders(),
      signal: opts.signal
    });
    let payload = null;
    try {
      // Tentar ler JSON mesmo em erro, para extrair mensagem da API
      payload = await res.json();
    } catch (e) {
      payload = null;
    }
    if (!res.ok) {
      handleAuthError(res.status);
      const msg = payload && (payload.error || payload.message);
      const err = new Error(msg || `HTTP ${res.status} for ${path}`);
      err.status = res.status;
      if (msg) err.apiMessage = msg;
      throw err;
    }
    return payload;
  }

  async function apiPost(path, body, options) {
    const opts = options || {};
    const res = await fetch(API_BASE + path, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeaders()),
      body: JSON.stringify(body || {}),
      signal: opts.signal
    });
    let payload = null;
    try {
      payload = await res.json();
    } catch (e) {
      payload = null;
    }
    if (!res.ok) {
      handleAuthError(res.status);
      const msg = payload && (payload.error || payload.message);
      const err = new Error(msg || `HTTP ${res.status} for ${path}`);
      err.status = res.status;
      if (msg) err.apiMessage = msg;
      throw err;
    }
    return payload;
  }

  async function apiPut(path, body, options) {
    const opts = options || {};
    const res = await fetch(API_BASE + path, {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeaders()),
      body: JSON.stringify(body || {}),
      signal: opts.signal
    });
    if (!res.ok) {
      handleAuthError(res.status);
      throw new Error(`HTTP ${res.status} for ${path}`);
    }
    return res.json();
  }

  async function apiDelete(path, options) {
    const opts = options || {};
    const res = await fetch(API_BASE + path, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      signal: opts.signal
    });
    let payload = null;
    try {
      payload = await res.json();
    } catch (e) {
      payload = null;
    }
    if (!res.ok) {
      handleAuthError(res.status);
      const msg = payload && (payload.error || payload.message);
      const err = new Error(msg || `HTTP ${res.status} for ${path}`);
      err.status = res.status;
      if (msg) err.apiMessage = msg;
      throw err;
    }
    return payload;
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

 
  function showPanelLoading(panelId) {
    var panel = document.getElementById(panelId);
    if (!panel) return;
    panel.classList.add('panel-loading');
    setTimeout(function () {
      panel.classList.remove('panel-loading');
    }, 350);
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

  function t(key, params) {
    if (window.OzarkDashboard && window.OzarkDashboard.I18n) {
      return window.OzarkDashboard.I18n.t(key, params || {});
    }
    return key;
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

  async function refreshBotStatusBadge() {
    const el = document.getElementById('badgeBot');
    if (!el) return;

    try {
      const res = await fetch('/health', { method: 'GET' });
      if (!res.ok) throw new Error('Health failed');
      const data = await res.json();

      const ok = !!data.ok && !!data.discordReady;

      el.classList.remove('status-online', 'status-offline');

      if (ok) {
        el.classList.add('status-online');
        el.textContent = '● ' + (t('badge_bot_online'));
      } else {
        el.classList.add('status-offline');
        el.textContent = '● ' + (t('badge_bot_offline'));
      }
    } catch (e) {
      console.error('Failed to refresh bot status badge', e);
      el.classList.remove('status-online');
      el.classList.add('status-offline');
      el.textContent = '● ' + (t('badge_bot_offline'));
    }
  }




function setLang(newLang) {
  state.lang = (newLang || 'pt').toLowerCase();

  try {
    localStorage.setItem(LANG_KEY, state.lang);
  } catch (e) {}

  if (
    window.OzarkDashboard &&
    window.OzarkDashboard.I18n &&
    typeof window.OzarkDashboard.I18n.init === 'function'
  ) {
    window.OzarkDashboard.I18n.init(state.lang).then(function () {
      applyI18n();
    });
  } else {
    applyI18n();
  }
}

// -----------------------------
  // Tab / layout helpers
  // -----------------------------

  function setTab(name) {
    const tabsRequiringGuild = ['logs', 'gamenews', 'user', 'config', 'tickets'];
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
      if (window.OzarkDashboard.loadModerationOverview) {
        window.OzarkDashboard.loadModerationOverview().catch(function () {});
      }
      window.OzarkDashboard.loadLogs().catch(function () {});
    } else if (name === 'gamenews') {
      window.OzarkDashboard.loadGameNews().catch(function () {});
      loadTempVoiceConfig().catch(function () {});
      loadTempVoiceActive().catch(function () {});
      // Garantir que canais/roles de configuração estão disponíveis para Tickets/Extras
      loadGuildConfig().catch(function () {});
    } else if (name === 'user') {
      window.OzarkDashboard.loadUsers().catch(function () {});
    } else if (name === 'config') {
      loadGuildConfig().catch(function () {});
      loadDashboardUsers().catch(function () {});
    }
  }

  function updateTabAccess() {
    const warn = document.getElementById('tabWarning');
    const hasGuild = !!state.guildId;
    if (warn) {
      warn.style.display = hasGuild ? 'none' : 'block';
    }

    const tabsRequiringGuild = ['logs', 'gamenews', 'user', 'config', 'tickets'];
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
      toast(err && err.apiMessage ? err.apiMessage : t('overview_error_generic'));
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
    optLoading.textContent = t('guilds_loading_option');
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
      toast(err && err.apiMessage ? err.apiMessage : t('guilds_error_generic'));
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
        statusLabel = t('tickets_status_closed');
      } else if (tkt.reopenedAt) {
        statusLabel = t('tickets_status_reopened');
      } else if (tkt.lastResponderName) {
        statusLabel = t('tickets_status_answered');
      } else {
        statusLabel = t('tickets_status_open');
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
          escapeHtml(t('tickets_last_reply')) +
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

      // Server language / timezone (guild-level settings)
      state.guildLanguage = (conf && typeof conf.language === 'string') ? conf.language : 'auto';
      state.guildTimezone = (conf && typeof conf.timezone === 'string' && conf.timezone.trim()) ? conf.timezone.trim() : null;



      const logSelect = document.getElementById('configLogChannel');
      const dashLogSelect = document.getElementById('configDashboardLogChannel');
      const ticketSelect = document.getElementById('configTicketChannel');
      const staffSelect = document.getElementById('configStaffRoles');
      const langSelect = document.getElementById('configServerLanguage');
      const tzSelect = document.getElementById('configServerTimezone');
      if (langSelect) langSelect.value = state.guildLanguage || 'auto';
      if (tzSelect) tzSelect.value = state.guildTimezone || '';

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

      const baseInput = document.getElementById('trustBaseInput');
      const minInput = document.getElementById('trustMinInput');
      const maxInput = document.getElementById('trustMaxInput');
      const warnInput = document.getElementById('trustWarnPenaltyInput');
      const muteInput = document.getElementById('trustMutePenaltyInput');
      const regenPerDayInput = document.getElementById('trustRegenPerDayInput');
      const regenMaxDaysInput = document.getElementById('trustRegenMaxDaysInput');
      const lowThresholdInput = document.getElementById('trustLowThresholdInput');
      const highThresholdInput = document.getElementById('trustHighThresholdInput');

      if (trust && baseEl && minMaxEl && penaltiesEl && regenEl && riskEl) {
        const base = Number.isFinite(Number(trust.base)) ? Number(trust.base) : null;
        const min = Number.isFinite(Number(trust.min)) ? Number(trust.min) : null;
        const max = Number.isFinite(Number(trust.max)) ? Number(trust.max) : null;

        baseEl.textContent = base !== null ? String(base) : '—';
        minMaxEl.textContent = min !== null && max !== null ? min + ' / ' + max : '—';

        if (baseInput) baseInput.value = base !== null ? String(base) : '';

        if (minInput) minInput.value = min !== null ? String(min) : '';
        if (maxInput) maxInput.value = max !== null ? String(max) : '';

        const warnPenalty = Number.isFinite(Number(trust.warnPenalty)) ? Number(trust.warnPenalty) : null;
        const mutePenalty = Number.isFinite(Number(trust.mutePenalty)) ? Number(trust.mutePenalty) : null;
        penaltiesEl.textContent =
          warnPenalty !== null && mutePenalty !== null
            ? 'WARN: -' + warnPenalty + ' • MUTE: -' + mutePenalty
            : '—';

        if (warnInput) warnInput.value = warnPenalty !== null ? String(warnPenalty) : '';
        if (muteInput) muteInput.value = mutePenalty !== null ? String(mutePenalty) : '';

        const regenPerDay = Number.isFinite(Number(trust.regenPerDay)) ? Number(trust.regenPerDay) : null;
        const regenMaxDays = Number.isFinite(Number(trust.regenMaxDays)) ? Number(trust.regenMaxDays) : null;
        regenEl.textContent =
          regenPerDay !== null && regenMaxDays !== null
            ? regenPerDay + ' / dia até ' + regenMaxDays + ' dias'
            : '—';

        if (regenPerDayInput) regenPerDayInput.value = regenPerDay !== null ? String(regenPerDay) : '';
        if (regenMaxDaysInput) regenMaxDaysInput.value = regenMaxDays !== null ? String(regenMaxDays) : '';

        const lowT = Number.isFinite(Number(trust.lowTrustThreshold || trust.lowThreshold)) ? Number(trust.lowTrustThreshold || trust.lowThreshold) : null;
        const highT = Number.isFinite(Number(trust.highTrustThreshold || trust.highThreshold)) ? Number(trust.highTrustThreshold || trust.highThreshold) : null;
        if (lowT !== null && highT !== null) {
          riskEl.textContent = `< ${lowT} (risco) • > ${highT} (confiança)`;
        } else {
          riskEl.textContent = '—';
        }

        if (lowThresholdInput) lowThresholdInput.value = lowT !== null ? String(lowT) : '';
        if (highThresholdInput) highThresholdInput.value = highT !== null ? String(highT) : '';
      } else if (baseEl && minMaxEl && penaltiesEl && regenEl && riskEl) {
        // No guild-specific trust config found; show the global defaults so the UI is didactic.
        var defaultBase = 50;
        var defaultMin = 0;
        var defaultMax = 100;
        var defaultWarnPenalty = 10;
        var defaultMutePenalty = 25;
        var defaultRegenPerDay = 5;
        var defaultRegenMaxDays = 14;
        var defaultLowThreshold = 30;
        var defaultHighThreshold = 70;

        baseEl.textContent = String(defaultBase);
        minMaxEl.textContent = defaultMin + ' / ' + defaultMax;
        penaltiesEl.textContent = 'WARN: -' + defaultWarnPenalty + ' • MUTE: -' + defaultMutePenalty;
        regenEl.textContent = defaultRegenPerDay + ' / dia até ' + defaultRegenMaxDays + ' dias';
        riskEl.textContent = '< ' + defaultLowThreshold + ' (risco) • > ' + defaultHighThreshold + ' (confiança)';

        if (baseInput) baseInput.value = String(defaultBase);
        if (minInput) minInput.value = String(defaultMin);
        if (maxInput) maxInput.value = String(defaultMax);
        if (warnInput) warnInput.value = String(defaultWarnPenalty);
        if (muteInput) muteInput.value = String(defaultMutePenalty);
        if (regenPerDayInput) regenPerDayInput.value = String(defaultRegenPerDay);
        if (regenMaxDaysInput) regenMaxDaysInput.value = String(defaultRegenMaxDays);
        if (lowThresholdInput) lowThresholdInput.value = String(defaultLowThreshold);
        if (highThresholdInput) highThresholdInput.value = String(defaultHighThreshold);
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

  function setDashboardUserPermInputs(perms) {
    var p = perms || {};
    var viewLogs = document.getElementById('permViewLogs');
    var actOnCases = document.getElementById('permActOnCases');
    var manageTickets = document.getElementById('permManageTickets');
    var manageGameNews = document.getElementById('permManageGameNews');
    var viewConfig = document.getElementById('permViewConfig');
    var editConfig = document.getElementById('permEditConfig');
    var manageUsers = document.getElementById('permManageUsers');

    if (viewLogs) viewLogs.checked = !!p.canViewLogs;
    if (actOnCases) actOnCases.checked = !!p.canActOnCases;
    if (manageTickets) manageTickets.checked = !!p.canManageTickets;
    if (manageGameNews) manageGameNews.checked = !!p.canManageGameNews;
    if (viewConfig) viewConfig.checked = !!p.canViewConfig;
    if (editConfig) editConfig.checked = !!p.canEditConfig;
    if (manageUsers) manageUsers.checked = !!p.canManageUsers;
  }

  function getDashboardUserPermInputs() {
    var viewLogs = document.getElementById('permViewLogs');
    var actOnCases = document.getElementById('permActOnCases');
    var manageTickets = document.getElementById('permManageTickets');
    var manageGameNews = document.getElementById('permManageGameNews');
    var viewConfig = document.getElementById('permViewConfig');
    var editConfig = document.getElementById('permEditConfig');
    var manageUsers = document.getElementById('permManageUsers');

    return {
      canViewLogs: !!(viewLogs && viewLogs.checked),
      canActOnCases: !!(actOnCases && actOnCases.checked),
      canManageTickets: !!(manageTickets && manageTickets.checked),
      canManageGameNews: !!(manageGameNews && manageGameNews.checked),
      canViewConfig: !!(viewConfig && viewConfig.checked),
      canEditConfig: !!(editConfig && editConfig.checked),
      canManageUsers: !!(manageUsers && manageUsers.checked)
    };
  }

  function openDashboardUserEditor(user) {
    var editor = document.getElementById('dashboardUsersEditor');
    if (!editor) return;

    var titleEl = document.getElementById('dashboardUsersEditorTitle');
    var usernameInput = document.getElementById('dashboardUserUsername');
    var passwordInput = document.getElementById('dashboardUserPassword');
    var passwordHint = document.getElementById('dashboardUserPasswordHint');
    var roleSelect = document.getElementById('dashboardUserRole');

    state.dashboardUsersEditingId = user && user.id ? String(user.id) : null;

    if (user && user.id) {
      if (titleEl) titleEl.textContent = t('config_dashboard_users_editor_edit_title');
      if (usernameInput) {
        usernameInput.value = user.username || '';
        usernameInput.disabled = true;
      }
      if (passwordInput) {
        passwordInput.value = '';
        passwordInput.disabled = true;
      }
      if (passwordHint) {
        passwordHint.textContent =
          t('config_dashboard_users_password_edit_hint');
      }
      if (roleSelect) {
        roleSelect.value = user.role === 'ADMIN' ? 'ADMIN' : 'MOD';
      }
      setDashboardUserPermInputs(user.permissions || {});
    } else {
      if (titleEl) titleEl.textContent = t('config_dashboard_users_editor_new_title');
      if (usernameInput) {
        usernameInput.value = '';
        usernameInput.disabled = false;
      }
      if (passwordInput) {
        passwordInput.value = '';
        passwordInput.disabled = false;
      }
      if (passwordHint) {
        passwordHint.textContent =
          t('config_dashboard_users_password_hint');
      }
      if (roleSelect) {
        roleSelect.value = 'MOD';
      }
      setDashboardUserPermInputs({
        canViewLogs: true,
        canActOnCases: true,
        canManageTickets: false,
        canManageGameNews: false,
        canViewConfig: true,
        canEditConfig: false,
        canManageUsers: false
      });
    }

    editor.classList.remove('hidden');
  }

  function closeDashboardUserEditor() {
    var editor = document.getElementById('dashboardUsersEditor');
    if (editor) editor.classList.add('hidden');
    state.dashboardUsersEditingId = null;
  }

  function renderDashboardUsersList() {
    var listEl = document.getElementById('dashboardUsersList');
    if (!listEl) return;
    var users = state.dashboardUsers || [];
    listEl.innerHTML = '';

    if (!users.length) {
      var empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent =
        t('config_dashboard_users_list_empty');
      listEl.appendChild(empty);
      return;
    }

    users.forEach(function (u) {
      var item = document.createElement('div');
      item.className = 'dashboard-user-item';

      var main = document.createElement('div');
      main.className = 'dashboard-user-main';

      var usernameEl = document.createElement('div');
      usernameEl.className = 'username';
      usernameEl.textContent = u.username || '—';

      var meta = document.createElement('div');
      meta.className = 'meta';

      var roleBadge = document.createElement('span');
      roleBadge.className = 'badge-role ' + (u.role === 'ADMIN' ? 'admin' : 'mod');
      roleBadge.textContent =
        u.role === 'ADMIN'
          ? (t('config_dashboard_users_role_admin'))
          : (t('config_dashboard_users_role_mod'));

      meta.appendChild(roleBadge);

      var perms = u.permissions || {};
      var labels = [];
      if (perms.canViewLogs) labels.push(t('config_dashboard_users_perm_view_logs'));
      if (perms.canActOnCases) labels.push(t('config_dashboard_users_perm_act_on_cases'));
      if (perms.canManageTickets) labels.push(t('config_dashboard_users_perm_manage_tickets'));
      if (perms.canManageGameNews) labels.push(t('config_dashboard_users_perm_manage_gamenews'));
      if (perms.canViewConfig) labels.push(t('config_dashboard_users_perm_view_config'));
      if (perms.canEditConfig) labels.push(t('config_dashboard_users_perm_edit_config'));
      if (perms.canManageUsers) labels.push(t('config_dashboard_users_perm_manage_users'));

      if (labels.length) {
        var permsSpan = document.createElement('span');
        permsSpan.textContent = labels.join(' • ');
        meta.appendChild(permsSpan);
      }

      main.appendChild(usernameEl);
      main.appendChild(meta);

      var actions = document.createElement('div');
      actions.className = 'actions';

      var editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn small';
      editBtn.textContent = t('config_dashboard_users_edit_button');
      editBtn.addEventListener('click', function () {
        openDashboardUserEditor(u);
      });

      var deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn small danger';
      deleteBtn.textContent = t('config_dashboard_users_delete_button');
      deleteBtn.addEventListener('click', function () {
        confirmDeleteDashboardUser(u);
      });

      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);

      main.appendChild(actions);
      item.appendChild(main);

      listEl.appendChild(item);
    });
  }

  async function loadDashboardUsers() {
    var listEl = document.getElementById('dashboardUsersList');
    var statusEl = document.getElementById('dashboardUsersStatus');
    var addBtn = document.getElementById('btnDashboardUsersAdd');
    var editor = document.getElementById('dashboardUsersEditor');
    if (!listEl) return;

    listEl.innerHTML =
      '<div class="empty">' +
      escapeHtml(t('config_dashboard_users_loading')) +
      '</div>';
    if (statusEl) statusEl.textContent = '';

    try {
      var res = await apiGet('/auth/users');
      var users = (res && res.users) || [];
      state.dashboardUsers = users;
      renderDashboardUsersList();
      if (addBtn) {
        addBtn.disabled = false;
        addBtn.classList.remove('disabled');
      }
    } catch (err) {
      console.error('Failed to load dashboard users', err);
      if (statusEl) {
        statusEl.textContent =
          t('config_dashboard_users_no_permission');
      }
      listEl.innerHTML = '';
      if (addBtn) {
        addBtn.disabled = true;
        addBtn.classList.add('disabled');
      }
      if (editor) {
        editor.classList.add('hidden');
      }
    }
  }

  async function saveDashboardUserFromEditor() {
    var usernameInput = document.getElementById('dashboardUserUsername');
    var passwordInput = document.getElementById('dashboardUserPassword');
    var roleSelect = document.getElementById('dashboardUserRole');
    var statusEl = document.getElementById('dashboardUsersStatus');

    var role = roleSelect ? roleSelect.value : 'MOD';
    var perms = getDashboardUserPermInputs();
    var editingId = state.dashboardUsersEditingId || null;

    var payload = {
      role: role === 'ADMIN' ? 'ADMIN' : 'MOD',
      permissions: perms
    };

    try {
      if (!editingId) {
        var username = usernameInput ? usernameInput.value.trim() : '';
        var password = passwordInput ? passwordInput.value : '';
        if (!username || !password) {
          if (statusEl) {
            statusEl.textContent =
              t('config_dashboard_users_error_required');
          }
          return;
        }
        payload.username = username;
        payload.password = password;
        await apiPost('/auth/users', payload);
      } else {
        await apiPut('/auth/users/' + encodeURIComponent(editingId), payload);
      }

      if (statusEl) {
        statusEl.textContent =
          t('config_dashboard_users_save_success');
      }
      closeDashboardUserEditor();
      await loadDashboardUsers();
    } catch (err) {
      console.error('Failed to save dashboard user', err);
      if (statusEl) {
        statusEl.textContent =
          t('config_dashboard_users_save_error');
      }
    }
  }

  async function confirmDeleteDashboardUser(user) {
    if (!user || !user.id) return;
    var statusEl = document.getElementById('dashboardUsersStatus');
    var msg =
      t('config_dashboard_users_delete_confirm');
    if (!window.confirm(msg)) return;

    try {
      await apiDelete('/auth/users/' + encodeURIComponent(user.id));
      if (statusEl) {
        statusEl.textContent =
          t('config_dashboard_users_delete_success');
      }
      await loadDashboardUsers();
    } catch (err) {
      console.error('Failed to delete dashboard user', err);
      if (statusEl) {
        statusEl.textContent =
          t('config_dashboard_users_delete_error');
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
      const langSelect = document.getElementById('configServerLanguage');
      const tzSelect = document.getElementById('configServerTimezone');

      const logChannelId = logSelect && logSelect.value ? logSelect.value : null;
      const dashLogChannelId = dashLogSelect && dashLogSelect.value ? dashLogSelect.value : null;
      const ticketThreadChannelId = ticketSelect && ticketSelect.value ? ticketSelect.value : null;

      const staffRoleIds = [];
      if (staffSelect) {
        Array.prototype.forEach.call(staffSelect.selectedOptions || [], function (opt) {
          if (opt.value) staffRoleIds.push(opt.value);
        });
      }

      const language = langSelect && langSelect.value ? langSelect.value : 'auto';
      const timezone = tzSelect && tzSelect.value ? tzSelect.value.trim() || null : null;

      try {
        await apiPost('/guilds/' + encodeURIComponent(state.guildId) + '/config', {
          logChannelId: logChannelId,
          dashboardLogChannelId: dashLogChannelId,
          ticketThreadChannelId: ticketThreadChannelId,
          staffRoleIds: staffRoleIds,
          language: language,
          timezone: timezone,
        });

        state.guildLanguage = language;
        state.guildTimezone = timezone;

        if (state.guildLanguage && state.guildLanguage !== 'auto') {
          setLang(state.guildLanguage);
        } else {
          setLang(state.lang || 'pt');
        }

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
        var maxUsersInput = document.getElementById('tempVoiceMaxUsers');

        var baseIds = Array.isArray(cfg.baseChannelIds) ? cfg.baseChannelIds : [];

        state.tempVoiceBase = state.tempVoiceBase || { items: [], selectedIndex: -1 };
        state.tempVoiceBase.items = baseIds.slice();
        state.tempVoiceBase.selectedIndex = -1;

        if (enabledSel) {
          enabledSel.value = cfg.enabled ? 'true' : 'false';
        }
        if (baseIdInput) {
          baseIdInput.value = '';
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
          toast(t('tempvoice_saved'));
          loadTempVoiceConfig().catch(function () {});
        } else {
          toast(t('tempvoice_save_error'), 'error');
        }
      } catch (err) {
        console.error('Failed to save temp voice config', err);
        toast(t('tempvoice_save_error'), 'error');
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
      row.className = 'list-item' + (index === state.tempVoiceBase.selectedIndex ? ' active' : '');
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
      var emptyEl = document.getElementById('tempVoiceDetailEmpty');
      var contentEl = document.getElementById('tempVoiceDetailContent');
      var currentLabel = document.getElementById('tempVoiceCurrentBaseLabel');

      if (index < 0 || index >= items.length) {
        state.tempVoiceBase.selectedIndex = -1;
        var baseIdInput = document.getElementById('tempVoiceBaseId');
        if (baseIdInput) baseIdInput.value = '';
        if (emptyEl) emptyEl.style.display = '';
        if (contentEl) contentEl.style.display = 'none';
        if (currentLabel) currentLabel.textContent = t('tempvoice_current_base') + ' (nenhum selecionado)';
        renderTempVoiceBaseList();
        return;
      }

      state.tempVoiceBase.selectedIndex = index;
      var baseIdInput2 = document.getElementById('tempVoiceBaseId');
      if (baseIdInput2) baseIdInput2.value = items[index] || '';
      if (emptyEl) emptyEl.style.display = 'none';
      if (contentEl) contentEl.style.display = '';
      if (currentLabel) currentLabel.textContent = t('tempvoice_current_base') + ' ' + (items[index] || '');
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
      
    // Bot status badge
    refreshBotStatusBadge();
    setInterval(refreshBotStatusBadge, 20000);

      // i18n inicial
      (function initLang() {
        var lang = 'pt';
        try {
          var stored = localStorage.getItem(LANG_KEY);
          if (stored) lang = stored;
        } catch (e) {}

        state.lang = (lang || 'pt').toLowerCase();

        window.OzarkDashboard = window.OzarkDashboard || {};
        window.OzarkDashboard.I18n = window.OzarkDashboard.I18n || {};

        if (typeof window.OzarkDashboard.I18n.init === 'function') {
          window.OzarkDashboard.I18n.init(state.lang).then(function () {
            applyI18n();
          });
        } else {
          applyI18n();
        }
      })();

    // Tabs
    document.querySelectorAll('.tabs button[data-tab]').forEach(function (btn) {
    // Subtabs inside Extras
    document.querySelectorAll('#tab-gamenews .subtabs .subtab').forEach(function (sub) {
      sub.addEventListener('click', function () {
        var name = sub.getAttribute('data-subtab');
        if (!name) return;

        // Reset estado da voz temporária sempre que se entra na subtab
        if (name === 'tempvoice') {
          try {
            state.tempVoiceBase = state.tempVoiceBase || { items: [], selectedIndex: -1 };
            state.tempVoiceBase.selectedIndex = -1;

            var baseIdInput = document.getElementById('tempVoiceBaseId');
            if (baseIdInput) baseIdInput.value = '';

            var emptyEl = document.getElementById('tempVoiceDetailEmpty');
            var contentEl = document.getElementById('tempVoiceDetailContent');
            var currentLabel = document.getElementById('tempVoiceCurrentBaseLabel');
            if (emptyEl) emptyEl.style.display = '';
            if (contentEl) contentEl.style.display = 'none';
            if (currentLabel) {
              currentLabel.textContent = t('tempvoice_current_base') + ' (nenhum selecionado)';
            }
            if (typeof renderTempVoiceBaseList === 'function') {
              renderTempVoiceBaseList();
            }
          } catch (e) {
            console.error('Failed to reset temp voice detail', e);
          }
        }

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
          if (loginError) loginError.textContent = t('login_error_required');
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
                  (t('login_error_invalid'));
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
              loginError.textContent = t('login_error_generic');
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
  

    // Dashboard Users (Config)
    var btnDashUsersReload = document.getElementById('btnDashboardUsersReload');
    var btnDashUsersAdd = document.getElementById('btnDashboardUsersAdd');
    var btnDashUsersCancel = document.getElementById('btnDashboardUsersCancel');
    var btnDashUsersSave = document.getElementById('btnDashboardUsersSave');

    if (btnDashUsersReload) {
      btnDashUsersReload.addEventListener('click', function () {
        loadDashboardUsers().catch(function () {});
      });
    }
    if (btnDashUsersAdd) {
      btnDashUsersAdd.addEventListener('click', function () {
        openDashboardUserEditor(null);
      });
    }
    if (btnDashUsersCancel) {
      btnDashUsersCancel.addEventListener('click', function () {
        closeDashboardUserEditor();
      });
    }
    if (btnDashUsersSave) {
      btnDashUsersSave.addEventListener('click', function () {
        saveDashboardUserFromEditor();
      });
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
  window.OzarkDashboard.formatDateTime = formatDateTime;
  window.OzarkDashboard.setTab = setTab;
  window.OzarkDashboard.loadGuilds = loadGuilds;

  // Moderation (logs / cases)
  window.OzarkDashboard.createLogRow = createLogRow;
  window.OzarkDashboard.createCaseRow = createCaseRow;
  window.OzarkDashboard.renderLogs = renderLogs;

  // JSON import/export helpers for guild config
  
async function exportGuildConfigJson() {
  if (!state.guildId) return;
  if (typeof document === 'undefined') return;

  try {
    const cfg = await apiGet('/guilds/' + encodeURIComponent(state.guildId) + '/config');
    const conf = cfg && cfg.config ? cfg.config : {};

    const payload = {
      guildId: conf.guildId || state.guildId || null,
      language: typeof conf.language === 'string' ? conf.language : 'auto',
      timezone: (typeof conf.timezone === 'string' && conf.timezone.trim()) ? conf.timezone.trim() : null,
      logChannelId: conf.logChannelId || null,
      dashboardLogChannelId: conf.dashboardLogChannelId || null,
      ticketThreadChannelId: conf.ticketThreadChannelId || null,
      staffRoleIds: Array.isArray(conf.staffRoleIds) ? conf.staffRoleIds : []
    };

    const json = JSON.stringify(payload, null, 2);

    const ta = document.getElementById('configJsonExport');
    if (ta) {
      ta.value = json;
    }

    try {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ozark-guild-config-' + (payload.guildId || 'unknown') + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn('Unable to trigger automatic JSON download:', e);
    }

    toast(t('config_saved'));
  } catch (err) {
    console.error('Failed to export guild config JSON', err);
    toast(t('config_error_generic'));
  }
}


async function importGuildConfigJson() {
  if (!state.guildId) return;
  if (typeof document === 'undefined') return;

  const ta = document.getElementById('configJsonImport');
  if (!ta || !ta.value.trim()) {
    toast(t('config_error_generic'));
    return;
  }

  let parsed = null;
  try {
    parsed = JSON.parse(ta.value);
  } catch (e) {
    console.error('Invalid JSON for import', e);
    toast(t('config_error_generic'));
    return;
  }

  const payload = {
    logChannelId: parsed.logChannelId || null,
    dashboardLogChannelId: parsed.dashboardLogChannelId || null,
    ticketThreadChannelId: parsed.ticketThreadChannelId || null,
    staffRoleIds: Array.isArray(parsed.staffRoleIds) ? parsed.staffRoleIds.filter(Boolean) : []
  };

  if (typeof parsed.language === 'string') {
    payload.language = parsed.language;
  }
  if (typeof parsed.timezone === 'string') {
    payload.timezone = parsed.timezone;
  }

  try {
    await apiPost('/guilds/' + encodeURIComponent(state.guildId) + '/config', payload);
    toast(t('config_saved'));

    if (payload.language) {
      state.guildLanguage = payload.language;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'timezone')) {
      state.guildTimezone = payload.timezone;
    }

    if (state.guildLanguage && state.guildLanguage !== 'auto') {
      setLang(state.guildLanguage);
    }

    await loadGuildConfig();
  } catch (err) {
    console.error('Failed to import guild config JSON', err);
    toast(t('config_error_save'));
  }
}

  window.OzarkDashboard.exportGuildConfigJson = exportGuildConfigJson;
  window.OzarkDashboard.importGuildConfigJson = importGuildConfigJson;

})(); // close main dashboard IIFE

// Wire JSON import/export buttons (safe even if DOMContentLoaded already ran)
(function () {
  if (typeof document === 'undefined') return;
  function bindJsonButtons() {
    var btnExport = document.getElementById('configJsonExportBtn');
    var btnImport = document.getElementById('configJsonImportBtn');
    if (btnExport && window.OzarkDashboard && typeof window.OzarkDashboard.exportGuildConfigJson === 'function') {
      btnExport.addEventListener('click', function () {
        window.OzarkDashboard.exportGuildConfigJson().catch(function () {});
      }, { once: true });
    }
    if (btnImport && window.OzarkDashboard && typeof window.OzarkDashboard.importGuildConfigJson === 'function') {
      btnImport.addEventListener('click', function () {
        window.OzarkDashboard.importGuildConfigJson().catch(function () {});
      }, { once: true });
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindJsonButtons);
  } else {
    bindJsonButtons();
  }
})();