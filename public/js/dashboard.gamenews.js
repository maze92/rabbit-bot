// GameNews module extension for OzarkDashboard
// Implementa a tab GameNews no mesmo padrão da tab Utilizadores:
// lista à esquerda + painel de detalhe à direita.

(function () {
  if (!window.OzarkDashboard) return;

  const D = window.OzarkDashboard;
  const state = D.state;
  const apiGet = D.apiGet;
  const apiPost = D.apiPost;
  const apiPatch = D.apiPatch;
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


function buildChannelOptions(channels, selectedId, allowNone) {
  const list = Array.isArray(channels) ? channels : [];
  const seen = new Set();
  let html = '';
  if (allowNone) {
    html += `<option value="">${escapeHtml(t('common_none_option') || '— None —')}</option>`;
  }
  list.forEach(function (ch) {
    if (!ch || !ch.id) return;
    const id = String(ch.id);
    if (seen.has(id)) return;
    seen.add(id);
    const name = ch.name ? String(ch.name) : id;
    const selected = selectedId && String(selectedId) === id ? ' selected' : '';
    html += `<option value="${escapeHtml(id)}"${selected}>#${escapeHtml(name)} (${escapeHtml(id)})</option>`;
  });

  // If current selection is not in the list (e.g., missing perms or a different channel type),
  // keep it selectable so saving doesn't wipe it.
  if (selectedId && !seen.has(String(selectedId))) {
    const id = String(selectedId);
    html += `<option value="${escapeHtml(id)}" selected>${escapeHtml(id)}</option>`;
  }
  return html;
}


function normalizeUrlMaybe(value) {
  if (!value) return '';
  const v = String(value).trim();
  if (!v) return '';
  // If user typed without protocol, assume https.
  if (!/^https?:\/\//i.test(v) && /^[\w.-]+\.[a-z]{2,}/i.test(v)) {
    return 'https://' + v;
  }
  return v;
}

function validateFeedConfig(feed) {
  const errors = {};
  const feedUrl = normalizeUrlMaybe(feed && feed.feedUrl);
  const channelId = (feed && feed.channelId != null ? String(feed.channelId).trim() : '');
  const maxPerCycleRaw = (feed && feed.maxPerCycle != null ? String(feed.maxPerCycle).trim() : '');
  if (!feedUrl) {
    errors.feedUrl = t('gamenews_validation_url_required');
  } else {
    // Be permissive: some valid RSS endpoints fail stricter URL parsing.
    // Backend also validates protocol and rejects whitespace.
    if (!/^https?:\/\/\S+$/i.test(feedUrl)) {
      errors.feedUrl = t('gamenews_validation_url_invalid');
    }
  }
  if (!channelId) {
    errors.channelId = t('gamenews_validation_channel_required');
  }

  if (maxPerCycleRaw) {
    const n = parseInt(maxPerCycleRaw, 10);
    if (!Number.isFinite(n) || n < 1 || n > 10) {
      errors.maxPerCycle = t('gamenews_validation_max_per_cycle_invalid');
    }
  }
  return { ok: Object.keys(errors).length === 0, errors, normalized: { feedUrl, channelId } };
}

function setFieldError(el, msg) {
  if (!el) return;
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
}

function setInputError(inputEl, hasError) {
  if (!inputEl) return;
  if (hasError) inputEl.classList.add('input-error');
  else inputEl.classList.remove('input-error');
}

  

  // ------------------------
  // Dirty-state (unsaved changes) tracking for GameNews editor
  // ------------------------

  function ensureGameNewsMaps() {
    if (!state.gameNewsOriginalByKey) state.gameNewsOriginalByKey = {};
  }

  function feedKey(feed) {
    if (!feed) return '';
    const id = feed.id || feed._id || feed._mongoId;
    if (id) return String(id);
    return makeStatusKey(feed);
  }

  function snapshotFeed(feed) {
    if (!feed) return '';
    const url = normalizeUrlMaybe(feed.feedUrl);
    const channelId = (feed.channelId != null ? String(feed.channelId).trim() : '');
    const logChannelId = (feed.logChannelId != null ? String(feed.logChannelId).trim() : '');
    const name = feed.name != null ? String(feed.name).trim() : '';
    const enabled = feed.enabled !== false;
    const intervalMs = (typeof feed.intervalMs === 'number' && Number.isFinite(feed.intervalMs) && feed.intervalMs > 0) ? Math.round(feed.intervalMs) : null;
    const maxPerCycle = (typeof feed.maxPerCycle === 'number' && Number.isFinite(feed.maxPerCycle)) ? Math.round(feed.maxPerCycle) : null;
    return JSON.stringify({
      name,
      feedUrl: url,
      channelId,
      logChannelId: logChannelId || null,
      enabled,
      intervalMs,
      maxPerCycle
    });
  }

  function setOriginalForFeeds(feeds) {
    ensureGameNewsMaps();
    const map = {};
    (Array.isArray(feeds) ? feeds : []).forEach(function (f) {
      const k = feedKey(f);
      if (!k) return;
      map[k] = snapshotFeed(f);
    });
    state.gameNewsOriginalByKey = map;
  }

  function isFeedDirty(feed) {
    ensureGameNewsMaps();
    const k = feedKey(feed);
    if (!k) return true;
    const orig = state.gameNewsOriginalByKey[k];
    if (!orig) return true; // new/unsaved feed
    return snapshotFeed(feed) !== orig;
  }

  function pruneOriginalMap(feeds) {
    ensureGameNewsMaps();
    const keep = new Set();
    (Array.isArray(feeds) ? feeds : []).forEach(function (f) {
      const k = feedKey(f);
      if (k) keep.add(k);
    });
    const next = {};
    Object.keys(state.gameNewsOriginalByKey).forEach(function (k) {
      if (keep.has(k)) next[k] = state.gameNewsOriginalByKey[k];
    });
    state.gameNewsOriginalByKey = next;
  }

  function updateGameNewsFeedRowByIndex(idx) {
    const listEl = document.getElementById('gamenewsFeedsList');
    if (!listEl) return;
    const row = listEl.querySelector('.list-item[data-index="' + String(idx) + '"]');
    if (!row) return;
    const f = Array.isArray(state.gameNewsFeeds) ? state.gameNewsFeeds[idx] : null;
    if (!f) return;

    const nameEl = row.querySelector('.title');
    const badgeEl = row.querySelector('.user-type-badge');
    const subtitleEl = row.querySelector('.subtitle');
    if (!nameEl || !badgeEl || !subtitleEl) return;

    const name = f.name || 'Feed';
    const feedUrl = f.feedUrl || '';
    const channelId = f.channelId || '';
    const enabled = f.enabled !== false;

    const v = validateFeedConfig({ feedUrl: feedUrl, channelId: channelId });
    const complete = v && v.ok;

    const st = state.gameNewsStatusIndex ? state.gameNewsStatusIndex[makeStatusKey(f)] : null;
    const hasStatusError = !!(st && st.lastError);

    const dirty = isFeedDirty(f);

    let badgeClass = 'human';
    let badgeText = t('gamenews_feed_status_on');
    if (!complete) {
      badgeClass = 'warn';
      badgeText = t('gamenews_feed_status_incomplete');
    } else if (dirty) {
      badgeClass = 'warn';
      badgeText = t('gamenews_feed_status_dirty');
    } else if (hasStatusError) {
      badgeClass = 'error';
      badgeText = t('gamenews_feed_status_error');
    } else {
      badgeClass = enabled ? 'human' : 'bot';
      badgeText = enabled ? t('gamenews_feed_status_on') : t('gamenews_feed_status_off');
    }

    nameEl.textContent = name;
    badgeEl.className = 'user-type-badge ' + badgeClass;
    badgeEl.textContent = badgeText;

    // Secondary info: URL + channel + rate limiting (interval/max)
    const intervalMs =
      typeof f.intervalMs === 'number' && Number.isFinite(f.intervalMs) && f.intervalMs > 0
        ? Math.round(f.intervalMs)
        : null;
    const intervalMin = intervalMs ? Math.max(1, Math.round(intervalMs / 60000)) : null;
    const maxPerCycle =
      typeof f.maxPerCycle === 'number' && Number.isFinite(f.maxPerCycle)
        ? Math.round(f.maxPerCycle)
        : null;

    const bits = [];
    if (feedUrl) bits.push(feedUrl);
    if (channelId) bits.push(channelId);
    if (intervalMin) bits.push((t('gamenews_feed_interval_short') || 'int') + ': ' + intervalMin + 'm');
    if (maxPerCycle) bits.push((t('gamenews_feed_max_short') || 'max') + ': ' + maxPerCycle);
    subtitleEl.textContent = bits.join(' • ');

    if (dirty) row.classList.add('dirty');
    else row.classList.remove('dirty');
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
      const intervalMs =
        typeof f.intervalMs === 'number' && Number.isFinite(f.intervalMs) && f.intervalMs > 0
          ? Math.round(f.intervalMs)
          : null;
      const intervalMin = intervalMs ? Math.max(1, Math.round(intervalMs / 60000)) : null;
      const maxPerCycle =
        typeof f.maxPerCycle === 'number' && Number.isFinite(f.maxPerCycle)
          ? Math.round(f.maxPerCycle)
          : null;

      const subtitleBits = [];
      if (feedUrl) subtitleBits.push(feedUrl);
      if (channelId) subtitleBits.push(channelId);
      if (intervalMin) subtitleBits.push((t('gamenews_feed_interval_short') || 'int') + ': ' + intervalMin + 'm');
      if (maxPerCycle) subtitleBits.push((t('gamenews_feed_max_short') || 'max') + ': ' + maxPerCycle);
      // Badge will be updated after render (dirty/error/incomplete/on/off)
      const badgeClass = 'human';
      const badgeText = t('gamenews_feed_status_on');

      row.innerHTML = `
        <div class="user-row-header">
          <div class="title">${escapeHtml(name)}</div>
          <div class="user-type-badge ${badgeClass}">
            ${escapeHtml(badgeText)}
          </div>
        </div>
        <div class="subtitle">
          ${escapeHtml(subtitleBits.join(' • '))}
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
      updateGameNewsFeedRowByIndex(idx);
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

      const prevIdx = state.activeGameNewsFeedIndex;
      if (typeof prevIdx === 'number' && prevIdx !== numericIdx) {
        const prevFeed = state.gameNewsFeeds[prevIdx];
        if (prevFeed && isFeedDirty(prevFeed)) {
          toast(t('gamenews_unsaved_changes_notice') || 'Tens alterações por guardar noutro feed.');
        }
      }

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
        try {
          if (window.OzarkDashboard && typeof window.OzarkDashboard.setPanelLoading === 'function') {
            window.OzarkDashboard.setPanelLoading('gamenewsFeedDetailPanel', true);
          }
        } catch (e) {}
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
    try {
      if (window.OzarkDashboard && typeof window.OzarkDashboard.setPanelLoading === 'function') {
        window.OzarkDashboard.setPanelLoading('gamenewsFeedDetailPanel', false);
      }
    } catch (e) {}
      return;
    }

    const statusIndex = state.gameNewsStatusIndex || {};
    const statusKey = makeStatusKey(feed);
    const st = statusIndex[statusKey] || null;

    const feedName = feed.name || 'Feed';
    const feedUrl = feed.feedUrl || '';
    const channelId = feed.channelId || '';
    const logChannelId = feed.logChannelId || '';

    const channels = Array.isArray(state.gamenewsChannels) ? state.gamenewsChannels : [];
    const channelOptionsHtml = buildChannelOptions(channels, channelId, false);
    const logChannelOptionsHtml = buildChannelOptions(channels, logChannelId, true);

    const enabled = feed.enabled !== false;
    const intervalMs = typeof feed.intervalMs === 'number' ? feed.intervalMs : null;
    const intervalMinutes = intervalMs ? formatIntervalMinutes(intervalMs) : '';
    const maxPerCycle = (typeof feed.maxPerCycle === 'number' && Number.isFinite(feed.maxPerCycle)) ? feed.maxPerCycle : null;

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
    html += `<input type="text" class="input" id="gnDetailUrl" value="${escapeHtml(feedUrl)}">
    <div class="field-error" id="gnErrUrl" style="display:none"></div>`;
    html += '</div>';
    html += '</div>';

    html += '<div class="row gap">';
    html += '<div class="col">';
    html += `<label for="gnDetailChannel">${escapeHtml(t('gamenews_feed_channel_label'))}</label>`;
    html += `<select class="input" id="gnDetailChannel">${channelOptionsHtml}</select>
    <div class="field-error" id="gnErrChannel" style="display:none"></div>`;
    html += '</div>';
    html += '<div class="col">';
    html += `<label for="gnDetailLogChannel">${escapeHtml(
      t('gamenews_feed_log_channel_label')
    )}</label>`;
    html += `<select class="input" id="gnDetailLogChannel">${logChannelOptionsHtml}</select>`;
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
    html += '<div class="col">';
    html += `<label for="gnDetailMaxPerCycle">${escapeHtml(
      t('gamenews_feed_max_per_cycle_label')
    )}</label>`;
    html += `<input
      type="number"
      min="1"
      max="10"
      step="1"
      class="input"
      id="gnDetailMaxPerCycle"
      value="${maxPerCycle != null ? String(maxPerCycle) : ''}"
      placeholder="${escapeHtml(t('gamenews_feed_max_per_cycle_placeholder'))}"
    >`;
    html += `<div class="field-error" id="gnErrMaxPerCycle" style="display:none"></div>`;
    html += `<p class="hint" style="margin-top:6px;">${escapeHtml(t('gamenews_feed_max_per_cycle_hint'))}</p>`;
    html += '</div>';
    html += '</div>';

    html += '</div>'; // /history-section config
// Secção Ações rápidas (mesmo estilo dos utilizadores)
    html += '<div class="history-section user-actions gamenews-detail-actions">';
    html += `<h3>${escapeHtml(t('gamenews_detail_actions_title') || t('users_actions_title'))}</h3>`;
    html += '<div class="badge-row user-actions-buttons">';
    html += `<button type="button" class="btn xs gamenews-action btn-save" data-action="save">${escapeHtml(t('gamenews_detail_action_save'))}</button>`;
    html += `<button type="button" class="btn xs gamenews-action btn-cancel" data-action="cancel">${escapeHtml(t('gamenews_detail_action_cancel'))}</button>`;
    html += `<button type="button" class="btn xs gamenews-action btn-toggle-enabled" data-action="toggle-enabled">${escapeHtml(t('gamenews_detail_action_toggle'))}</button>`;
    html += `<button type="button" class="btn xs gamenews-action btn-remove" data-action="remove">${escapeHtml(t('gamenews_detail_action_remove'))}</button>`;

    html += '</div>';
    html += `<div class="history-hint" id="gnDirtyHint" style="display:none"></div>`;
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

    try {
      if (window.OzarkDashboard && typeof window.OzarkDashboard.setPanelLoading === 'function') {
        window.OzarkDashboard.setPanelLoading('gamenewsFeedDetailPanel', false);
      }
    } catch (e) {}

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
      const maxEl = detailEl.querySelector('#gnDetailMaxPerCycle');

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

      if (maxEl) {
        const raw = String(maxEl.value || '').trim();
        if (!raw) {
          target.maxPerCycle = null;
        } else {
          const n = parseInt(raw, 10);
          if (Number.isFinite(n)) {
            const clamped = Math.max(1, Math.min(10, n));
            target.maxPerCycle = clamped;
            if (clamped !== n) maxEl.value = String(clamped);
          } else {
            target.maxPerCycle = null;
          }
        }
      }


      // Validation + UI (inline)
      const v = validateFeedConfig(target);
      // Keep normalized values (e.g. auto-add https://)
      if (v && v.normalized) {
        if (v.normalized.feedUrl) target.feedUrl = v.normalized.feedUrl;
        if (v.normalized.channelId) target.channelId = v.normalized.channelId;
        if (urlEl && v.normalized.feedUrl && urlEl.value.trim() !== v.normalized.feedUrl) {
          urlEl.value = v.normalized.feedUrl;
        }
      }

      setFieldError(detailEl.querySelector('#gnErrUrl'), v.errors && v.errors.feedUrl);
      setFieldError(detailEl.querySelector('#gnErrChannel'), v.errors && v.errors.channelId);
      setFieldError(detailEl.querySelector('#gnErrMaxPerCycle'), v.errors && v.errors.maxPerCycle);
      setInputError(urlEl, !!(v.errors && v.errors.feedUrl));
      setInputError(chEl, !!(v.errors && v.errors.channelId));
      setInputError(maxEl, !!(v.errors && v.errors.maxPerCycle));

      const btnSave = detailEl.querySelector('.gamenews-action[data-action="save"]');
      const btnCancel = detailEl.querySelector('.gamenews-action[data-action="cancel"]');
      const dirty = isFeedDirty(target);

      const dirtyHintEl = detailEl.querySelector('#gnDirtyHint');
      if (dirtyHintEl) {
        const msg = dirty ? (t('gamenews_detail_unsaved') || 'Alterações por guardar neste feed.') : '';
        dirtyHintEl.textContent = msg;
        dirtyHintEl.style.display = dirty ? 'block' : 'none';
      }

      if (btnSave) btnSave.disabled = !v.ok || !dirty;
      if (btnCancel) btnCancel.disabled = !dirty;

      updateGameNewsFeedRowByIndex(idx);

    }


    detailEl
      .querySelectorAll(
        '#gnDetailName,#gnDetailUrl,#gnDetailChannel,#gnDetailLogChannel,#gnDetailInterval,#gnDetailMaxPerCycle'
      )
      .forEach(function (el) {
        el.addEventListener('input', syncFromInputs);
        el.addEventListener('change', syncFromInputs);
      });

    // Inicializar validação
    syncFromInputs();

    // Ações rápidas
    const actionButtons = detailEl.querySelectorAll('.gamenews-action');
    actionButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        const action = btn.getAttribute('data-action');
        if (action === 'save') {
          syncFromInputs();
          const v = validateFeedConfig(target);
          if (!v.ok) {
            toast((v.errors && (v.errors.feedUrl || v.errors.channelId)) || t('gamenews_validation_fix_errors'));
            return;
          }
          saveGameNewsFeeds().catch(function (e) {
            toast((e && e.apiMessage) || t('gamenews_error_generic'));
          });
        } else if (action === 'toggle-enabled') {
          const prev = target.enabled;
          target.enabled = !target.enabled;
          syncFromInputs();
          const v = validateFeedConfig(target);
          if (!v.ok) {
            target.enabled = prev;
            toast((v.errors && (v.errors.feedUrl || v.errors.channelId)) || t('gamenews_validation_fix_errors'));
            return;
          }
          saveGameNewsFeeds().catch(function (e) {
            toast((e && e.apiMessage) || t('gamenews_error_generic'));
          });
        } else if (action === 'cancel') {
          // Reverter alterações locais para o snapshot original (ou defaults se for um feed novo)
          const k = feedKey(target);
          const orig = (state.gameNewsOriginalByKey && k) ? state.gameNewsOriginalByKey[k] : null;
          if (orig) {
            try {
              const snap = JSON.parse(orig);
              target.name = snap.name || 'Feed';
              target.feedUrl = snap.feedUrl || '';
              target.channelId = snap.channelId || '';
              target.logChannelId = snap.logChannelId || null;
              target.enabled = snap.enabled !== false;
              target.intervalMs = typeof snap.intervalMs === 'number' ? snap.intervalMs : null;
              target.maxPerCycle = typeof snap.maxPerCycle === 'number' ? snap.maxPerCycle : null;
            } catch (e) {
              // fallback para defaults
              target.name = 'Feed';
              target.feedUrl = '';
              target.channelId = '';
              target.logChannelId = null;
              target.enabled = true;
              target.intervalMs = null;
              target.maxPerCycle = null;
            }
          } else {
            target.name = 'Feed';
            target.feedUrl = '';
            target.channelId = '';
            target.logChannelId = null;
            target.enabled = true;
            target.intervalMs = null;
            target.maxPerCycle = null;
          }

          updateGameNewsFeedRowByIndex(idx);
          renderGameNewsFeedDetail(target);
        } else if (action === 'remove') {
          // Remove do state, ajusta seleção e persiste na BD
          state.gameNewsFeeds.splice(idx, 1);
          pruneOriginalMap(state.gameNewsFeeds);

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
        const maxPerCycle =
          typeof f.maxPerCycle === 'number' && Number.isFinite(f.maxPerCycle) ? Math.round(f.maxPerCycle) : null;

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
        // Be permissive; backend enforces protocol and rejects whitespace.
        if (!/^https?:\/\/\S+$/i.test(feedUrl)) {
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
          intervalMs: intervalMs,
          maxPerCycle: maxPerCycle
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
    let res = null;
    try {
      res = await apiPost('/gamenews/feeds' + guildParam, body);
    } catch (err) {
      // Surface backend validation details (helps diagnose 400s without opening DevTools)
      const details = err && err.payload && err.payload.details;
      if (Array.isArray(details) && details.length) {
        const first = details[0];
        const issue = first && Array.isArray(first.issues) && first.issues.length ? first.issues[0] : null;
        const msg = issue && issue.message ? String(issue.message) : null;
        toast(msg ? (t('gamenews_error_generic') + ': ' + msg) : ((err && err.apiMessage) || t('gamenews_error_generic')));
      } else {
        toast((err && err.apiMessage) || t('gamenews_error_generic'));
      }
      return;
    }

    if (res && res.ok) {
      toast(t('gamenews_save_success'));
      // Atualizar state.gameNewsFeeds com o que vier da DB
      const returnedFeeds =
        (res && Array.isArray(res.items) && res.items) ||
        (res && Array.isArray(res.feeds) && res.feeds) ||
        null;

      // Alguns backends respondem apenas { ok: true } sem devolver a lista.
      // Para não perder alterações locais (ex.: maxPerCycle), se não vier payload mantemos local.
      if (!returnedFeeds) {
        setOriginalForFeeds(state.gameNewsFeeds);
        renderGameNewsFeedsList(state.gameNewsFeeds);
        const idx = typeof state.activeGameNewsFeedIndex === 'number' ? state.activeGameNewsFeedIndex : null;
        if (idx != null && idx >= 0 && state.gameNewsFeeds && state.gameNewsFeeds[idx]) {
          selectGameNewsFeedByIndex(idx);
        }
        return;
      }

      // Merge conservador: se o backend não devolver maxPerCycle/intervalMs/logChannelId,
      // preservamos os valores do estado local para evitar “sumir até refresh”.
      const localFeeds = Array.isArray(state.gameNewsFeeds) ? state.gameNewsFeeds : [];
      const merged = returnedFeeds.map(function (rf) {
        if (!rf) return rf;
        const key = makeStatusKey(rf);
        const lf = localFeeds.find(function (x) {
          return makeStatusKey(x) === key;
        });
        if (lf) {
          if (rf.maxPerCycle == null && lf.maxPerCycle != null) rf.maxPerCycle = lf.maxPerCycle;
          if (rf.intervalMs == null && lf.intervalMs != null) rf.intervalMs = lf.intervalMs;
          if (rf.logChannelId == null && lf.logChannelId != null) rf.logChannelId = lf.logChannelId;
          if (rf.enabled == null && lf.enabled != null) rf.enabled = lf.enabled;
          if (!rf.name && lf.name) rf.name = lf.name;
        }
        return rf;
      });

      state.gameNewsFeeds = merged.slice();
      setOriginalForFeeds(state.gameNewsFeeds);
      renderGameNewsFeedsList(state.gameNewsFeeds);
      // Clamp active index if needed
      let idx = typeof state.activeGameNewsFeedIndex === 'number' ? state.activeGameNewsFeedIndex : 0;
      if (idx < 0) idx = 0;
      if (idx >= state.gameNewsFeeds.length) idx = state.gameNewsFeeds.length - 1;
      if (idx >= 0 && state.gameNewsFeeds.length) {
        selectGameNewsFeedByIndex(idx);
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
        apiGet('/gamenews-status' + guildParam),
        apiGet('/guilds/' + encodeURIComponent(state.guildId) + '/meta')
      ]).then(function (results) {
        const feedsRes = results[0];
        const statusRes = results[1];
        const metaRes = results[2];

        // Cache channels list for nicer selectors in the detail panel
        state.gamenewsChannels = (metaRes && Array.isArray(metaRes.channels)) ? metaRes.channels : [];

        const feeds = (feedsRes && Array.isArray(feedsRes.items) ? feedsRes.items : []).slice();
        const statusItems = statusRes && Array.isArray(statusRes.items) ? statusRes.items : [];

        state.gameNewsFeeds = feeds;
        setOriginalForFeeds(feeds);
        state.gameNewsStatusIndex = buildStatusIndex(statusItems);
        state.activeGameNewsFeedIndex = null;

        renderGameNewsFeedsList(feeds);

        // Painel de detalhe: não selecionar automaticamente (só abre ao clicar num feed)
        if (detailEl) {
          detailEl.innerHTML = `<div class="empty">${escapeHtml(t('gamenews_detail_empty'))}</div>`;
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
