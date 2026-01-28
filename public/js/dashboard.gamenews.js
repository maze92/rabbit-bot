// GameNews module extension for OzarkDashboard
// Lógica da tab GameNews extraída para este módulo.

(function () {
  if (!window.OzarkDashboard) return;

  const D = window.OzarkDashboard;
  const state = D.state;
  const apiGet = D.apiGet;
  const apiPost = D.apiPost;
  const toast = D.toast;
  const t = D.t;
  const escapeHtml = D.escapeHtml;

  function createGameNewsFeedRow(f, idx) {
    const row = document.createElement('div');
    row.className = 'list-item';
    row.dataset.index = String(idx);

    const nameId = `gamenews-feed-name-${idx}`;
    const urlId = `gamenews-feed-url-${idx}`;
    const channelId = `gamenews-feed-channel-${idx}`;
    const enabledId = `gamenews-feed-enabled-${idx}`;


    const logChannelId = `gamenews-feed-log-channel-${idx}`;
    const intervalId = `gamenews-feed-interval-${idx}`;

    row.innerHTML = `
      <div class="row gap">
        <div class="col">
          <label for="${nameId}">${escapeHtml(t('gamenews_feed_name_label'))}</label>
          <input
            type="text"
            class="input feed-name"
            id="${nameId}"
            name="gamenews_feed_name_${idx}"
            value="${escapeHtml(f.name || '')}"
          >
        </div>
        <div class="col">
          <label for="${urlId}">${escapeHtml(t('gamenews_feed_url_label'))}</label>
          <input
            type="text"
            class="input feed-url"
            id="${urlId}"
            name="gamenews_feed_url_${idx}"
            value="${escapeHtml(f.feedUrl || '')}"
          >
        </div>
      </div>
      <div class="row gap">
        <div class="col">
          <label for="${channelId}">${escapeHtml(t('gamenews_feed_channel_label'))}</label>
          <input
            type="text"
            class="input feed-channel"
            id="${channelId}"
            name="gamenews_feed_channel_${idx}"
            value="${escapeHtml(f.channelId || '')}"
          >
        </div>
        <div class="col">
          <label for="${logChannelId}">${escapeHtml(t('gamenews_feed_log_channel_label'))}</label>
          <input
            type="text"
            class="input feed-log-channel"
            id="${logChannelId}"
            name="gamenews_feed_log_channel_${idx}"
            value="${escapeHtml(f.logChannelId || '')}"
          >
        </div>
      </div>
      <div class="row gap">
        <div class="col">
          <label for="${intervalId}">${escapeHtml(t('gamenews_feed_interval_label'))}</label>
          <input
            type="number"
            min="0"
            class="input feed-interval"
            id="${intervalId}"
            name="gamenews_feed_interval_${idx}"
            value="${f.intervalMs ? String(Math.round(f.intervalMs / 60000)) : ''}"
            placeholder="${escapeHtml(t('gamenews_feed_interval_placeholder'))}"
          >
        </div>
        <div class="col" style="display:flex;align-items:center;gap:8px;">
          <label for="${enabledId}" style="display:flex;align-items:center;gap:4px;cursor:pointer;">
            <input
              type="checkbox"
              class="feed-enabled"
              id="${enabledId}"
              name="gamenews_feed_enabled_${idx}"
              ${f.enabled === false ? '' : 'checked'}
            >
            <span>${escapeHtml(t('gamenews_feed_enabled_label'))}</span>
          </label>
          <button type="button" class="btn btn-small btn-remove-feed">
            ${escapeHtml(t('gamenews_feed_remove_label'))}
          </button>
        </div>
      </div>
    `;


    return row;
  }

  
  function renderGameNewsHeader(container) {
    const header = document.createElement('div');
    header.className = 'section-header';
    header.innerHTML = `
      <div class="row space-between align-center">
        <div>
          <h2 class="section-title">${escapeHtml(t('gamenews_title') || 'GameNews')}</h2>
          <div class="section-subtitle">${escapeHtml(t('gamenews_subtitle') || 'Gerir feeds de notícias e anúncios')}</div>
        </div>
        <div class="actions">
          <button type="button" class="btn btn-primary btn-add-feed">
            ${escapeHtml(t('gamenews_add_feed') || 'Adicionar feed')}
          </button>
        </div>
      </div>
    `;
    container.appendChild(header);
    return header;
  }

  

function selectGameNewsFeed(source) {
  try {
    const detailEl = document.getElementById('gamenewsFeedDetailPanel');
    if (!detailEl) return;

    if (!state.gameNewsStatusBySource) {
      state.gameNewsStatusBySource = {};
    }
    if (!state.gameNewsFeedsByName && Array.isArray(state.gameNewsFeeds)) {
      state.gameNewsFeedsByName = {};
      state.gameNewsFeeds.forEach(function (f) {
        if (f && f.name) {
          state.gameNewsFeedsByName[f.name] = f;
        }
      });
    }

    const statusMap = state.gameNewsStatusBySource || {};
    const feedsByName = state.gameNewsFeedsByName || {};
    const feeds = Array.isArray(state.gameNewsFeeds) ? state.gameNewsFeeds : [];

    const status = statusMap[source] || null;
    let feedCfg = feedsByName[source] || null;
    if (!feedCfg && status && status.feedName) {
      feedCfg = feedsByName[status.feedName] || null;
    }

    if (!feedCfg && feeds.length) {
      feedCfg = feeds.find(function (f) {
        return f && (f.name === source || f.feedUrl === (status && status.feedUrl));
      }) || null;
    }

    if (!feedCfg && !status) {
      detailEl.innerHTML = `<div class="empty">${escapeHtml(t('gamenews_detail_empty'))}</div>`;
      return;
    }

    const feedName = (feedCfg && feedCfg.name) || (status && (status.feedName || status.source)) || source || 'Feed';
    const feedUrl = (feedCfg && feedCfg.feedUrl) || (status && status.feedUrl) || '';

    state.activeGameNewsSource = source;

    let lastSent = '—';
    let fails = '0';
    let paused = false;
    let enabled = true;
    let intervalMinutes = null;
    let pausedUntil = null;
    let lastError = '';

    if (status) {
      lastSent = status.lastSentAt ? new Date(status.lastSentAt).toLocaleString() : '—';
      fails = status.failCount != null ? String(status.failCount) : '0';
      paused = !!status.paused;
      enabled = status.enabled === false ? false : true;

      const intervalMs = status.intervalMs && Number(status.intervalMs);
      intervalMinutes = intervalMs && intervalMs > 0 ? Math.round(intervalMs / 60000) : null;

      pausedUntil = status.pausedUntil ? new Date(status.pausedUntil).toLocaleString() : null;
      lastError = status.lastError ? String(status.lastError) : '';
    } else if (feedCfg && typeof feedCfg.enabled === 'boolean') {
      enabled = feedCfg.enabled;
    }

    let stateLabel;
    if (!enabled) {
      stateLabel = t('gamenews_status_state_paused');
    } else if (paused) {
      stateLabel = t('gamenews_status_state_paused');
    } else if (status && status.failCount && status.failCount > 0) {
      stateLabel = t('gamenews_status_state_error');
    } else {
      stateLabel = t('gamenews_status_state_ok');
    }

    const intervalOverrideMs = feedCfg && typeof feedCfg.intervalMs === 'number' ? feedCfg.intervalMs : null;
    const intervalOverrideMinutes =
      intervalOverrideMs && intervalOverrideMs > 0 ? Math.round(intervalOverrideMs / 60000) : null;

    let html = '';
    html += `<div class="title">${escapeHtml(t('gamenews_detail_title'))}</div>`;
    html += `<div class="subtitle">${escapeHtml(feedName)}${feedUrl ? ' • ' + escapeHtml(feedUrl) : ''}</div>`;

    // Secção: Configuração do feed (editável)
    html += '<div class="history-section gamenews-detail-config">';
    html += `<h3>${escapeHtml(t('gamenews_detail_config_title'))}</h3>`;
    html += '<div class="history-hint">' + escapeHtml(t('gamenews_detail_config_hint')) + '</div>';

    html += '<div class="row gap">';
    html += '<div class="col">';
    html += `<label for="gnDetailName">${escapeHtml(t('gamenews_feed_name_label'))}</label>`;
    html += `<input type="text" class="input" id="gnDetailName" value="${escapeHtml(
      (feedCfg && feedCfg.name) || ''
    )}">`;
    html += '</div>';
    html += '<div class="col">';
    html += `<label for="gnDetailUrl">${escapeHtml(t('gamenews_feed_url_label'))}</label>`;
    html += `<input type="text" class="input" id="gnDetailUrl" value="${escapeHtml(
      (feedCfg && feedCfg.feedUrl) || ''
    )}">`;
    html += '</div>';
    html += '</div>';

    html += '<div class="row gap">';
    html += '<div class="col">';
    html += `<label for="gnDetailChannel">${escapeHtml(t('gamenews_feed_channel_label'))}</label>`;
    html += `<input type="text" class="input" id="gnDetailChannel" value="${escapeHtml(
      (feedCfg && feedCfg.channelId) || ''
    )}">`;
    html += '</div>';
    html += '<div class="col">';
    html += `<label for="gnDetailLogChannel">${escapeHtml(t('gamenews_feed_log_channel_label'))}</label>`;
    html += `<input type="text" class="input" id="gnDetailLogChannel" value="${escapeHtml(
      (feedCfg && feedCfg.logChannelId) || ''
    )}">`;
    html += '</div>';
    html += '</div>';

    html += '<div class="row gap">';
    html += '<div class="col">';
    html += `<label for="gnDetailInterval">${escapeHtml(t('gamenews_feed_interval_label'))}</label>`;
    html += `<input type="number" min="0" class="input" id="gnDetailInterval" value="${
      intervalOverrideMinutes || ''
    }" placeholder="${escapeHtml(t('gamenews_feed_interval_placeholder'))}">`;
    html += '</div>';
    html += '<div class="col" style="display:flex;align-items:center;gap:8px;">';
    html += '<label for="gnDetailEnabled" style="display:flex;align-items:center;gap:4px;cursor:pointer;">';
    html += `<input type="checkbox" id="gnDetailEnabled" ${enabled ? 'checked' : ''}>`;
    html += `<span>${escapeHtml(t('gamenews_feed_enabled_label'))}</span>`;
    html += '</label>';
    html += '</div>';
    html += '</div>';

    html += '</div>'; // history-section config

    // Secção: Estado / histórico
    html += '<div class="history-section gamenews-detail-state">';
    html += `<h3>${escapeHtml(t('gamenews_detail_state_title'))}</h3>`;
    html += '<div class="gamenews-detail-main">';

    html += '<div class="row gap">';
    html += `<div class="col"><strong>${escapeHtml(t('gamenews_status_state_ok'))}</strong>: ${escapeHtml(
      stateLabel
    )}</div>`;
    html += `<div class="col">${escapeHtml(t('gamenews_status_last_label'))}: ${escapeHtml(lastSent)}</div>`;
    html += '</div>';

    html += '<div class="row gap">';
    html += `<div class="col">Fails: ${escapeHtml(fails)}</div>`;
    if (intervalMinutes) {
      html += `<div class="col">Intervalo efetivo: ${String(intervalMinutes)} min</div>`;
    }
    html += '</div>';

    if (pausedUntil) {
      html += `<div class="hint">Pausado até: ${escapeHtml(pausedUntil)}</div>`;
    }
    if (lastError) {
      html += `<div class="hint">Último erro: ${escapeHtml(lastError)}</div>`;
    }

    html += '</div>'; // detail-main
    html += '</div>'; // history-section state

    // Secção: Ações rápidas
    html += '<div class="history-section gamenews-detail-actions">';
    html += `<h3>${escapeHtml(t('gamenews_detail_actions_title'))}</h3>`;
    html += '<div class="row gap">';
    html +=
      '<button type="button" class="btn btn-small gamenews-action" data-action="save">' +
      escapeHtml(t('gamenews_detail_action_save')) +
      '</button>';
    html +=
      '<button type="button" class="btn btn-small gamenews-action" data-action="remove">' +
      escapeHtml(t('gamenews_detail_action_remove')) +
      '</button>';
    html +=
      '<button type="button" class="btn btn-small ghost gamenews-action" data-action="reload">' +
      escapeHtml(t('gamenews_reload_status')) +
      '</button>';
    html += '</div>';
    html += '</div>'; // actions

    detailEl.innerHTML = html;

    // Ligar ao row correspondente na lista de feeds (para sincronizar edição)
    const feedsList = document.getElementById('gamenewsFeedsList');
    let activeRow = null;
    if (feedsList) {
      const rows = Array.prototype.slice.call(feedsList.querySelectorAll('.list-item'));
      rows.forEach(function (row) {
        const nameInput = row.querySelector('.feed-name');
        const urlInput = row.querySelector('.feed-url');
        const rowName = nameInput ? nameInput.value.trim() : '';
        const rowUrl = urlInput ? urlInput.value.trim() : '';
        if (!activeRow && (rowName === feedName || (feedUrl && rowUrl === feedUrl))) {
          activeRow = row;
        }
        row.classList.remove('active');
      });
    }
    if (activeRow) {
      activeRow.classList.add('active');
    }

    // Sincronizar inputs do detalhe com a linha de feed
    function syncBackToRow() {
      if (!activeRow) return;
      const rowNameInput = activeRow.querySelector('.feed-name');
      const rowUrlInput = activeRow.querySelector('.feed-url');
      const rowChannelInput = activeRow.querySelector('.feed-channel');
      const rowLogChannelInput = activeRow.querySelector('.feed-log-channel');
      const rowIntervalInput = activeRow.querySelector('.feed-interval');
      const rowEnabledInput = activeRow.querySelector('.feed-enabled');

      const dName = document.getElementById('gnDetailName');
      const dUrl = document.getElementById('gnDetailUrl');
      const dChannel = document.getElementById('gnDetailChannel');
      const dLogChannel = document.getElementById('gnDetailLogChannel');
      const dInterval = document.getElementById('gnDetailInterval');
      const dEnabled = document.getElementById('gnDetailEnabled');

      if (rowNameInput && dName) rowNameInput.value = dName.value;
      if (rowUrlInput && dUrl) rowUrlInput.value = dUrl.value;
      if (rowChannelInput && dChannel) rowChannelInput.value = dChannel.value;
      if (rowLogChannelInput && dLogChannel) rowLogChannelInput.value = dLogChannel.value;
      if (rowIntervalInput && dInterval) rowIntervalInput.value = dInterval.value;
      if (rowEnabledInput && dEnabled) rowEnabledInput.checked = dEnabled.checked;
    }

    ['gnDetailName', 'gnDetailUrl', 'gnDetailChannel', 'gnDetailLogChannel', 'gnDetailInterval', 'gnDetailEnabled'].forEach(
      function (id) {
        const el = document.getElementById(id);
        if (!el) return;
        const evt = id === 'gnDetailEnabled' ? 'change' : 'input';
        el.addEventListener(evt, function () {
          syncBackToRow();
        });
      }
    );

    const actionButtons = detailEl.querySelectorAll('.gamenews-action');
    actionButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        const action = btn.getAttribute('data-action');
        if (action === 'reload') {
          D.loadGameNews()
            .then(function () {})
            .catch(function (err) {
              console.error('GameNews reload error', err);
              toast(t('gamenews_error_generic'));
            });
        } else if (action === 'save') {
          // Garantir que a linha está sincronizada
          syncBackToRow();
          const saveBtn = document.getElementById('btnSaveGameNewsFeeds');
          if (saveBtn) {
            saveBtn.click();
          }
        } else if (action === 'remove') {
          if (activeRow) {
            const removeBtn = activeRow.querySelector('.btn-remove-feed');
            if (removeBtn) {
              removeBtn.click();
            }
          }
        }
      });
    });
  } catch (err) {
    console.error('GameNews detail render error', err);
  }
}
function renderGameNewsStatus(items) {
  const listEl = document.getElementById('gamenewsStatusList');
  const detailEl = document.getElementById('gamenewsFeedDetailPanel');
  if (!listEl) return;
  listEl.innerHTML = '';

  if (!items || !items.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = t('gamenews_empty');
    listEl.appendChild(empty);

    if (detailEl) {
      detailEl.innerHTML = `<div class="empty">${escapeHtml(
        t('gamenews_detail_empty')
      )}</div>`;
    }
    return;
  }

  if (!state.gameNewsStatusBySource) {
    state.gameNewsStatusBySource = {};
  } else {
    state.gameNewsStatusBySource = {};
  }

  items.forEach(function (s) {
    const source = s.source || s.feedName || s.feedUrl || '';
    if (source) {
      state.gameNewsStatusBySource[source] = s;
    }

    const row = document.createElement('div');
    row.className = 'list-item gamenews-status-row';
    row.dataset.source = source;

    const lastSent = s.lastSentAt ? new Date(s.lastSentAt).toLocaleString() : '—';
    const fails = s.failCount != null ? String(s.failCount) : '0';
    const paused = !!s.paused;
    const enabled = s.enabled === false ? false : true;

    let stateLabel;
    if (!enabled) {
      stateLabel = t('gamenews_status_state_paused');
    } else if (paused) {
      stateLabel = t('gamenews_status_state_paused');
    } else if (s.failCount && s.failCount > 0) {
      stateLabel = t('gamenews_status_state_error');
    } else {
      stateLabel = t('gamenews_status_state_ok');
    }

    const intervalMs = s.intervalMs && Number(s.intervalMs);
    const intervalMinutes =
      intervalMs && intervalMs > 0 ? Math.round(intervalMs / 60000) : null;

    row.innerHTML = `
      <div class="row gap">
        <div class="col">
          <div class="title">${escapeHtml(s.feedName || s.source || 'Feed')}</div>
          <div class="subtitle">${escapeHtml(s.feedUrl || '')}</div>
        </div>
        <div class="col">
          <div class="badge-row">
            <span class="badge">${escapeHtml(stateLabel)}</span>
            <span class="badge">Fails: ${escapeHtml(fails)}</span>
            <span class="badge">${escapeHtml(t('gamenews_status_last_label'))}: ${escapeHtml(
              lastSent
            )}</span>
            ${
              intervalMinutes
                ? `<span class="badge">${String(intervalMinutes)} min</span>`
                : ''
            }
          </div>
        </div>
      </div>
    `;

    row.addEventListener('click', function () {
      if (source) {
        selectGameNewsFeed(source);
      }
    });

    listEl.appendChild(row);
  });

  const first = items[0];
  const firstSource = first && (first.source || first.feedName || first.feedUrl);
  if (firstSource) {
    selectGameNewsFeed(firstSource);
  }
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

  
function renderGameNewsEditor(feeds) {
  const listEl = document.getElementById('gamenewsFeedsList');
  if (!listEl) return;
  listEl.innerHTML = '';

  // Guardar em state para o painel de detalhe
  if (!Array.isArray(feeds)) {
    state.gameNewsFeeds = [];
  } else {
    state.gameNewsFeeds = feeds.slice();
  }
  state.gameNewsFeedsByName = {};
  if (Array.isArray(state.gameNewsFeeds)) {
    state.gameNewsFeeds.forEach(function (f) {
      if (f && f.name) {
        state.gameNewsFeedsByName[f.name] = f;
      }
    });
  }

  if (!feeds || !feeds.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = t('gamenews_editor_empty');
    listEl.appendChild(empty);
    return;
  }

  feeds.forEach(function (f, idx) {
    const row = createGameNewsFeedRow(f, idx);
    row.dataset.feedName = f && f.name ? String(f.name) : '';
    row.addEventListener('click', function () {
      if (row.dataset.feedName) {
        selectGameNewsFeed(row.dataset.feedName);
      }
    });
    listEl.appendChild(row);
  });
}
// Substituir as funções no namespace pela versão deste módulo
  D.loadGameNews = loadGameNews;
  D.renderGameNewsEditor = renderGameNewsEditor;


  })();