// GameNews module extension for OzarkDashboard
// Implementa a tab GameNews no mesmo padrão da tab Utilizadores:
// lista à esquerda + painel de detalhe à direita.

(function () {
  if (!window.OzarkDashboard) return;

  const D = window.OzarkDashboard;
  const state = D.state;
  const apiGet = D.apiGet;
  const apiPost = D.apiPost;
  const toast = D.toast;
  const t = D.t;
  const escapeHtml = D.escapeHtml;

  // ------------------------
  // Helpers internos
  // ------------------------

  let _gameNewsDetailTimeout = null;

  function getGuildParam() {
    if (!state.guildId) return '';
    return '?guildId=' + encodeURIComponent(state.guildId);
  }

      function makeStatusKey(obj) {
      if (!obj) return '';
      var feedUrl = '';
      var channelId = '';
      var name = '';
      try {
        feedUrl = (obj.feedUrl != null ? String(obj.feedUrl) : '').trim();
      } catch (e) {}
      try {
        channelId = (obj.channelId != null ? String(obj.channelId) : '').trim();
      } catch (e) {}
      try {
        name = obj.name != null ? String(obj.name) : '';
      } catch (e) {}
      var right = channelId || name;
      return (feedUrl || '') + '|' + (right || '');
    }

    function buildStatusIndex(items) {
      const idx = {};
      if (!Array.isArray(items)) return idx;
      items.forEach(function (it) {
        if (!it) return;
        const key = makeStatusKey(it);
        if (key) idx[key] = it;
      });
      return idx;
    }

function formatDateTimeShort(value) {
    if (!value) return '';
    try {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleString();
    } catch (e) {
      return '';
    }
  }

  function formatIntervalMinutes(ms) {
    if (!ms || typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return '';
    const mins = ms / 60000;
    if (Number.isInteger(mins)) return String(mins);
    return String(Math.round(mins * 10) / 10);
  }

  // ------------------------
  // Render da lista de feeds
  // ------------------------

  function renderGameNewsFeedsList(feeds) {
    const listEl = document.getElementById('gamenewsFeedsList');
    if (!listEl) return;

    listEl.innerHTML = '';

    if (!Array.isArray(feeds) || feeds.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = t('gamenews_editor_empty');
      listEl.appendChild(empty);
      return;
    }

    feeds.forEach(function (f, idx) {
      const row = document.createElement('div');
      row.className = 'list-item';
      row.dataset.index = String(idx);
      row.dataset.feedUrl = f.feedUrl || '';
      row.dataset.feedName = f.name || '';

      const name = f.name || 'Feed';
      const feedUrl = f.feedUrl || '';
      const channelId = f.channelId || '';
      const enabled = f.enabled !== false;

      row.innerHTML = `
        <div class="user-row-header">
          <div class="title">${escapeHtml(name)}</div>
          <div class="user-type-badge ${enabled ? 'human' : 'bot'}">
            ${escapeHtml(enabled ? 'ON' : 'OFF')}
          </div>
        </div>
        <div class="subtitle">
          ${escapeHtml(feedUrl)}${channelId ? ' • ' + escapeHtml(channelId) : ''}
        </div>
      `;

      row.addEventListener('click', function () {
        // Remover seleção das outras linhas
        const siblings = listEl.querySelectorAll('.list-item');
        siblings.forEach(function (el) {
          el.classList.remove('active');
        });
        row.classList.add('active');

        selectGameNewsFeedByIndex(idx);
      });

      listEl.appendChild(row);
    });
  }

  // ------------------------
  // Painel de detalhe do feed
  // ------------------------

  
  function renderGameNewsFeedSkeleton() {
    return `<div class="empty">${escapeHtml(t('loading') || 'Loading...')}</div>`;
  }

  function selectGameNewsFeedByIndex(idx) {
      if (!Array.isArray(state.gameNewsFeeds)) return;
      const feed = state.gameNewsFeeds[idx];
      if (!feed) return;
      const listEl = document.getElementById('gamenewsFeedsList');
      if (listEl) {
        const rows = listEl.querySelectorAll('.list-item');
        rows.forEach(function (r) {
          r.classList.remove('active');
        });
        const activeRow = listEl.querySelector(`.list-item[data-index="${idx}"]`);
        if (activeRow) activeRow.classList.add('active');
      }
      const detailEl = document.getElementById('gamenewsFeedDetailPanel');
      state.activeGameNewsFeedIndex = idx;
      if (detailEl) {
        detailEl.innerHTML = renderGameNewsFeedSkeleton();
      }

      if (_gameNewsDetailTimeout) {
        clearTimeout(_gameNewsDetailTimeout);
      }
      _gameNewsDetailTimeout = setTimeout(function () {
        renderGameNewsFeedDetail(feed);
        _gameNewsDetailTimeout = null;
      }, 350);
    }


function renderGameNewsFeedDetail(feed) {
    const detailEl = document.getElementById('gamenewsFeedDetailPanel');
    if (!detailEl) return;

    if (!state.guildId || !feed) {
      detailEl.innerHTML = `<div class="empty">${escapeHtml(t('gamenews_detail_empty'))}</div>`;
      return;
    }

    const statusIndex = state.gameNewsStatusIndex || {};
    const statusKey = makeStatusKey(feed);
    const st = statusIndex[statusKey] || null;

    const feedName = feed.name || 'Feed';
    const feedUrl = feed.feedUrl || '';
    const channelId = feed.channelId || '';
    const logChannelId = feed.logChannelId || '';

    const enabled = feed.enabled !== false;
    const intervalMs = typeof feed.intervalMs === 'number' ? feed.intervalMs : null;
    const intervalMinutes = intervalMs ? formatIntervalMinutes(intervalMs) : '';

    const lastSent = st && st.lastSentAt ? formatDateTimeShort(st.lastSentAt) : '';
    const failCount = st && typeof st.failCount === 'number' ? st.failCount : 0;
    const pausedUntil = st && st.pausedUntil ? formatDateTimeShort(st.pausedUntil) : '';
    const lastError = st && st.lastError ? st.lastError : '';

    let html = '';

    // Cabeçalho
    html += `<div class="title">${escapeHtml(t('gamenews_detail_title') || 'Histórico do feed')}</div>`;
    html += `<div class="subtitle">${escapeHtml(feedName)}${feedUrl ? ' • ' + escapeHtml(feedUrl) : ''}</div>`;

    // Secção Configuração (EDITÁVEL)
    html += '<div class="history-section gamenews-detail-config">';

    html += `<h3>${escapeHtml(t('gamenews_detail_config_title') || 'Configuração do feed')}</h3>`;
    html += `<p class="history-hint">${escapeHtml(
      t('gamenews_detail_config_hint') ||
        'Altera os detalhes do feed. As alterações só são guardadas depois de clicares em "Guardar alterações".'
    )}</p>`;

    html += '<div class="row gap">';
    html += '<div class="col">';
    html += `<label for="gnDetailName">${escapeHtml(t('gamenews_feed_name_label') || 'Nome')}</label>`;
    html += `<input type="text" class="input" id="gnDetailName" value="${escapeHtml(feedName)}">`;
    html += '</div>';
    html += '<div class="col">';
    html += `<label for="gnDetailUrl">${escapeHtml(t('gamenews_feed_url_label') || 'URL do feed')}</label>`;
    html += `<input type="text" class="input" id="gnDetailUrl" value="${escapeHtml(feedUrl)}">`;
    html += '</div>';
    html += '</div>';

    html += '<div class="row gap">';
    html += '<div class="col">';
    html += `<label for="gnDetailChannel">${escapeHtml(t('gamenews_feed_channel_label') || 'Canal ID')}</label>`;
    html += `<input type="text" class="input" id="gnDetailChannel" value="${escapeHtml(channelId)}">`;
    html += '</div>';
    html += '<div class="col">';
    html += `<label for="gnDetailLogChannel">${escapeHtml(
      t('gamenews_feed_log_channel_label') || 'Canal de logs (opcional)'
    )}</label>`;
    html += `<input type="text" class="input" id="gnDetailLogChannel" value="${escapeHtml(logChannelId)}">`;
    html += '</div>';
    html += '</div>';

    html += '<div class="row gap">';
    html += '<div class="col">';
    html += `<label for="gnDetailInterval">${escapeHtml(
      t('gamenews_feed_interval_label') || 'Intervalo (minutos)'
    )}</label>`;
    html += `<input
      type="number"
      min="0"
      class="input"
      id="gnDetailInterval"
      value="${intervalMinutes}"
      placeholder="${escapeHtml(t('gamenews_feed_interval_placeholder') || 'Usar intervalo global')}"
    >`;
    html += '</div>';
    html += '</div>';

    html += '</div>'; // /history-section config
// Secção Ações rápidas (mesmo estilo dos utilizadores)
    html += '<div class="history-section user-actions gamenews-detail-actions">';
    html += `<h3>${escapeHtml(t('gamenews_detail_actions_title') || t('users_actions_title') || 'Ações rápidas')}</h3>`;
    html += '<div class="badge-row user-actions-buttons">';
    html += `<button type="button" class="btn xs gamenews-action btn-save" data-action="save">${escapeHtml(t('gamenews_detail_action_save') || 'Guardar')}</button>`;
    html += `<button type="button" class="btn xs gamenews-action btn-toggle" data-action="toggle-enabled">${escapeHtml(t('gamenews_detail_action_toggle') || 'Ativar/Desativar')}</button>`;
    html += `<button type="button" class="btn xs gamenews-action btn-remove" data-action="remove">${escapeHtml(t('gamenews_detail_action_remove') || 'Remover')}</button>`;
    
    html += '</div>';
    html += '</div>'; // /history-section actions


// Secção Estado / histórico
    html += '<div class="history-section gamenews-detail-state">';
    html += `<h3>${escapeHtml(t('gamenews_detail_state_title') || 'Estado do feed')}</h3>`;

    if (!st) {
      html += `<div class="empty">${escapeHtml(
        t('gamenews_detail_state_empty') || 'Ainda não há histórico disponível para este feed.'
      )}</div>`;
    } else {
      html += '<div class="row gap">';
      html += `<div class="badge">${escapeHtml(t('gamenews_detail_last_sent') || 'Último envio')}: ${
        lastSent ? escapeHtml(lastSent) : '-'
      }</div>`;
      html += `<div class="badge">${escapeHtml(t('gamenews_detail_fail_count') || 'Falhas')}: ${String(failCount)}</div>`;
      html += '</div>';

      if (pausedUntil) {
        html += '<div class="row">';
        html += `<div class="col"><strong>${escapeHtml(
          t('gamenews_detail_paused_until') || 'Pausado até'
        )}:</strong> ${escapeHtml(pausedUntil)}</div>`;
        html += '</div>';
      }

      if (lastError) {
        html += '<div class="row">';
        html += `<div class="col"><strong>${escapeHtml(
          t('gamenews_detail_last_error') || 'Último erro'
        )}:</strong> ${escapeHtml(lastError)}</div>`;
        html += '</div>';
      }
    }

    html += '</div>'; // /history-section state
    detailEl.innerHTML = html;

    // Ligação inputs -> state.gameNewsFeeds[activeIndex]
    const idx = state.activeGameNewsFeedIndex;
    if (typeof idx !== 'number' || !Array.isArray(state.gameNewsFeeds) || !state.gameNewsFeeds[idx]) return;
    const target = state.gameNewsFeeds[idx];

    function syncFromInputs() {
      const nameEl = detailEl.querySelector('#gnDetailName');
      const urlEl = detailEl.querySelector('#gnDetailUrl');
      const chEl = detailEl.querySelector('#gnDetailChannel');
      const logEl = detailEl.querySelector('#gnDetailLogChannel');
      const intEl = detailEl.querySelector('#gnDetailInterval');

      target.name = nameEl ? nameEl.value.trim() || 'Feed' : target.name;
      target.feedUrl = urlEl ? urlEl.value.trim() : target.feedUrl;
      target.channelId = chEl ? chEl.value.trim() : target.channelId;
      target.logChannelId = logEl ? logEl.value.trim() || null : target.logChannelId;

      if (intEl) {
        const mins = Number(intEl.value);
        if (Number.isFinite(mins) && mins > 0) {
          target.intervalMs = Math.round(mins * 60 * 1000);
        } else {
          target.intervalMs = null;
        }
      }

    }

    detailEl
      .querySelectorAll(
        '#gnDetailName,#gnDetailUrl,#gnDetailChannel,#gnDetailLogChannel,#gnDetailInterval'
      )
      .forEach(function (el) {
        el.addEventListener('input', syncFromInputs);
        el.addEventListener('change', syncFromInputs);
      });

    // Ações rápidas
    const actionButtons = detailEl.querySelectorAll('.gamenews-action');
    actionButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        const action = btn.getAttribute('data-action');
        if (action === 'save') {
          syncFromInputs();
          saveGameNewsFeeds().catch(function () {});
        } else if (action === 'toggle-enabled') {
          target.enabled = !target.enabled;
          saveGameNewsFeeds().catch(function () {});
        } else if (action === 'remove') {
          // Remove do state e volta a carregar lista + detalhe
          state.gameNewsFeeds.splice(idx, 1);
          renderGameNewsFeedsList(state.gameNewsFeeds);
          detailEl.innerHTML = `<div class="empty">${escapeHtml(t('gamenews_detail_empty'))}</div>`;
        }
      });
    });
  }

  // ------------------------
  // Guardar feeds na DB
  // ------------------------

    async function saveGameNewsFeeds() {
    if (!state.guildId) return;

    const feeds = Array.isArray(state.gameNewsFeeds) ? state.gameNewsFeeds : [];
    let hadInvalid = false;

    const payloadFeeds = feeds
      .map(function (f) {
        if (!f) return null;
        const name = f.name || 'Feed';
        const feedUrl = (f.feedUrl != null ? String(f.feedUrl) : '').trim();
        const channelId = (f.channelId != null ? String(f.channelId) : '').trim();
        const rawLogChannelId = (f.logChannelId != null ? String(f.logChannelId) : '');
        const logChannelId = rawLogChannelId.trim();
        const enabled = f.enabled !== false;
        const intervalMs =
          typeof f.intervalMs === 'number' && f.intervalMs > 0 ? f.intervalMs : null;

        if (!feedUrl || !channelId) {
          hadInvalid = true;
          return null;
        }

        return {
          name: name,
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

    if (hadInvalid) {
      toast(
        t('gamenews_validation_missing') ||
          'Preenche o URL do feed e o ID do canal em todos os feeds antes de guardar.'
      );
      return;
    }

    const body = {
      guildId: state.guildId,
      feeds: payloadFeeds
    };

    const guildParam = getGuildParam();
    const res = await apiPost('/gamenews/feeds' + guildParam, body);
    if (res && res.ok) {
      toast(t('gamenews_save_success') || 'Feeds de GameNews guardados.');
      // Atualizar state.gameNewsFeeds com o que vier da DB
      if (Array.isArray(res.items)) {
        state.gameNewsFeeds = res.items.slice();
        renderGameNewsFeedsList(state.gameNewsFeeds);
        if (typeof state.activeGameNewsFeedIndex === 'number') {
          selectGameNewsFeedByIndex(state.activeGameNewsFeedIndex);
        }
      }
    } else {
      toast(t('gamenews_error_generic') || 'Não foi possível guardar GameNews.');
    }
  }

// ------------------------
  // Carregar GameNews (lista + estado)
  // ------------------------

  async function loadGameNews() {
    const listEl = document.getElementById('gamenewsFeedsList');
    const detailEl = document.getElementById('gamenewsFeedDetailPanel');
    if (!listEl) return;

    if (!state.guildId) {
      listEl.innerHTML = '';
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = t('gamenews_select_guild');
      listEl.appendChild(empty);

      if (detailEl) {
        detailEl.innerHTML = `<div class="empty">${escapeHtml(t('gamenews_detail_empty'))}</div>`;
      }

      return;
    }

    const guildParam = getGuildParam();

    try {
      const [feedsRes, statusRes] = await Promise.all([
        apiGet('/gamenews/feeds' + guildParam),
        apiGet('/gamenews-status' + guildParam)
      ]);

      const feeds = (feedsRes && Array.isArray(feedsRes.items) ? feedsRes.items : []).slice();
      const statusItems = statusRes && Array.isArray(statusRes.items) ? statusRes.items : [];

      state.gameNewsFeeds = feeds;
      state.gameNewsStatusIndex = buildStatusIndex(statusItems);

      renderGameNewsFeedsList(state.gameNewsFeeds);

      state.activeGameNewsFeedIndex = null;
      if (detailEl) {
        detailEl.innerHTML = `<div class="empty">${escapeHtml(t('gamenews_detail_empty'))}</div>`;
      }
    } catch (err) {
      console.error('GameNews load error', err);
      listEl.innerHTML = '';
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = t('gamenews_error_generic') || 'Não foi possível carregar GameNews.';
      listEl.appendChild(empty);
      if (detailEl) {
        detailEl.innerHTML = `<div class="empty">${escapeHtml(t('gamenews_detail_empty'))}</div>`;
      }
    }
  }

  // ------------------------
  // Event handlers dos botões da tab
  // ------------------------

  document.addEventListener('DOMContentLoaded', function () {
    const btnAdd = document.getElementById('btnAddGameNewsFeed');
    if (btnAdd) {
      btnAdd.addEventListener('click', function () {
        if (!Array.isArray(state.gameNewsFeeds)) {
          state.gameNewsFeeds = [];
        }
        state.gameNewsFeeds.push({
          name: 'Feed',
          feedUrl: '',
          channelId: '',
          logChannelId: null,
          enabled: true,
          intervalMs: null
        });
        renderGameNewsFeedsList(state.gameNewsFeeds);
      });
    }
  });

  // ------------------------
  // Export para namespace global
  // ------------------------

  D.loadGameNews = loadGameNews;
})();