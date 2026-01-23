// Estado simples
const state = {
  lang: 'pt',
};

const DASH_TOKEN_KEY = 'DASHBOARD_TOKEN';

let socket = null;
let socketConnected = false;

function maybeConnectSocket(providedToken) {
  try {
    if (typeof io !== 'function') {
      // Socket.IO script not loaded
      return;
    }

    // Já existe ligação ativa
    if (socket && socketConnected) return;

    const token = providedToken || getStoredToken();
    if (!token) return;

    socket = io('/', {
      auth: { token },
      transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
      socketConnected = true;
      console.log('[Dashboard] Socket conectado');
    });

    socket.on('disconnect', (reason) => {
      socketConnected = false;
      console.log('[Dashboard] Socket desconectado:', reason);
    });

    socket.on('connect_error', (err) => {
      socketConnected = false;
      console.warn('[Dashboard] Erro na ligação Socket.IO:', err?.message || err);
    });

    socket.on('logs', () => {
      // Sempre que houver novos logs no servidor,
      // se estivermos na tab de Moderação + guild selecionada, recarregamos.
      const activeTab = document.querySelector('.tab.active')?.dataset.tab;
      const guildId = document.getElementById('guildPicker')?.value || '';
      if (activeTab === 'logs' && guildId) {
        loadLogs().catch((e) => console.error('Erro loadLogs (socket):', e));
      }
    });

    socket.on('gamenews_status', () => {
      const activeTab = document.querySelector('.tab.active')?.dataset.tab;
      if (activeTab === 'gamenews') {
        loadGameNewsStatus().catch((e) => console.error('Erro loadGameNewsStatus (socket):', e));
      }
    });
  } catch (err) {
    console.error('[Dashboard] maybeConnectSocket error:', err);
  }
}

// Traduções
const I18N = {
  pt: {
    // Topbar / layout
    app_subtitle: 'Painel de gestão e moderação',
    select_guild: 'Selecione um servidor',
    badge_bot_online: '● Bot online',

    // Tabs
    tab_overview: 'Visão geral',
    tab_logs: 'Moderação',
    tab_cases: 'Casos',
    tab_tickets: 'Tickets',
    tab_gamenews: 'GameNews',
    tab_user: 'Utilizadores',
    tab_config: 'Configuração',

    // Overview
    overview_title: 'Visão geral',
    overview_hint: 'Resumo de alto nível sobre o estado do bot, servidores ligados e atividade recente.',
    kpi_guilds: 'Servidores ligados',
    kpi_users: 'Utilizadores monitorizados',
    kpi_actions_24h: 'Ações de moderação (últimas 24h)',

    // Logs
    logs_title: 'Hub de moderação',
    logs_hint: 'Consulta centralizada de avisos, mutes, bans e restantes ações de moderação.',
    logs_search_placeholder: 'Procurar por utilizador, moderador ou detalhe do log',
    logs_filter_all: 'Todos os tipos',
    logs_reload: 'Recarregar',
    logs_empty: 'Não existem registos para o filtro atual.',
    logs_loading: 'A carregar logs…',
    logs_error_generic: 'Não foi possível carregar os logs.',
    logs_error_http: 'Erro ao carregar logs.',
    logs_user_label: 'Utilizador',
    logs_executor_label: 'Moderador',
    logs_timestamp_label: 'Data',

    // Cases
    cases_title: 'Casos',
    cases_hint: 'Visão consolidada das infrações de cada utilizador ao longo do tempo.',
    cases_empty: 'Ainda não existem casos registados para este servidor.',
    cases_loading: 'A carregar casos…',
    cases_error_generic: 'Não foi possível carregar os casos.',
    cases_error_http: 'Erro ao carregar casos.',

    // Tickets
    tickets_title: 'Tickets',
    tickets_hint: 'Gestão de pedidos de suporte e tickets abertos nos servidores configurados.',
    tickets_empty: 'Não foram encontrados tickets para o período selecionado.',
    tickets_loading: 'A carregar tickets…',
    tickets_error_generic: 'Não foi possível carregar os tickets.',
    tickets_error_http: 'Erro ao carregar tickets.',

    // GameNews
    gamenews_title: 'GameNews',
    gamenews_hint: 'Estado dos feeds de notícias, últimos envios e potenciais falhas na publicação.',
    gamenews_empty: 'Nenhum feed de GameNews se encontra configurado neste momento.',
    gamenews_loading: 'A carregar estado dos feeds…',
    gamenews_error_generic: 'Não foi possível carregar o estado dos feeds.',
    gamenews_error_http: 'Erro ao carregar GameNews.',

    // Users
    users_title: 'Utilizadores',
    users_hint: 'Consulta rápida de métricas e histórico de casos de cada utilizador.',
    users_empty: 'Selecione um servidor para ver utilizadores.',

    // Config
    config_title: 'Configuração do servidor',
    config_hint: 'Defina canais, cargos de staff e preferências de registo para este servidor.',
    config_empty: 'Em breve: integração direta com a API do OzarkBot para guardar estas definições.',

    // Mensagens auxiliares
    warn_select_guild: 'Selecione um servidor para aceder às restantes secções.',
  },
  en: {
    // Topbar / layout
    app_subtitle: 'Management and moderation panel',
    select_guild: 'Select a server',
    badge_bot_online: '● Bot online',

    // Tabs
    tab_overview: 'Overview',
    tab_logs: 'Moderation',
    tab_cases: 'Cases',
    tab_tickets: 'Tickets',
    tab_gamenews: 'GameNews',
    tab_user: 'Users',
    tab_config: 'Configuration',

    // Overview
    overview_title: 'Overview',
    overview_hint: 'High-level summary of bot status, connected servers and recent activity.',
    kpi_guilds: 'Connected servers',
    kpi_users: 'Monitored users',
    kpi_actions_24h: 'Moderation actions (last 24h)',

    // Logs
    logs_title: 'Moderation hub',
    logs_hint: 'Centralized view of warnings, mutes, bans and all moderation actions.',
    logs_search_placeholder: 'Search by user, moderator or log details',
    logs_filter_all: 'All types',
    logs_reload: 'Reload',
    logs_empty: 'No entries match the current filter.',
    logs_loading: 'Loading logs…',
    logs_error_generic: 'Could not load logs.',
    logs_error_http: 'Error loading logs.',
    logs_user_label: 'User',
    logs_executor_label: 'Moderator',
    logs_timestamp_label: 'Date',

    // Cases
    cases_title: 'Cases',
    cases_hint: 'Consolidated view of each user’s infractions over time.',
    cases_empty: 'No cases have been registered for this server yet.',
    cases_loading: 'Loading cases…',
    cases_error_generic: 'Could not load cases.',
    cases_error_http: 'Error loading cases.',

    // Tickets
    tickets_title: 'Tickets',
    tickets_hint: 'Manage support requests and open tickets across your configured guilds.',
    tickets_empty: 'No tickets were found for the selected period.',
    tickets_loading: 'Loading tickets…',
    tickets_error_generic: 'Could not load tickets.',
    tickets_error_http: 'Error loading tickets.',

    // GameNews
    gamenews_title: 'GameNews',
    gamenews_hint: 'Status of news feeds, recent posts and any delivery failures.',
    gamenews_empty: 'No GameNews feeds are configured at the moment.',
    gamenews_loading: 'Loading feed status…',
    gamenews_error_generic: 'Could not load feed status.',
    gamenews_error_http: 'Error loading GameNews.',

    // Users
    users_title: 'Users',
    users_hint: 'Quick lookup of metrics and case history for each user.',
    users_empty: 'Select a server to see users.',

    // Config
    config_title: 'Server configuration',
    config_hint: 'Define channels, staff roles and logging preferences for this server.',
    config_empty: 'Coming soon: direct integration with OzarkBot’s API to persist these settings.',

    // Misc
    warn_select_guild: 'Select a server to access the other sections.',
  },
};

// Helpers de tradução
function t(key) {
  const langObj = I18N[state.lang] || I18N.pt;
  return langObj[key] || key;
}

function applyTranslations() {
  // data-i18n
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (!key) return;
    el.textContent = t(key);
  });

  // placeholders
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (!key) return;
    const txt = t(key);
    if ('placeholder' in el) {
      el.placeholder = txt;
    }
  });
}

// Pequenos helpers
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setTab(name) {
  const sections = document.querySelectorAll('.section');
  const tabs = document.querySelectorAll('.tab');
  sections.forEach((s) => s.classList.remove('active'));
  tabs.forEach((t) => t.classList.remove('active'));

  const section = document.getElementById(`tab-${name}`);
  const tab = document.querySelector(`.tab[data-tab="${name}"]`);
  if (section) section.classList.add('active');
  if (tab) tab.classList.add('active');
}

function getStoredToken() {
  try {
    return localStorage.getItem(DASH_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

function setStoredToken(token) {
  try {
    localStorage.setItem(DASH_TOKEN_KEY, token);
  } catch {
    // ignore
  }
}

function ensureDashToken() {
  let jwt = getStoredToken();
  if (!jwt) {
    const msgPt = 'Introduz o token da dashboard (DASHBOARD_TOKEN do .env):';
    const msgEn = 'Enter the dashboard token (DASHBOARD_TOKEN from .env):';
    const ask = state.lang === 'en' ? msgEn : msgPt;

    const input = window.prompt(ask, '');
    if (input) {
      jwt = input.trim();
      if (jwt) {
        setStoredToken(jwt);
        // Assim que tivermos um token válido, tentamos ligar o Socket.IO
        maybeConnectSocket(jwt);
      }
    }
  } else {
    // Se já tivermos token guardado, garantimos que a ligação Socket.IO está criada
    maybeConnectSocket(jwt);
  }
  return jwt || null;
}

// Bloqueio de tabs sem guild
function updateTabsGuildLock() {
  const guildPicker = document.getElementById('guildPicker');
  const warning = document.getElementById('tabWarning');
  const hasGuild = !!(guildPicker && guildPicker.value);

  const needsGuild = ['logs', 'cases', 'tickets', 'gamenews', 'user', 'config'];

  // marcar tabs como "disabled"
  document.querySelectorAll('.tab').forEach((tab) => {
    const name = tab.dataset.tab;
    if (!name) return;
    if (needsGuild.includes(name)) {
      tab.classList.toggle('disabled', !hasGuild);
    }
  });

  // aviso
  if (!hasGuild) {
    if (warning) warning.classList.add('visible');

    // se estivermos numa tab que exige guild, volta para overview
    const active = document.querySelector('.tab.active');
    const activeName = active?.dataset.tab;
    if (activeName && needsGuild.includes(activeName)) {
      setTab('overview');
    }
  } else {
    if (warning) warning.classList.remove('visible');
  }
}

// ==== LOGS: ligação à API /api/logs ====

async function loadLogs(page = 1) {
  const guildPicker = document.getElementById('guildPicker');
  const listEl = document.getElementById('logsList');
  const typeEl = document.getElementById('logType');
  const searchEl = document.getElementById('logSearch');

  if (!listEl) return;

  const guildId = guildPicker?.value || '';
  if (!guildId) {
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('logs_empty'))}</div>`;
    return;
  }

  listEl.innerHTML = `<div class="empty">${escapeHtml(t('logs_loading'))}</div>`;

  const params = new URLSearchParams();
  params.set('guildId', guildId);
  params.set('page', String(page));
  params.set('limit', '50');

  if (typeEl && typeEl.value) params.set('type', typeEl.value);
  if (searchEl && searchEl.value) params.set('search', searchEl.value.trim());

  const headers = {};
  const jwt = getStoredToken();
  if (jwt) {
    headers['Authorization'] = `Bearer ${jwt}`;
    headers['x-dashboard-token'] = jwt;
  }

  let resp;
  try {
    resp = await fetch(`/api/logs?${params.toString()}`, { headers });
  } catch (err) {
    console.error('Erro ao chamar /api/logs:', err);
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('logs_error_generic'))}</div>`;
    return;
  }

  if (!resp.ok) {
    console.error('HTTP error /api/logs:', resp.status);

    if (resp.status === 401) {
      listEl.innerHTML = `<div class="empty">
        ${escapeHtml(t('logs_error_http'))} (401)<br><br>
        ${
          state.lang === 'en'
            ? 'Check if the dashboard token (DASHBOARD_TOKEN) is configured and correct.'
            : 'Verifica se o token da dashboard (DASHBOARD_TOKEN) está configurado e correto.'
        }
      </div>`;
    } else {
      listEl.innerHTML = `<div class="empty">${escapeHtml(t('logs_error_http'))} (${resp.status})</div>`;
    }
    return;
  }

  let data;
  try {
    data = await resp.json();
  } catch (err) {
    console.error('Erro a fazer parse do JSON de /api/logs:', err);
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('logs_error_generic'))}</div>`;
    return;
  }

  if (!data || !Array.isArray(data.items) || data.items.length === 0) {
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('logs_empty'))}</div>`;
    return;
  }

  const html = data.items
    .map((log) => {
      const title = log.title || 'Log';
      const user = log.user?.tag || log.user?.id || t('logs_user_label');
      const executor = log.executor?.tag || log.executor?.id || t('logs_executor_label');
      const time = log.time || log.createdAt || '';

      return `
        <div class="list-item">
          <div class="list-item-main">
            <strong>${escapeHtml(title)}</strong>
            <div class="meta">
              <span>${escapeHtml(t('logs_user_label'))}: ${escapeHtml(user)}</span>
              <span>${escapeHtml(t('logs_executor_label'))}: ${escapeHtml(executor)}</span>
              <span>${escapeHtml(t('logs_timestamp_label'))}: ${escapeHtml(time)}</span>
            </div>
          </div>
          ${
            log.description
              ? `<div class="list-item-body">${escapeHtml(log.description)}</div>`
              : ''
          }
        </div>
      `;
    })
    .join('');

  listEl.innerHTML = html;
}

// ==== CASES: ligação à API /api/cases ====

async function loadCases(page = 1) {
  const guildPicker = document.getElementById('guildPicker');
  const listEl = document.getElementById('casesList');
  const searchEl = document.getElementById('casesSearch');

  if (!listEl) return;

  const guildId = guildPicker?.value || '';
  if (!guildId) {
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('cases_empty'))}</div>`;
    return;
  }

  listEl.innerHTML = `<div class="empty">${escapeHtml(t('cases_loading'))}</div>`;

  const params = new URLSearchParams();
  params.set('guildId', guildId);
  params.set('page', String(page));
  params.set('limit', '25');

  if (searchEl && searchEl.value) params.set('q', searchEl.value.trim());

  const headers = {};
  const jwt = getStoredToken();
  if (jwt) {
    headers['Authorization'] = `Bearer ${jwt}`;
    headers['x-dashboard-token'] = jwt;
  }

  let resp;
  try {
    resp = await fetch(`/api/cases?${params.toString()}`, { headers });
  } catch (err) {
    console.error('Erro ao chamar /api/cases:', err);
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('cases_error_generic'))}</div>`;
    return;
  }

  if (!resp.ok) {
    console.error('HTTP error /api/cases:', resp.status);

    if (resp.status === 401) {
      listEl.innerHTML = `<div class="empty">
        ${escapeHtml(t('cases_error_http'))} (401)<br><br>
        ${
          state.lang === 'en'
            ? 'Check if the dashboard token (DASHBOARD_TOKEN) is configured and correct.'
            : 'Verifica se o token da dashboard (DASHBOARD_TOKEN) está configurado e correto.'
        }
      </div>`;
    } else {
      listEl.innerHTML = `<div class="empty">${escapeHtml(t('cases_error_http'))} (${resp.status})</div>`;
    }
    return;
  }

  let data;
  try {
    data = await resp.json();
  } catch (err) {
    console.error('Erro a fazer parse do JSON de /api/cases:', err);
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('cases_error_generic'))}</div>`;
    return;
  }

  if (!data || !Array.isArray(data.items) || data.items.length === 0) {
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('cases_empty'))}</div>`;
    return;
  }

  const html = data.items
    .map((c) => {
      const id = c.caseId || c._id || '—';
      const user = c.userTag || c.userId || '—';
      const mod = c.moderatorTag || c.moderatorId || '—';
      const type = c.type || '—';
      const reason = c.reason || '';
      const createdAt = c.createdAt || '';

      return `
        <div class="list-item">
          <div class="list-item-main">
            <strong>#${escapeHtml(String(id))}</strong> — ${escapeHtml(type)}
            <div class="meta">
              <span>Utilizador: ${escapeHtml(user)}</span>
              <span>Moderador: ${escapeHtml(mod)}</span>
              <span>Data: ${escapeHtml(createdAt)}</span>
            </div>
          </div>
          ${
            reason
              ? `<div class="list-item-body">${escapeHtml(reason)}</div>`
              : ''
          }
        </div>
      `;
    })
    .join('');

  listEl.innerHTML = html;
}

// ==== Tickets: ligação à API /api/tickets ====

async function loadTickets(page = 1) {
  const guildPicker = document.getElementById('guildPicker');
  const listEl = document.getElementById('ticketsList');

  if (!listEl) return;

  const guildId = guildPicker?.value || '';
  if (!guildId) {
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('tickets_empty'))}</div>`;
    return;
  }

  listEl.innerHTML = `<div class="empty">${escapeHtml(t('tickets_loading'))}</div>`;

  const params = new URLSearchParams();
  params.set('guildId', guildId);
  params.set('page', String(page));
  params.set('limit', '25');

  const headers = {};
  const jwt = getStoredToken();
  if (jwt) {
    headers['Authorization'] = `Bearer ${jwt}`;
    headers['x-dashboard-token'] = jwt;
  }

  let resp;
  try {
    resp = await fetch(`/api/tickets?${params.toString()}`, { headers });
  } catch (err) {
    console.error('Erro ao chamar /api/tickets:', err);
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('tickets_error_generic'))}</div>`;
    return;
  }

  if (!resp.ok) {
    console.error('HTTP error /api/tickets:', resp.status);

    if (resp.status === 401) {
      listEl.innerHTML = `<div class="empty">
        ${escapeHtml(t('tickets_error_http'))} (401)<br><br>
        ${
          state.lang === 'en'
            ? 'Check if the dashboard token (DASHBOARD_TOKEN) is configured and correct.'
            : 'Verifica se o token da dashboard (DASHBOARD_TOKEN) está configurado e correto.'
        }
      </div>`;
    } else {
      listEl.innerHTML = `<div class="empty">${escapeHtml(t('tickets_error_http'))} (${resp.status})</div>`;
    }
    return;
  }

  let data;
  try {
    data = await resp.json();
  } catch (err) {
    console.error('Erro a fazer parse do JSON de /api/tickets:', err);
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('tickets_error_generic'))}</div>`;
    return;
  }

  if (!data || !Array.isArray(data.items) || data.items.length === 0) {
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('tickets_empty'))}</div>`;
    return;
  }

  const html = data.items
    .map((tkt) => {
      const userId = tkt.userId || tkt.createdById || '—';
      const channelId = tkt.channelId || '—';
      const status = tkt.status || 'OPEN';
      const createdAt = tkt.createdAt || '';
      const closedAt = tkt.closedAt || null;
      const subject = tkt.subject || tkt.topic || '';
      const lastMsgAt = tkt.lastMessageAt || '';

      return `
        <div class="card">
          <div class="row gap" style="justify-content: space-between; align-items:flex-start;">
            <div>
              <strong>${escapeHtml(subject || `Ticket de ${userId}`)}</strong>
              <div class="hint">
                Utilizador: ${escapeHtml(userId)}<br>
                Canal: ${escapeHtml(channelId)}
              </div>
            </div>
            <div style="text-align:right; font-size:11px; color:var(--text-muted);">
              <div>Status: ${escapeHtml(status)}</div>
              ${createdAt ? `<div>Criado em: ${escapeHtml(createdAt)}</div>` : ''}
              ${closedAt ? `<div>Fechado em: ${escapeHtml(closedAt)}</div>` : ''}
              ${lastMsgAt ? `<div>Última msg: ${escapeHtml(lastMsgAt)}</div>` : ''}
            </div>
          </div>
        </div>
      `;
    })
    .join('');

  listEl.innerHTML = html;
}

// ==== GameNews: ligação à API /api/gamenews-status ====

async function loadGameNewsStatus() {
  const listEl = document.getElementById('gamenewsList');
  if (!listEl) return;

  listEl.innerHTML = `<div class="empty">${escapeHtml(t('gamenews_loading'))}</div>`;

  const headers = {};
  const jwt = getStoredToken();
  if (jwt) {
    headers['Authorization'] = `Bearer ${jwt}`;
    headers['x-dashboard-token'] = jwt;
  }

  let resp;
  try {
    resp = await fetch('/api/gamenews-status', { headers });
  } catch (err) {
    console.error('Erro ao chamar /api/gamenews-status:', err);
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('gamenews_error_generic'))}</div>`;
    return;
  }

  if (!resp.ok) {
    console.error('HTTP error /api/gamenews-status:', resp.status);

    if (resp.status === 401) {
      listEl.innerHTML = `<div class="empty">
        ${escapeHtml(t('gamenews_error_http'))} (401)<br><br>
        ${
          state.lang === 'en'
            ? 'Check if the dashboard token (DASHBOARD_TOKEN) is configured and correct.'
            : 'Verifica se o token da dashboard (DASHBOARD_TOKEN) está configurado e correto.'
        }
      </div>`;
    } else {
      listEl.innerHTML = `<div class="empty">${escapeHtml(t('gamenews_error_http'))} (${resp.status})</div>`;
    }
    return;
  }

  let data;
  try {
    data = await resp.json();
  } catch (err) {
    console.error('Erro a fazer parse do JSON de /api/gamenews-status:', err);
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('gamenews_error_generic'))}</div>`;
    return;
  }

  const items = Array.isArray(data.items) ? data.items : [];
  if (!items.length) {
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('gamenews_empty'))}</div>`;
    return;
  }

  const html = items
    .map((feed) => {
      const src = feed.source || feed.feedName || 'Feed';
      const url = feed.feedUrl || '';
      const channelId = feed.channelId || '—';
      const enabled = feed.enabled !== false;
      const lastSent = feed.lastSentAt ? String(feed.lastSentAt) : '—';
      const fails = feed.failCount ?? 0;

      return `
        <div class="list-item">
          <div class="list-item-main">
            <strong>${escapeHtml(src)}</strong>
            <div class="meta">
              <span>URL: ${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(url)}</a>` : '—'}</span>
              <span>Canal: ${escapeHtml(channelId)}</span>
              <span>Ativo: ${enabled ? 'Sim' : 'Não'}</span>
              <span>Falhas: ${escapeHtml(String(fails))}</span>
              <span>Último envio: ${escapeHtml(lastSent)}</span>
            </div>
          </div>
        </div>
      `;
    })
    .join('');

  listEl.innerHTML = html;
}

// Bootstrap da UI
document.addEventListener('DOMContentLoaded', () => {
  // idioma inicial
  const saved = (localStorage.getItem('OZARK_LANG_SIMPLE') || 'pt').toLowerCase();
  state.lang = saved;
  // Tenta logo ligar o Socket.IO com token guardado (se existir)
  maybeConnectSocket();
  const lp = document.getElementById('langPicker');
  if (lp) {
    lp.value = state.lang;
  }
  applyTranslations();

  const guildPicker = document.getElementById('guildPicker');
  if (guildPicker) {
    guildPicker.addEventListener('change', () => {
      updateTabsGuildLock();
    });
  }
  updateTabsGuildLock();

  // troca de idioma
  if (lp) {
    lp.addEventListener('change', () => {
      const val = lp.value === 'en' ? 'en' : 'pt';
      state.lang = val;
      try {
        localStorage.setItem('OZARK_LANG_SIMPLE', val);
      } catch {
        // ignore
      }
      applyTranslations();
    });
  }

  // Click nas tabs
  const protectedTabs = ['logs', 'cases', 'tickets', 'gamenews', 'user', 'config'];

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const name = tab.dataset.tab;
      if (!name) return;

      // 1) Bloqueio por guild
      const guildId = guildPicker?.value || '';
      if (!guildId && protectedTabs.includes(name)) {
        updateTabsGuildLock();
        return;
      }

      // 2) Bloqueio por token (auth)
      if (protectedTabs.includes(name)) {
        const existing = getStoredToken();
        const jwt = existing || ensureDashToken();
        if (!jwt) {
          // Cancelou o prompt → não muda de tab
          return;
        }
      }

      // 3) Ativar tab
      setTab(name);

      // 4) Lazy load consoante a tab
      if (name === 'logs') {
        loadLogs().catch((err) => console.error('Erro loadLogs:', err));
      }
      if (name === 'cases') {
        loadCases().catch((err) => console.error('Erro loadCases:', err));
      }
      if (name === 'tickets') {
        loadTickets().catch((err) => console.error('Erro loadTickets:', err));
      }
      if (name === 'gamenews') {
        loadGameNewsStatus().catch((err) => console.error('Erro loadGameNewsStatus:', err));
      }
    });
  });

  // Botão de recarregar logs
  const btnReloadLogs = document.getElementById('btnReloadLogs');
  if (btnReloadLogs) {
    btnReloadLogs.addEventListener('click', () => {
      loadLogs().catch((err) => console.error('Erro loadLogs (btn):', err));
    });
  }

  // Enter no campo de pesquisa dispara reload
  const searchEl = document.getElementById('logSearch');
  if (searchEl) {
    searchEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        loadLogs().catch((err) => console.error('Erro loadLogs (enter search):', err));
      }
    });
  }
});
