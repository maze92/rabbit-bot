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
  // Key used to correlate a feed configuration with its status entry.
  // We need to support both:
  //  - feed objects from /api/gamenews/feeds   -> { name, feedUrl, channelId }
  //  - status objects from /api/gamenews-status -> { feedName, feedUrl, channelId }
  if (!obj) return '';
  let feedUrl = '';
  let channelId = '';
  let name = '';

  try {
    // Some callers use feedUrl, others still expose the DB field as "feed".
    feedUrl = (
      obj.feedUrl != null
        ? String(obj.feedUrl)
        : obj.feed != null
          ? String(obj.feed)
          : ''
    ).trim();
  } catch (e) {}
  try {
    channelId = (obj.channelId != null ? String(obj.channelId) : '').trim();
  } catch (e) {}
  try {
    // Prefer "name", but fall back to "feedName" (used by status payloads).
    name =
      obj.name != null
        ? String(obj.name)
        : obj.feedName != null
          ? String(obj.feedName)
          : '';
  } catch (e) {}

  return JSON.stringify({
    feedUrl,
    channelId,
    name
  });
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
    if (D && typeof D.formatDateTime === 'function') {
      return D.formatDateTime(value);
    }
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
            ${escapeHtml(enabled ? (t('gamenews_feed_status_on')) : (t('gamenews_feed_status_off')))}
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
    return `<div class="empty">${escapeHtml(t('loading'))}</div>`;
  }

  function selectGameNewsFeedByIndex(idx) {
      const numericIdx = Number(idx);
      if (!Number.isInteger(numericIdx) || numericIdx < 0) return;
      if (!Array.isArray(state.gameNewsFeeds)) return;

      const feed = state.gameNewsFeeds[numericIdx];
      if (!feed) return;

      const listEl = document.getElementById('gamenewsFeedsList');
      if (listEl) {
        const rows = listEl.querySelectorAll('.list-item');
        rows.forEach(function (r) {
          r.classList.remove('active');
        });
        const activeRow = listEl.querySelector(`.list-item[data-index="${numericIdx}"]`);
        if (activeRow) activeRow.classList.add('active');
      }

      const detailEl = document.getElementById('gamenewsFeedDetailPanel');
      state.activeGameNewsFeedIndex = numericIdx;
      if (detailEl) {
        detailEl.innerHTML = renderGameNewsFeedSkeleton();
      }

      if (_gameNewsDetailTimeout) {
        clearTimeout(_gameNewsDetailTimeout);
      }

      _gameNewsDetailTimeout = setTimeout(function () {
        if (!Array.isArray(state.gameNewsFeeds)) return;
        const currentFeed = state.gameNewsFeeds[numericIdx];
        if (!currentFeed) return;
        renderGameNewsFeedDetail(currentFeed);
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
    html += `<div class="title">${escapeHtml(t('gamenews_detail_title'))}</div>`;
    html += `<div class="subtitle">${escapeHtml(feedName)}${feedUrl ? ' • ' + escapeHtml(feedUrl) : ''}</div>`;

    // Secção Configuração (EDITÁVEL)
    html += '<div class="history-section gamenews-detail-config">';

    html += `<h3>${escapeHtml(t('gamenews_detail_config_title'))}</h3>`;
    html += `<p class="history-hint">${escapeHtml(
      t('gamenews_detail_config_hint')
    )}</p>`;

    html += '<div class="row gap">';
    html += '<div class="col">';
    html += `<label for="gnDetailName">${escapeHtml(t('gamenews_feed_name_label'))}</label>`;
    html += `<input type="text" class="input" id="gnDetailName" value="${escapeHtml(feedName)}">`;
    html += '</div>';
    html += '<div class="col">';
    html += `<label for="gnDetailUrl">${escapeHtml(t('gamenews_feed_url_label'))}</label>`;
    html += `<input type="text" class="input" id="gnDetailUrl" value="${escapeHtml(feedUrl)}">`;
    html += '</div>';
    html += '</div>';

    html += '<div class="row gap">';
    html += '<div class="col">';
    html += `<label for="gnDetailChannel">${escapeHtml(t('gamenews_feed_channel_label'))}</label>`;
    html += `<input type="text" class="input" id="gnDetailChannel" value="${escapeHtml(channelId)}">`;
    html += '</div>';
    html += '<div class="col">';
    html += `<label for="gnDetailLogChannel">${escapeHtml(
      t('gamenews_feed_log_channel_label')
    )}</label>`;
    html += `<input type="text" class="input" id="gnDetailLogChannel" value="${escapeHtml(logChannelId)}">`;
    html += '</div>';
    html += '</div>';

    html += '<div class="row gap">';
    html += '<div class="col">';
    html += `<label for="gnDetailInterval">${escapeHtml(
      t('gamenews_feed_interval_label')
    )}</label>`;
    html += `<input
      type="number"
      min="0"
      class="input"
      id="gnDetailInterval"
      value="${intervalMinutes}"
      placeholder="${escapeHtml(t('gamenews_feed_interval_placeholder'))}"
    >`;
    html += '</div>';
    html += '</div>';

    html += '</div>'; // /history-section config
// Secção Ações rápidas (mesmo estilo dos utilizadores)
    html += '<div class="history-section user-actions gamenews-detail-actions">';
    html += `<h3>${escapeHtml(t('gamenews_detail_actions_title') || t('users_actions_title'))}</h3>`;
    html += '<div class="badge-row user-actions-buttons">';
    html += `<button type="button" class="btn xs gamenews-action btn-save" data-action="save">${escapeHtml(t('gamenews_detail_action_save'))}</button>`;
    html += `<button type="button" class="btn xs gamenews-action btn-toggle-enabled" data-action="toggle-enabled">${escapeHtml(t('gamenews_detail_action_toggle'))}</button>`;
    html += `<button type="button" class="btn xs gamenews-action btn-test" data-action="test">${escapeHtml(t('gamenews_detail_action_test') || 'Testar')}</button>`;
    html += `<button type="button" class="btn xs gamenews-action btn-remove" data-action="remove">${escapeHtml(t('gamenews_detail_action_remove'))}</button>`;

    html += '</div>';
    html += '</div>'; // /history-section actions



// Secção Estado / histórico
    html += '<div class="history-section gamenews-detail-state">';
    html += `<h3>${escapeHtml(t('gamenews_detail_state_title'))}</h3>`;

    if (!st) {
      html += `<div class="empty">${escapeHtml(
        t('gamenews_detail_state_empty')
      )}</div>`;
    } else {
      html += '<div class="row gap">';
      html += `<div class="badge">${escapeHtml(t('gamenews_detail_last_sent'))}: ${
        lastSent ? escapeHtml(lastSent) : '-'
      }</div>`;
      html += `<div class="badge">${escapeHtml(t('gamenews_detail_fail_count'))}: ${String(failCount)}</div>`;
      html += '</div>';

      if (pausedUntil) {
        html += '<div class="row">';
        html += `<div class="col"><strong>${escapeHtml(
          t('gamenews_detail_paused_until')
        )}:</strong> ${escapeHtml(pausedUntil)}</div>`;
        html += '</div>';
      }

      if (lastError) {
        html += '<div class="row">';
        html += `<div class="col"><strong>${escapeHtml(
          t('gamenews_detail_last_error')
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
        const raw = intEl.value.trim();
        if (!raw) {
          target.intervalMs = null;
        } else {
          const mins = Number(raw.replace(',', '.'));
          const MIN = 1;             // 1 minuto
          const MAX = 7 * 24 * 60;   // 7 dias em minutos

          if (Number.isFinite(mins) && mins > 0) {
            const clamped = Math.max(MIN, Math.min(MAX, mins));
            target.intervalMs = Math.round(clamped * 60 * 1000);
            if (clamped !== mins) {
              intEl.value = String(clamped);
            }
          } else {
            target.intervalMs = null;
          }
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
          saveGameNewsFeeds().catch(function (e) {
            toast((e && e.apiMessage) || t('gamenews_error_generic'));
          });
        } else if (action === 'toggle-enabled') {
          target.enabled = !target.enabled;
          saveGameNewsFeeds().catch(function (e) {
            toast((e && e.apiMessage) || t('gamenews_error_generic'));
          });
        } else if (action === 'test') {
          // Manual test: ask backend to send one recent news item for this feed
          const guildParam = getGuildParam();

          // If this feed has no DB id yet, force-save first so the backend can identify it.
          const initialFeedId = target.id || target._id || target._mongoId || null;

          const runTest = function (feedId) {
            return apiPost('/gamenews/test' + guildParam, {
              guildId: state.guildId,
              feedId: feedId
            }).then(function (res) {
              if (res && res.ok) {
                toast(t('gamenews_test_success') || 'Teste enviado. Verifica o canal no Discord.');
              } else {
                toast(t('gamenews_test_error') || 'Falha ao testar o feed.');
              }
            });
          };

          (async function () {
            try {
              btn.disabled = true;
              if (initialFeedId) {
                await runTest(initialFeedId);
                return;
              }

              toast(t('gamenews_test_requires_save') || 'Guarda o feed antes de testar. A guardar agora...');
              await saveGameNewsFeeds();

              // After save, try to locate the matching feed in updated state.
              const current = Array.isArray(state.gameNewsFeeds) ? state.gameNewsFeeds[idx] : null;
              const savedId = current && (current.id || current._id || current._mongoId) ? (current.id || current._id || current._mongoId) : null;
              if (!savedId) {
                throw new Error('Missing feed id after save');
              }
              await runTest(savedId);
            } catch (e) {
              toast((e && e.apiMessage) || (e && e.message) || (t('gamenews_test_error') || 'Falha ao testar o feed.'));
            } finally {
              btn.disabled = false;
            }
          })();
        } else if (action === 'remove') {
          // Remove do state, ajusta seleção e persiste na BD
          state.gameNewsFeeds.splice(idx, 1);

          if (!state.gameNewsFeeds.length) {
            state.activeGameNewsFeedIndex = null;
            renderGameNewsFeedsList(state.gameNewsFeeds);
            detailEl.innerHTML = `<div class="empty">${escapeHtml(t('gamenews_detail_empty'))}</div>`;
          } else {
            const nextIndex = Math.max(0, Math.min(idx, state.gameNewsFeeds.length - 1));
            renderGameNewsFeedsList(state.gameNewsFeeds);
            selectGameNewsFeedByIndex(nextIndex);
          }

          saveGameNewsFeeds().catch(function (e) {
            toast((e && e.apiMessage) || t('gamenews_error_generic'));
          });
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
    let hadInvalidUrl = false;
    let hadInvalidChannel = false;

    const payloadFeeds = feeds
      .map(function (f) {
        if (!f) return null;
        const name = f.name || 'Feed';
        let feedUrl = (f.feedUrl != null ? String(f.feedUrl) : '').trim();
        const channelIdRaw = (f.channelId != null ? String(f.channelId) : '').trim();
        const rawLogChannelId = (f.logChannelId != null ? String(f.logChannelId) : '');
        const logChannelIdRaw = rawLogChannelId.trim();
        const enabled = f.enabled !== false;
        const intervalMs =
          typeof f.intervalMs === 'number' && f.intervalMs > 0 ? f.intervalMs : null;

        if (!feedUrl || !channelIdRaw) {
          hadInvalid = true;
          return null;
        }

        // Normalize common inputs: allow missing protocol and Discord mention formats.
        if (feedUrl && !/^https?:\/\//i.test(feedUrl) && /\./.test(feedUrl) && !/\s/.test(feedUrl)) {
          feedUrl = `https://${feedUrl}`;
        }

        const extractId = function (s) {
          if (!s) return '';
          const m = String(s).match(/\d{10,32}/);
          return m ? m[0] : '';
        };

        const channelId = extractId(channelIdRaw) || channelIdRaw;
        const logChannelId = extractId(logChannelIdRaw) || logChannelIdRaw;

        // Basic client-side validation to prevent accidental data loss.
        // Backend enforces URL validity too, but we give immediate feedback.
        try {
          const u = new URL(feedUrl);
          if (u.protocol !== 'http:' && u.protocol !== 'https:') {
            hadInvalidUrl = true;
            return null;
          }
        } catch (e) {
          hadInvalidUrl = true;
          return null;
        }

        if (!/^[0-9]{10,32}$/.test(channelId)) {
          hadInvalidChannel = true;
          return null;
        }

        if (logChannelId && !/^[0-9]{10,32}$/.test(logChannelId)) {
          hadInvalidChannel = true;
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

    if (hadInvalidUrl) {
      toast(t('gamenews_validation_invalid_url'));
      return;
    }
    if (hadInvalidChannel) {
      toast(t('gamenews_validation_invalid_channel'));
      return;
    }
    if (hadInvalid) {
      toast(t('gamenews_validation_missing'));
      return;
    }

    const body = {
      guildId: state.guildId,
      feeds: payloadFeeds
    };

    const guildParam = getGuildParam();

    const res = await apiPost('/gamenews/feeds' + guildParam, body);
    if (res && res.ok) {
      toast(t('gamenews_save_success'));
      // Atualizar state.gameNewsFeeds com o que vier da DB
      const returnedFeeds =
        (res && Array.isArray(res.items) && res.items) ||
        (res && Array.isArray(res.feeds) && res.feeds) ||
        null;

      if (returnedFeeds) {
        state.gameNewsFeeds = returnedFeeds.slice();
        renderGameNewsFeedsList(state.gameNewsFeeds);
        // Clamp active index if needed
        let idx = typeof state.activeGameNewsFeedIndex === 'number' ? state.activeGameNewsFeedIndex : 0;
        if (idx < 0) idx = 0;
        if (idx >= state.gameNewsFeeds.length) idx = state.gameNewsFeeds.length - 1;
        if (idx >= 0 && state.gameNewsFeeds.length) {
          selectGameNewsFeedByIndex(idx);
        }
      }
    } else {
      toast(t('gamenews_error_generic'));
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

    return window.OzarkDashboard.withLoading(function () {
      return Promise.all([
        apiGet('/gamenews/feeds' + guildParam),
        apiGet('/gamenews-status' + guildParam)
      ]).then(function (results) {
        const feedsRes = results[0];
        const statusRes = results[1];

        const feeds = (feedsRes && Array.isArray(feedsRes.items) ? feedsRes.items : []).slice();
        const statusItems = statusRes && Array.isArray(statusRes.items) ? statusRes.items : [];

        state.gameNewsFeeds = feeds;
        state.gameNewsStatusIndex = buildStatusIndex(statusItems);
        state.activeGameNewsFeedIndex = null;

        renderGameNewsFeedsList(feeds);

        // Limpar / preencher painel de detalhe
        if (detailEl) {
          if (!feeds.length) {
            detailEl.innerHTML = `<div class="empty">${escapeHtml(t('gamenews_detail_empty'))}</div>`;
          } else {
            selectGameNewsFeedByIndex(0);
          }
        }
      });
    }, {
      onStart: function () {
        listEl.innerHTML = `<div class="empty">${escapeHtml(t('loading'))}</div>`;
        if (detailEl) {
          detailEl.innerHTML = `<div class="empty">${escapeHtml(t('loading'))}</div>`;
        }
      },
      onError: function () {
        listEl.innerHTML = '';
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = t('gamenews_error_generic');
        listEl.appendChild(empty);
        if (detailEl) {
          detailEl.innerHTML = `<div class="empty">${escapeHtml(t('gamenews_detail_empty'))}</div>`;
        }
      }
    });
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
        selectGameNewsFeedByIndex(state.gameNewsFeeds.length - 1);
      });
    }
  });

  // ------------------------
  // Export para namespace global
  // ------------------------

  D.loadGameNews = loadGameNews;
})();