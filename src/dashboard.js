// Estado simples
const state = {
  lang: 'pt',
  guildChannelsCache: {}, // guildId -> canais
};


// Simple toast helper
function toast(message) {
  try {
    if (!message) return;
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.style.position = 'fixed';
      container.style.bottom = '1.5rem';
      container.style.right = '1.5rem';
      container.style.zIndex = '9999';
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.gap = '0.5rem';
      document.body.appendChild(container);
    }

    const el = document.createElement('div');
    el.textContent = message;
    el.style.background = 'rgba(0, 0, 0, 0.85)';
    el.style.color = '#fff';
    el.style.padding = '0.5rem 0.75rem';
    el.style.borderRadius = '4px';
    el.style.fontSize = '0.85rem';
    el.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.35)';
    el.style.opacity = '0';
    el.style.transform = 'translateY(10px)';
    el.style.transition = 'opacity 150ms ease-out, transform 150ms ease-out';

    container.appendChild(el);

    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(10px)';
      setTimeout(() => {
        el.remove();
        if (!container.children.length) {
          container.remove();
        }
      }, 200);
    }, 3000);
  } catch (e) {
    console.error('toast error:', e);
  }
}

const DASH_TOKEN_KEY = 'DASHBOARD_TOKEN';

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

    gamenews_editor_title: 'Configuração de feeds',
    gamenews_editor_hint: 'Adiciona, edita ou remove feeds e escolhe o canal onde as notícias serão enviadas.',
    gamenews_add_feed: 'Adicionar feed',
    gamenews_save_feeds: 'Guardar alterações',
    gamenews_feeds_loading: 'A carregar configuração de feeds…',
    gamenews_feeds_empty: 'Ainda não existem feeds configurados. Adiciona o primeiro feed para começar.',
    gamenews_feeds_error_generic: 'Não foi possível carregar a configuração de feeds.',
    gamenews_feeds_error_http: 'Erro ao carregar os feeds de GameNews.',

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
    language_changed: 'Idioma alterado.',
  },

  en: {
    // Topbar / layout
    app_subtitle: 'Moderation and management dashboard',
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
    overview_hint: 'High-level summary of bot status, connected guilds and recent activity.',
    kpi_guilds: 'Connected guilds',
    kpi_users: 'Monitored users',
    kpi_actions_24h: 'Moderation actions (last 24h)',

    // Logs
    logs_title: 'Moderation hub',
    logs_hint: 'Central place to review warns, mutes, bans and other moderation events.',
    logs_search_placeholder: 'Search by user, moderator or log details',
    logs_filter_all: 'All types',
    logs_reload: 'Reload',
    logs_empty: 'There are no records matching the current filter.',
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

    gamenews_editor_title: 'Feeds configuration',
    gamenews_editor_hint: 'Add, edit or remove feeds and choose which channel will receive each feed.',
    gamenews_add_feed: 'Add feed',
    gamenews_save_feeds: 'Save changes',
    gamenews_feeds_loading: 'Loading feed configuration…',
    gamenews_feeds_empty: 'No feeds have been configured yet. Add your first feed to get started.',
    gamenews_feeds_error_generic: 'Could not load feed configuration.',
    gamenews_feeds_error_http: 'Error loading GameNews feeds.',

    // Users
    users_title: 'Users',
    users_hint: 'Quick access to metrics, case history and actions applied per user.',
    users_empty: 'Select a server to list and analyse its users.',

    // Config
    config_title: 'Server configuration',
    config_hint: 'Configure channels, staff roles and logging preferences for this server.',
    config_empty: 'Coming soon: direct integration with the OzarkBot API to persist these settings.',

    // Helper messages
    warn_select_guild: 'Select a server to access the other sections.',
    language_changed: 'Language updated.',
  },
};

// Helpers
function t(key) {
  const lang = I18N[state.lang] ? state.lang : 'pt';
  return I18N[lang][key] ?? I18N.pt[key] ?? key;
}

function applyI18n() {
  document.documentElement.lang = state.lang;

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const k = el.getAttribute('data-i18n');
    if (!k) return;
    el.textContent = t(k);
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const k = el.getAttribute('data-i18n-placeholder');
    if (!k) return;
    el.setAttribute('placeholder', t(k));
  });

  const warn = document.getElementById('tabWarning');
  if (warn) warn.textContent = t('warn_select_guild');
}

function setLang(newLang) {
  state.lang = (newLang || 'pt').toLowerCase();
  try {
    localStorage.setItem('OZARK_LANG_SIMPLE', state.lang);
  } catch {}

  const lp = document.getElementById('langPicker');
  if (lp) lp.value = state.lang;

  applyI18n();
}

// ==== TOKEN DASHBOARD (DASHBOARD_TOKEN) ====

// Lê token, migrando da key antiga se existir
function getStoredToken() {
  let jwt = null;

  try {
    jwt = localStorage.getItem(DASH_TOKEN_KEY);
    if (!jwt) {
      const legacy = localStorage.getItem('OZARK_DASH_JWT');
      if (legacy) {
        jwt = legacy;
        localStorage.setItem(DASH_TOKEN_KEY, legacy);
        localStorage.removeItem('OZARK_DASH_JWT');
      }
    }
  } catch {
    jwt = null;
  }

  return jwt || null;
}

function setStoredToken(jwt) {
  try {
    if (!jwt) {
      localStorage.removeItem(DASH_TOKEN_KEY);
    } else {
      localStorage.setItem(DASH_TOKEN_KEY, jwt);
    }
  } catch {
    // ignore
  }
}

// Pede e guarda o token da dashboard (DASHBOARD_TOKEN)
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
      }
    }
  }
  return jwt || null;
}

function getAuthHeaders() {
  const headers = {};
  const jwt = ensureDashToken();
  if (jwt) {
    headers['Authorization'] = `Bearer ${jwt}`;
    headers['x-dashboard-token'] = jwt;
  }
  return headers;
}

// Sanitização simples de texto para evitar XSS
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

// Tabs
function setTab(name) {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.tab === name);
  });

  document.querySelectorAll('.section').forEach((sec) => {
    sec.classList.toggle('active', sec.id === `tab-${name}`);
  });
}

// Bloqueio de tabs sem servidor (versão simples + garantida)
function updateTabAccess() {
  const guildPicker = document.getElementById('guildPicker');
  const warning = document.getElementById('tabWarning');
  const needsGuild = ['logs', 'cases', 'tickets', 'gamenews', 'user', 'config'];

  const currentGuild = guildPicker?.value || '';
  const hasGuild = !!currentGuild;

  // marcar/desmarcar tabs visualmente
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

// Carrega lista de servidores reais a partir da API
async function loadGuilds() {
  const guildPicker = document.getElementById('guildPicker');
  if (!guildPicker) return;

  const headers = getAuthHeaders();

  let resp;
  try {
    resp = await fetch('/api/guilds', { headers });
  } catch (err) {
    console.error('Erro ao chamar /api/guilds:', err);
    updateTabAccess();
    return;
  }

  if (!resp.ok) {
    console.error('HTTP error /api/guilds:', resp.status);
    updateTabAccess();
    return;
  }

  let data;
  try {
    data = await resp.json();
  } catch (err) {
    console.error('Erro a ler JSON de /api/guilds:', err);
    updateTabAccess();
    return;
  }

  const items = Array.isArray(data.items) ? data.items : [];

  // Limpa opções atuais (mantém placeholder)
  const placeholder = guildPicker.querySelector('option[value=""]');
  guildPicker.innerHTML = '';
  if (placeholder) {
    guildPicker.appendChild(placeholder);
  } else {
    const opt = document.createElement('option');
    opt.value = '';
    opt.setAttribute('data-i18n', 'select_guild');
    opt.textContent = t('select_guild');
    guildPicker.appendChild(opt);
  }

  items.forEach((g) => {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = g.name;
    guildPicker.appendChild(opt);
  });

  updateTabAccess();
}

// ==== LOGS: ligação à API /api/logs ====

async function loadLogs(page = 1) {
  const guildPicker = document.getElementById('guildPicker');
  const listEl = document.getElementById('logsList');
  const typeEl = document.getElementById('logType');
  const searchEl = document.getElementById('logSearch');

  if (!listEl) return;

  const guildId = guildPicker?.value || '';
  const type = typeEl?.value || '';
  const search = searchEl?.value || '';

  if (!guildId) {
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('warn_select_guild'))}</div>`;
    return;
  }

  // Estado de loading
  listEl.innerHTML = `<div class="empty">${escapeHtml(t('logs_loading'))}</div>`;

  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', '20');
  params.set('guildId', guildId);
  if (type) params.set('type', type);
  if (search) params.set('search', search);

  const headers = getAuthHeaders();

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
    console.error('Erro a ler JSON de /api/logs:', err);
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('logs_error_generic'))}</div>`;
    return;
  }

  const items = data.items || [];

  if (!items.length) {
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('logs_empty'))}</div>`;
    return;
  }

  const html = items
    .map((item) => {
      const title = item.title || item.type || '';
      const userTag = item.user?.tag || item.userId || '—';
      const execTag = item.executor?.tag || item.moderatorId || '—';
      const time = item.time || item.createdAt || '';
      const description = item.description || item.reason || '';
      return `
        <div class="card">
          <div class="row gap" style="justify-content: space-between; align-items:flex-start;">
            <div>
              <strong>${escapeHtml(title)}</strong>
              ${
                description
                  ? `<div class="hint">${escapeHtml(description)}</div>`
                  : ''
              }
            </div>
            <div style="text-align:right; font-size:11px; color:var(--text-muted);">
              <div>${escapeHtml(t('logs_user_label'))}: ${escapeHtml(userTag)}</div>
              <div>${escapeHtml(t('logs_executor_label'))}: ${escapeHtml(execTag)}</div>
              <div>${escapeHtml(t('logs_timestamp_label'))}: ${escapeHtml(time)}</div>
            </div>
          </div>
        </div>
      `;
    })
    .join('');

  listEl.innerHTML = html;
}

// ==== CASES: ligação a /api/cases ====

async function loadCases(page = 1) {
  const guildPicker = document.getElementById('guildPicker');
  const listEl = document.getElementById('casesList') || document.querySelector('#tab-cases .list');

  if (!listEl) return;

  const guildId = guildPicker?.value || '';
  if (!guildId) {
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('warn_select_guild'))}</div>`;
    return;
  }

  listEl.innerHTML = `<div class="empty">${escapeHtml(t('cases_loading'))}</div>`;

  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', '20');
  params.set('guildId', guildId);

  const headers = getAuthHeaders();

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
    console.error('Erro a ler JSON de /api/cases:', err);
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('cases_error_generic'))}</div>`;
    return;
  }

  const items = data.items || [];

  if (!items.length) {
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('cases_empty'))}</div>`;
    return;
  }

  const html = items
    .map((c) => {
      const user = c.userId || '—';
      const type = c.type || '';
      const caseId = c.caseId != null ? `#${c.caseId}` : '';
      const reason = c.reason || '';
      const createdAt = c.createdAt || '';
      return `
        <div class="card">
          <div class="row gap" style="justify-content: space-between; align-items:flex-start;">
            <div>
              <strong>${escapeHtml(user)}</strong>
              ${
                reason
                  ? `<div class="hint">${escapeHtml(reason)}</div>`
                  : ''
              }
            </div>
            <div style="text-align:right; font-size:11px; color:var(--text-muted);">
              ${caseId ? `<div>Case: ${escapeHtml(caseId)}</div>` : ''}
              ${type ? `<div>Tipo: ${escapeHtml(type)}</div>` : ''}
              ${createdAt ? `<div>Criado em: ${escapeHtml(createdAt)}</div>` : ''}
            </div>
          </div>
        </div>
      `;
    })
    .join('');

  listEl.innerHTML = html;
}

// ==== TICKETS: ligação a /api/tickets ====

async function loadTickets(page = 1) {
  const guildPicker = document.getElementById('guildPicker');
  const listEl = document.querySelector('#tab-tickets .list');

  if (!listEl) return;

  const guildId = guildPicker?.value || '';
  if (!guildId) {
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('warn_select_guild'))}</div>`;
    return;
  }

  listEl.innerHTML = `<div class="empty">${escapeHtml(t('tickets_loading'))}</div>`;

  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', '20');
  params.set('guildId', guildId);
  // Opcionalmente poderíamos passar status/userId no futuro

  const headers = getAuthHeaders();

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
    console.error('Erro a ler JSON de /api/tickets:', err);
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('tickets_error_generic'))}</div>`;
    return;
  }

  const items = data.items || [];

  if (!items.length) {
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('tickets_empty'))}</div>`;
    return;
  }

  
  const html = items
    .map((tkt) => {
      const ticketId = tkt._id || tkt.id || '';
      const userId = tkt.userId || tkt.createdById || '—';
      const channelId = tkt.channelId || '—';
      const status = tkt.status || 'OPEN';
      const createdAt = tkt.createdAt || '';
      const closedAt = tkt.closedAt || null;
      const subject = tkt.subject || tkt.topic || '';
      const lastMsgAt = tkt.lastMessageAt || '';

      return `
        <div class="card ticket-row" data-ticket-id="${ticketId}">
          <div class="row gap" style="justify-content: space-between; align-items:flex-start;">
            <div>
              <strong>${escapeHtml(subject || (state.lang === 'en' ? `Ticket from ${userId}` : `Ticket de ${userId}`))}</strong>
              <div class="hint">
                ${state.lang === 'en' ? 'User' : 'Utilizador'}: ${escapeHtml(userId)}<br>
                ${state.lang === 'en' ? 'Channel' : 'Canal'}: ${escapeHtml(channelId)}
              </div>
            </div>
            <div style="text-align:right; font-size:11px; color:var(--text-muted);">
              <div>Status: ${escapeHtml(status)}</div>
              ${createdAt ? `<div>${state.lang === 'en' ? 'Created at' : 'Criado em'}: ${escapeHtml(createdAt)}</div>` : ''}
              ${closedAt ? `<div>${state.lang === 'en' ? 'Closed at' : 'Fechado em'}: ${escapeHtml(closedAt)}</div>` : ''}
              ${lastMsgAt ? `<div>${state.lang === 'en' ? 'Last message' : 'Última msg'}: ${escapeHtml(lastMsgAt)}</div>` : ''}
            </div>
          </div>
          <div class="row gap" style="margin-top:8px; justify-content:flex-end;">
            <button type="button" class="btn small" data-action="reply">
              ${escapeHtml(t('tickets_btn_reply') || (state.lang === 'en' ? 'Reply' : 'Responder'))}
            </button>
            <button type="button" class="btn small danger" data-action="close">
              ${escapeHtml(t('tickets_btn_close') || (state.lang === 'en' ? 'Close ticket' : 'Fechar ticket'))}
            </button>
          </div>
        </div>
      `;
    })
    .join('');

  listEl.innerHTML = html;

  // Liga eventos de Responder / Fechar
  listEl.querySelectorAll('.ticket-row').forEach((row) => {
    const ticketId = row.getAttribute('data-ticket-id') || '';
    if (!ticketId) return;

    const replyBtn = row.querySelector('button[data-action="reply"]');
    const closeBtn = row.querySelector('button[data-action="close"]');

    if (replyBtn) {
      replyBtn.addEventListener('click', async () => {
        const guildId = guildPicker?.value || '';
        if (!guildId) return;

        const promptMsg = state.lang === 'en'
          ? 'Reply to this ticket:'
          : 'Resposta para este ticket:';

        const content = window.prompt(promptMsg, '');
        if (!content || !content.trim()) return;

        const headers = getAuthHeaders();
        headers['Content-Type'] = 'application/json';

        try {
          const resp = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}/reply`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ guildId, content: content.trim() })
          });

          if (!resp.ok) {
            console.error('HTTP error /api/tickets/:ticketId/reply:', resp.status);
            toast(
              state.lang === 'en'
                ? 'Failed to send reply.'
                : 'Falha ao enviar resposta.'
            );
            return;
          }

          toast(
            state.lang === 'en'
              ? 'Reply sent.'
              : 'Resposta enviada.'
          );
          loadTickets().catch((err) => console.error('Erro loadTickets (after reply):', err));
        } catch (err) {
          console.error('Erro /api/tickets/:ticketId/reply:', err);
          toast(
            state.lang === 'en'
              ? 'Failed to send reply.'
              : 'Falha ao enviar resposta.'
          );
        }
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', async () => {
        const guildId = guildPicker?.value || '';
        if (!guildId) return;

        const confirmMsg = state.lang === 'en'
          ? 'Close this ticket? The channel will be updated on Discord.'
          : 'Fechar este ticket? O canal será atualizado no Discord.';

        const confirmed = window.confirm(confirmMsg);
        if (!confirmed) return;

        const headers = getAuthHeaders();
        headers['Content-Type'] = 'application/json';

        try {
          const resp = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}/close`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ guildId })
          });

          if (!resp.ok) {
            console.error('HTTP error /api/tickets/:ticketId/close:', resp.status);
            toast(
              state.lang === 'en'
                ? 'Failed to close ticket.'
                : 'Falha ao fechar o ticket.'
            );
            return;
          }

          toast(
            state.lang === 'en'
              ? 'Ticket closed.'
              : 'Ticket fechado.'
          );
          loadTickets().catch((err) => console.error('Erro loadTickets (after close):', err));
        } catch (err) {
          console.error('Erro /api/tickets/:ticketId/close:', err);
          toast(
            state.lang === 'en'
              ? 'Failed to close ticket.'
              : 'Falha ao fechar o ticket.'
          );
        }
      });
    }
  });

}

// ==== GAMENEWS: estado (/api/gamenews-status) ====

async function loadGameNewsStatus() {
  const listEl = document.getElementById('gamenewsStatusList');
  if (!listEl) return;

  listEl.innerHTML = `<div class="empty">${escapeHtml(t('gamenews_loading'))}</div>`;

  const headers = getAuthHeaders();

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
    console.error('Erro a ler JSON de /api/gamenews-status:', err);
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('gamenews_error_generic'))}</div>`;
    return;
  }

  const items = data.items || [];

  if (!items.length) {
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('gamenews_empty'))}</div>`;
    return;
  }

  const html = items
    .map((feed) => {
      const name = feed.feedName || feed.source || 'Feed';
      const url = feed.feedUrl || '';
      const channelId = feed.channelId || '—';
      const enabled = feed.enabled !== false;
      const failCount = feed.failCount ?? 0;
      const lastSentAt = feed.lastSentAt || '';
      const lastHashesCount = feed.lastHashesCount ?? 0;
      const pausedUntil = feed.pausedUntil || null;

      return `
        <div class="card">
          <div class="row gap" style="justify-content: space-between; align-items:flex-start;">
            <div>
              <strong>${escapeHtml(name)}</strong>
              <div class="hint">
                ${url ? `Feed: ${escapeHtml(url)}<br>` : ''}
                Canal: ${escapeHtml(channelId)}
              </div>
            </div>
            <div style="text-align:right; font-size:11px; color:var(--text-muted);">
              <div>Ativo: ${enabled ? 'Sim' : 'Não'}</div>
              <div>Falhas: ${escapeHtml(failCount)}</div>
              <div>Último envio: ${escapeHtml(lastSentAt || '—')}</div>
              <div>Hashes recentes: ${escapeHtml(lastHashesCount)}</div>
              ${pausedUntil ? `<div>Pausado até: ${escapeHtml(pausedUntil)}</div>` : ''}
            </div>
          </div>
        </div>
      `;
    })
    .join('');

  listEl.innerHTML = html;
}

// ==== GAMENEWS: editor de feeds (/api/gamenews/feeds) ====

async function fetchGuildChannelsForGameNews(guildId) {
  if (!guildId) return [];

  if (state.guildChannelsCache[guildId]) {
    return state.guildChannelsCache[guildId];
  }

  const headers = getAuthHeaders();

  let resp;
  try {
    resp = await fetch(`/api/guilds/${encodeURIComponent(guildId)}/channels`, { headers });
  } catch (err) {
    console.error('Erro ao chamar /api/guilds/:guildId/channels:', err);
    return [];
  }

  if (!resp.ok) {
    console.error('HTTP error /api/guilds/:guildId/channels:', resp.status);
    return [];
  }

  let data;
  try {
    data = await resp.json();
  } catch (err) {
    console.error('Erro a ler JSON de /api/guilds/:guildId/channels:', err);
    return [];
  }

  const items = Array.isArray(data.items) ? data.items : [];
  state.guildChannelsCache[guildId] = items;
  return items;
}

async function loadGameNewsFeedsEditor() {
  const listEl = document.getElementById('gamenewsFeedsList');
  if (!listEl) return;

  const guildPicker = document.getElementById('guildPicker');
  const guildId = guildPicker?.value || '';

  if (!guildId) {
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('warn_select_guild'))}</div>`;
    return;
  }

  listEl.innerHTML = `<div class="empty">${escapeHtml(t('gamenews_feeds_loading'))}</div>`;

  const headers = getAuthHeaders();
  headers['Content-Type'] = 'application/json';

  let resp;
  try {
    resp = await fetch('/api/gamenews/feeds', { headers });
  } catch (err) {
    console.error('Erro ao chamar /api/gamenews/feeds:', err);
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('gamenews_feeds_error_generic'))}</div>`;
    return;
  }

  if (!resp.ok) {
    console.error('HTTP error /api/gamenews/feeds:', resp.status);

    if (resp.status === 401) {
      listEl.innerHTML = `<div class="empty">
        ${escapeHtml(t('gamenews_feeds_error_http'))} (401)<br><br>
        ${
          state.lang === 'en'
            ? 'Check if the dashboard token (DASHBOARD_TOKEN) is configured and correct.'
            : 'Verifica se o token da dashboard (DASHBOARD_TOKEN) está configurado e correto.'
        }
      </div>`;
    } else {
      listEl.innerHTML = `<div class="empty">${escapeHtml(t('gamenews_feeds_error_http'))} (${resp.status})</div>`;
    }
    return;
  }

  let data;
  try {
    data = await resp.json();
  } catch (err) {
    console.error('Erro a ler JSON de /api/gamenews/feeds:', err);
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('gamenews_feeds_error_generic'))}</div>`;
    return;
  }

  const items = Array.isArray(data.items) ? data.items : [];
  const channels = await fetchGuildChannelsForGameNews(guildId);

  if (!items.length) {
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('gamenews_feeds_empty'))}</div>`;
    return;
  }

  const html = items
    .map((feed, idx) => {
      const name = feed.name || 'Feed';
      const url = feed.feedUrl || '';
      const channelId = feed.channelId || '';
      const enabled = feed.enabled !== false;
      const intervalMs = typeof feed.intervalMs === 'number' ? feed.intervalMs : null;
      const intervalMinutes = intervalMs ? Math.round(intervalMs / 60000) : '';

      const channelOptions = [
        `<option value="">${escapeHtml(state.lang === 'en' ? 'Select a channel' : 'Selecione um canal')}</option>`,
        ...channels.map(
          (ch) => `<option value="${escapeHtml(ch.id)}"${ch.id === channelId ? ' selected' : ''}># ${escapeHtml(ch.name)}</option>`
        ),
      ].join('');

      return `
        <div class="card gamenews-feed-row" data-index="${idx}">
          <div class="row gap">
            <div class="col">
              <label>${escapeHtml(state.lang === 'en' ? 'Name' : 'Nome')}</label>
              <input class="input gn-name" value="${escapeHtml(name)}" />
            </div>
            <div class="col">
              <label>Feed URL</label>
              <input class="input gn-url" value="${escapeHtml(url)}" />
            </div>
          </div>
          <div class="row gap" style="margin-top:8px; align-items:flex-end;">
            <div class="col">
              <label>${escapeHtml(state.lang === 'en' ? 'Channel' : 'Canal')}</label>
              <select class="select gn-channel">
                ${channelOptions}
              </select>
            </div>
            <div class="col">
              <label>${escapeHtml(state.lang === 'en' ? 'Interval (minutes, optional)' : 'Intervalo (minutos, opcional)')}</label>
              <input class="input gn-interval" type="number" min="0" step="1" value="${intervalMinutes}" />
            </div>
            <div class="col" style="text-align:right;">
              <label style="display:block; margin-bottom:4px;">
                <input type="checkbox" class="gn-enabled" ${enabled ? 'checked' : ''} />
                ${escapeHtml(state.lang === 'en' ? 'Enabled' : 'Ativo')}
              </label>
              <button type="button" class="btn danger gn-remove">${escapeHtml(state.lang === 'en' ? 'Remove' : 'Remover')}</button>
            </div>
          </div>
        </div>
      `;
    })
    .join('');

  listEl.innerHTML = html;

  // Liga eventos de remoção
  listEl.querySelectorAll('.gn-remove').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const row = e.target.closest('.gamenews-feed-row');
      if (row) row.remove();
    });
  });
}

async function saveGameNewsFeeds() {
  const listEl = document.getElementById('gamenewsFeedsList');
  if (!listEl) return;

  const rows = Array.from(listEl.querySelectorAll('.gamenews-feed-row'));
  const feeds = [];

  for (const row of rows) {
    const name = row.querySelector('.gn-name')?.value?.trim() || 'Feed';
    const feedUrl = row.querySelector('.gn-url')?.value?.trim() || '';
    const channelId = row.querySelector('.gn-channel')?.value || '';
    const intervalStr = row.querySelector('.gn-interval')?.value || '';
    const enabled = !!row.querySelector('.gn-enabled')?.checked;

    if (!feedUrl || !channelId) continue;

    let intervalMs = null;
    const minutes = Number(intervalStr);
    if (Number.isFinite(minutes) && minutes > 0) {
      intervalMs = Math.round(minutes * 60 * 1000);
    }

    feeds.push({ name, feedUrl, channelId, enabled, intervalMs });
  }

  const headers = getAuthHeaders();
  headers['Content-Type'] = 'application/json';

  let resp;
  try {
    resp = await fetch('/api/gamenews/feeds', {
      method: 'POST',
      headers,
      body: JSON.stringify({ feeds }),
    });
  } catch (err) {
    console.error('Erro ao enviar /api/gamenews/feeds:', err);
    alert(state.lang === 'en' ? 'Failed to save GameNews feeds.' : 'Falha ao guardar os feeds de GameNews.');
    return;
  }

  if (!resp.ok) {
    console.error('HTTP error /api/gamenews/feeds POST:', resp.status);
    alert(
      (state.lang === 'en' ? 'Error saving GameNews feeds: ' : 'Erro ao guardar os feeds de GameNews: ') +
        String(resp.status)
    );
    return;
  }

  // Recarrega editor e estado após guardar
  await loadGameNewsFeedsEditor();
  await loadGameNewsStatus();

  alert(state.lang === 'en' ? 'GameNews feeds saved.' : 'Feeds de GameNews guardados com sucesso.');
}

// Tabs & navegação
function initTabs() {
  const tabsEl = document.getElementById('tabs');
  if (!tabsEl) return;

  const needsGuild = ['logs', 'cases', 'tickets', 'gamenews', 'user', 'config'];
  const protectedTabs = ['logs', 'cases', 'tickets', 'gamenews', 'user', 'config'];

  tabsEl.addEventListener('click', (e) => {
    const tabEl = e.target.closest('.tab');
    if (!tabEl) return;

    const name = tabEl.dataset.tab;
    if (!name) return;

    const guildPicker = document.getElementById('guildPicker');
    const currentGuild = guildPicker?.value || '';

    // 1) Bloqueio por servidor
    if (!currentGuild && needsGuild.includes(name)) {
      updateTabAccess();
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
    if (name === 'overview') {
      loadOverview().catch((err) => console.error('Erro loadOverview:', err));
    }
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
      loadGameNewsFeedsEditor().catch((err) => console.error('Erro loadGameNewsFeedsEditor:', err));
    }
    if (name === 'user') {
      loadUsers().catch((err) => console.error('Erro loadUsers:', err));
    }
    if (name === 'config') {
      loadGuildConfig().catch((err) => console.error('Erro loadGuildConfig:', err));
    }
  });
}



// ==== OVERVIEW METRICS (/api/overview) ====

async function loadOverview() {
  const gEl = document.getElementById('kpiGuilds');
  const uEl = document.getElementById('kpiUsers');
  const aEl = document.getElementById('kpiActions24h');

  if (!gEl || !uEl || !aEl) return;

  gEl.textContent = '…';
  uEl.textContent = '…';
  aEl.textContent = '…';

  const headers = getAuthHeaders();

  let resp;
  try {
    resp = await fetch('/api/overview', { headers });
  } catch (err) {
    console.error('Erro a chamar /api/overview:', err);
    gEl.textContent = '0';
    uEl.textContent = '0';
    aEl.textContent = '0';
    return;
  }

  if (!resp.ok) {
    console.error('HTTP error /api/overview:', resp.status);
    gEl.textContent = '0';
    uEl.textContent = '0';
    aEl.textContent = '0';
    return;
  }

  let data;
  try {
    data = await resp.json();
  } catch (err) {
    console.error('Erro a ler JSON de /api/overview:', err);
    gEl.textContent = '0';
    uEl.textContent = '0';
    aEl.textContent = '0';
    return;
  }

  gEl.textContent = String(data.guilds ?? 0);
  uEl.textContent = String(data.users ?? 0);
  aEl.textContent = String(data.actions24h ?? 0);
}

// ==== USERS TAB (/api/guilds/:guildId/users) ====

async function loadUsers() {
  const listEl = document.querySelector('#tab-user .list');
  const guildPicker = document.getElementById('guildPicker');
  if (!listEl) return;

  const guildId = guildPicker?.value || '';
  if (!guildId) {
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('warn_select_guild'))}</div>`;
    return;
  }

  listEl.innerHTML = `<div class="empty">${escapeHtml(t('users_loading') || 'A carregar utilizadores…')}</div>`;

  const headers = getAuthHeaders();

  let resp;
  try {
    resp = await fetch(`/api/guilds/${encodeURIComponent(guildId)}/users`, { headers });
  } catch (err) {
    console.error('Erro a chamar /api/guilds/:guildId/users:', err);
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('users_error_generic') || 'Não foi possível carregar os utilizadores.')}</div>`;
    return;
  }

  if (!resp.ok) {
    console.error('HTTP error /api/guilds/:guildId/users:', resp.status);
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('users_error_http') || 'Erro ao carregar utilizadores.')} (${resp.status})</div>`;
    return;
  }

  let data;
  try {
    data = await resp.json();
  } catch (err) {
    console.error('Erro a ler JSON de /api/guilds/:guildId/users:', err);
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('users_error_generic') || 'Não foi possível carregar os utilizadores.')}</div>`;
    return;
  }

  const items = Array.isArray(data.items) ? data.items : [];

  if (!items.length) {
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('users_empty'))}</div>`;
    return;
  }

  const html = items
    .map((u) => {
      const tag = u.tag || `${u.username || 'User'}#${u.discriminator || '0000'}`;
      const roles = (u.roles || []).map((r) => r.name).join(', ');
      const joined = u.joinedAt || '';

      return `
        <div class="card user-row" data-user-id="${escapeHtml(u.id || '')}">
          <div class="row gap" style="justify-content: space-between; align-items:flex-start;">
            <div>
              <strong>${escapeHtml(tag)}</strong>
              <div class="hint">
                ${u.bot ? 'Bot • ' : ''}
                ${
                  roles
                    ? escapeHtml(roles)
                    : escapeHtml(state.lang === 'en' ? 'No special roles' : 'Sem cargos especiais')
                }
              </div>
            </div>
            <div style="text-align:right; font-size:11px; color:var(--text-muted);">
              ${
                joined
                  ? `<div>${
                      state.lang === 'en' ? 'Joined:' : 'Entrou em:'
                    } ${escapeHtml(String(joined))}</div>`
                  : ''
              }
            </div>
          </div>
        </div>
      `;
    })
    .join('');

  listEl.innerHTML = html;
}

// ==== CONFIG TAB (/api/guilds/:guildId/meta + /config) ====

async function loadGuildConfig() {
  const guildPicker = document.getElementById('guildPicker');
  const statusEl = document.getElementById('configStatus');
  const logSelect = document.getElementById('configLogChannel');
  const dashLogSelect = document.getElementById('configDashboardLogChannel');
  const staffSelect = document.getElementById('configStaffRoles');

  if (!guildPicker || !logSelect || !dashLogSelect || !staffSelect) return;

  const guildId = guildPicker.value || '';
  if (!guildId) {
    if (statusEl) statusEl.textContent = t('warn_select_guild');
    return;
  }

  const headers = getAuthHeaders();

  // Metadados (canais + roles)
  let meta;
  try {
    const metaResp = await fetch(`/api/guilds/${encodeURIComponent(guildId)}/meta`, { headers });
    if (!metaResp.ok) throw new Error('HTTP ' + metaResp.status);
    meta = await metaResp.json();
  } catch (err) {
    console.error('Erro a carregar meta do servidor:', err);
    if (statusEl) {
      statusEl.textContent =
        t('config_save_error') || 'Erro ao carregar metadados do servidor.';
    }
    return;
  }

  const channels = Array.isArray(meta.channels) ? meta.channels : [];
  const roles = Array.isArray(meta.roles) ? meta.roles : [];

  logSelect.innerHTML =
    '<option value="">(nenhum)</option>' +
    channels
      .map((c) => `<option value="${escapeHtml(c.id)}">#${escapeHtml(c.name)}</option>`)
      .join('');

  dashLogSelect.innerHTML =
    '<option value="">(nenhum)</option>' +
    channels
      .map((c) => `<option value="${escapeHtml(c.id)}">#${escapeHtml(c.name)}</option>`)
      .join('');

  staffSelect.innerHTML = roles
    .map((r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.name)}</option>`)
    .join('');

  // Config atual
  try {
    const cfgResp = await fetch(`/api/guilds/${encodeURIComponent(guildId)}/config`, { headers });
    if (!cfgResp.ok) throw new Error('HTTP ' + cfgResp.status);
    const cfgData = await cfgResp.json();
    const cfg = (cfgData && cfgData.config) || {};

    if (cfg.logChannelId) logSelect.value = cfg.logChannelId;
    if (cfg.dashboardLogChannelId) dashLogSelect.value = cfg.dashboardLogChannelId;

    if (Array.isArray(cfg.staffRoleIds)) {
      Array.from(staffSelect.options).forEach((opt) => {
        opt.selected = cfg.staffRoleIds.includes(opt.value);
      });
    }
    if (statusEl) statusEl.textContent = '';
  } catch (err) {
    console.error('Erro a carregar config do servidor:', err);
    if (statusEl) {
      statusEl.textContent =
        t('config_save_error') || 'Erro ao carregar configuração do servidor.';
    }
  }
}

async function saveGuildConfig() {
  const guildPicker = document.getElementById('guildPicker');
  const statusEl = document.getElementById('configStatus');
  const logSelect = document.getElementById('configLogChannel');
  const dashLogSelect = document.getElementById('configDashboardLogChannel');
  const staffSelect = document.getElementById('configStaffRoles');

  const guildId = guildPicker?.value || '';
  if (!guildId) {
    if (statusEl) statusEl.textContent = t('warn_select_guild');
    return;
  }

  const headers = getAuthHeaders();
  headers['Content-Type'] = 'application/json';

  const staffRoleIds = Array.from(staffSelect.selectedOptions).map((o) => o.value);

  const body = {
    logChannelId: logSelect.value || null,
    dashboardLogChannelId: dashLogSelect.value || null,
    staffRoleIds
  };

  try {
    const resp = await fetch(`/api/guilds/${encodeURIComponent(guildId)}/config`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      if (statusEl) {
        statusEl.textContent =
          t('config_save_error') || 'Erro ao guardar configuração.';
      }
      return;
    }

    if (statusEl) {
      statusEl.textContent =
        t('config_save_ok') || 'Configuração guardada com sucesso.';
    }
  } catch (err) {
    console.error('Erro a guardar config do servidor:', err);
    if (statusEl) {
      statusEl.textContent =
        t('config_save_error') || 'Erro ao guardar configuração.';
    }
  }
}

// Boot
document.addEventListener('DOMContentLoaded', () => {
  // idioma inicial
  const saved = (localStorage.getItem('OZARK_LANG_SIMPLE') || 'pt').toLowerCase();
  state.lang = saved;
  const lp = document.getElementById('langPicker');
  if (lp) lp.value = saved;

  applyI18n();
  initTabs();
  loadOverview().catch((err) => console.error('Erro loadOverview:', err));

  // Guild picker + carregamento de servidores reais
  const guildPicker = document.getElementById('guildPicker');
  if (guildPicker) {
    updateTabAccess();

    guildPicker.addEventListener('change', () => {
      updateTabAccess();

      const activeName = document.querySelector('.tab.active')?.dataset.tab;

      if (activeName === 'overview') {
        loadOverview().catch((err) => console.error('Erro loadOverview (guild change):', err));
      }
      if (activeName === 'logs') {
        loadLogs().catch((err) => console.error('Erro loadLogs (guild change):', err));
      }
      if (activeName === 'cases') {
        loadCases().catch((err) => console.error('Erro loadCases (guild change):', err));
      }
      if (activeName === 'tickets') {
        loadTickets().catch((err) => console.error('Erro loadTickets (guild change):', err));
      }
      if (activeName === 'gamenews') {
        loadGameNewsStatus().catch((err) => console.error('Erro loadGameNewsStatus (guild change):', err));
        loadGameNewsFeedsEditor().catch((err) => console.error('Erro loadGameNewsFeedsEditor (guild change):', err));
      }
      if (activeName === 'user') {
        loadUsers().catch((err) => console.error('Erro loadUsers (guild change):', err));
      }
      if (activeName === 'config') {
        loadGuildConfig().catch((err) => console.error('Erro loadGuildConfig (guild change):', err));
      }
    });

    // Carrega lista de servidores após DOM estar pronto
    loadGuilds().catch((err) => console.error('Erro loadGuilds:', err));
  } else {
    updateTabAccess();
  }

  // Listener de idioma
  const langPicker = document.getElementById('langPicker');
  if (langPicker) {
    langPicker.addEventListener('change', (e) => {
      setLang(e.target.value);
      console.log(t('language_changed'));
    });
  }

  // Botão "Recarregar" nos logs
  const reloadBtn = document.getElementById('btnReloadLogs');
  if (reloadBtn) {
    reloadBtn.addEventListener('click', () => {
      loadLogs().catch((err) => console.error('Erro loadLogs (reload):', err));
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

  // Botões do editor de GameNews
  const btnAddFeed = document.getElementById('btnAddGameNewsFeed');
  if (btnAddFeed) {
    btnAddFeed.addEventListener('click', async () => {
      const listEl = document.getElementById('gamenewsFeedsList');
      if (!listEl) return;

      // Garante que já temos pelo menos uma lista carregada
      if (!listEl.querySelector('.gamenews-feed-row')) {
        await loadGameNewsFeedsEditor().catch((err) => console.error('Erro loadGameNewsFeedsEditor (add):', err));
      }

      const guildPicker = document.getElementById('guildPicker');
      const guildId = guildPicker?.value || '';
      const channels = guildId ? state.guildChannelsCache[guildId] || [] : [];

      const channelOptions = [
        `<option value="">${escapeHtml(state.lang === 'en' ? 'Select a channel' : 'Selecione um canal')}</option>`,
        ...channels.map(
          (ch) => `<option value="${escapeHtml(ch.id)}"># ${escapeHtml(ch.name)}</option>`
        ),
      ].join('');

      const div = document.createElement('div');
      div.className = 'card gamenews-feed-row';
      div.innerHTML = `
        <div class="row gap">
          <div class="col">
            <label>${escapeHtml(state.lang === 'en' ? 'Name' : 'Nome')}</label>
            <input class="input gn-name" value="" />
          </div>
          <div class="col">
            <label>Feed URL</label>
            <input class="input gn-url" value="" placeholder="https://" />
          </div>
        </div>
        <div class="row gap" style="margin-top:8px; align-items:flex-end;">
          <div class="col">
            <label>${escapeHtml(state.lang === 'en' ? 'Channel' : 'Canal')}</label>
            <select class="select gn-channel">
              ${channelOptions}
            </select>
          </div>
          <div class="col">
            <label>${escapeHtml(state.lang === 'en' ? 'Interval (minutes, optional)' : 'Intervalo (minutos, opcional)')}</label>
            <input class="input gn-interval" type="number" min="0" step="1" value="" />
          </div>
          <div class="col" style="text-align:right;">
            <label style="display:block; margin-bottom:4px;">
              <input type="checkbox" class="gn-enabled" checked />
              ${escapeHtml(state.lang === 'en' ? 'Enabled' : 'Ativo')}
            </label>
            <button type="button" class="btn danger gn-remove">${escapeHtml(state.lang === 'en' ? 'Remove' : 'Remover')}</button>
          </div>
        </div>
      `;

      listEl.appendChild(div);

      const removeBtn = div.querySelector('.gn-remove');
      if (removeBtn) {
        removeBtn.addEventListener('click', () => div.remove());
      }
    });
  }

  const btnSaveFeeds = document.getElementById('btnSaveGameNewsFeeds');
  if (btnSaveFeeds) {
    btnSaveFeeds.addEventListener('click', () => {
      saveGameNewsFeeds().catch((err) => console.error('Erro saveGameNewsFeeds:', err));
    });
  }


  // Botões de configuração do servidor
  const btnReloadCfg = document.getElementById('btnReloadGuildConfig');
  if (btnReloadCfg) {
    btnReloadCfg.addEventListener('click', () => {
      loadGuildConfig().catch((err) => console.error('Erro loadGuildConfig (reload):', err));
    });
  }

  const btnSaveCfg = document.getElementById('btnSaveGuildConfig');
  if (btnSaveCfg) {
    btnSaveCfg.addEventListener('click', () => {
      saveGuildConfig().catch((err) => console.error('Erro saveGuildConfig:', err));
    });
  }
});