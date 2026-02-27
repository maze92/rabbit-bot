// public/js/dashboard.freetokeep.js

(function () {
  if (!window.OzarkDashboard) window.OzarkDashboard = {};

  function $(id) { return document.getElementById(id); }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function apiGet(url) {
    return await window.OzarkDashboard.apiGet(url);
  }
  async function apiPut(url, body) {
    return await window.OzarkDashboard.apiPut(url, body);
  }
  async function apiPost(url, body) {
    return await window.OzarkDashboard.apiPost(url, body);
  }

  function t(key) {
    try { return window.t ? window.t(key) : key; } catch { return key; }
  }

  function fmtDate(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return String(iso);
      return d.toLocaleString();
    } catch { return String(iso); }
  }

  function renderRecent(items) {
    const el = $('freeToKeepRecent');
    if (!el) return;
    const arr = Array.isArray(items) ? items : [];
    if (!arr.length) {
      el.innerHTML = `<div class="empty">${escapeHtml(t('freetokeep_recent_empty'))}</div>`;
      return;
    }

    el.innerHTML = arr.map(function (it, idx) {
      const title = escapeHtml(it.title || '');
      const platform = escapeHtml((it.platform || '').toUpperCase());
      const kind = escapeHtml((it.kind || 'freetokeep').toUpperCase());
      const when = escapeHtml(fmtDate(it.postedAt || it.createdAt));
      const worth = escapeHtml(it.worth || '');
      const end = escapeHtml(it.endDate || '');
      const meta = [kind, worth, end ? ('until ' + end) : ''].filter(Boolean).join(' — ');
      const link = it.url ? `<a class="link" href="${escapeHtml(it.url)}" target="_blank" rel="noopener">↗</a>` : '';
      return `
        <div class="list-item" role="button" tabindex="0" data-ftk-idx="${idx}">
          <div class="list-main">
            <div class="list-title">${title}</div>
            <div class="list-sub">${platform} • ${when}${meta ? ' • ' + meta : ''}</div>
          </div>
          <div class="list-actions">${link}</div>
        </div>`;
    }).join('');

    // click-to-preview
    el.querySelectorAll('[data-ftk-idx]').forEach(function (node) {
      node.addEventListener('click', function () {
        const idx = Number(node.getAttribute('data-ftk-idx'));
        const it = arr[idx];
        if (it) renderPreviewFromRecent(it);
      });
      node.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          const idx = Number(node.getAttribute('data-ftk-idx'));
          const it = arr[idx];
          if (it) renderPreviewFromRecent(it);
        }
      });
    });
  }

  function platformLabel(p) {
    if (p === 'epic') return 'Epic Games Store';
    if (p === 'steam') return 'Steam';
    if (p === 'ubisoft') return 'Ubisoft';
    return String(p || '').toUpperCase();
  }

  function buildPreviewHtml(p) {
    if (!p) return `<div class="empty">${escapeHtml(t('freetokeep_preview_empty'))}</div>`;
    const title = escapeHtml(p.title || '');
    const url = escapeHtml(p.url || '');
    const desc = escapeHtml(p.description || '');
    const thumb = escapeHtml(p.platformIcon || '');
    const image = escapeHtml(p.image || '');
    const footer = escapeHtml(p.footer || '');
    const buttons = Array.isArray(p.buttons) ? p.buttons : [];

    const btnHtml = buttons.map(function (b) {
      if (!b || !b.url) return '';
      return `<a class="embed-link-btn" href="${escapeHtml(b.url)}" target="_blank" rel="noopener">${escapeHtml(b.label || 'Open')} ↗</a>`;
    }).filter(Boolean).join('');

    return `
      <div class="embed-preview">
        <div class="embed-head">
          <div>
            <div class="embed-title">${url ? `<a href="${url}" target="_blank" rel="noopener">${title}</a>` : title}</div>
            <div class="embed-desc">${desc}</div>
          </div>
          ${thumb ? `<img class="embed-thumb" src="${thumb}" alt="${escapeHtml(platformLabel(p.platform))}" />` : ''}
        </div>
        ${image ? `<img class="embed-image" src="${image}" alt="${title}" />` : ''}
        ${btnHtml ? `<div class="embed-buttons">${btnHtml}</div>` : ''}
        ${footer ? `<div class="embed-footer">${footer}</div>` : ''}
      </div>
    `;
  }

  function renderPreview(payload) {
    const el = $('freeToKeepPreview');
    if (!el) return;
    el.innerHTML = buildPreviewHtml(payload);
    const hint = $('freeToKeepPreviewHint');
    if (hint) hint.style.display = 'none';
    window.OzarkDashboard._freeToKeepLastPreview = payload || null;
  }

  function renderPreviewFromRecent(it) {
    const kind = (it.kind || 'freetokeep');
    const worth = it.worth ? `~~${it.worth}~~` : '';
    const end = it.endDate ? String(it.endDate) : '';
    const untilPart = end ? (kind === 'freeweekend' ? `Free weekend until **${end}**` : `Free until **${end}**`) : (kind === 'freeweekend' ? 'Free weekend' : 'Free to keep');
    const description = [worth, untilPart].filter(Boolean).join(' ');
    renderPreview({
      title: it.title || '',
      url: it.url || '',
      description: description,
      image: it.image || '',
      platform: it.platform || '',
      platformIcon: it.platform === 'epic' ? 'https://cdn.simpleicons.org/epicgames/ffffff' : (it.platform === 'steam' ? 'https://cdn.simpleicons.org/steam/ffffff' : (it.platform === 'ubisoft' ? 'https://cdn.simpleicons.org/ubisoft/ffffff' : '')),
      footer: `via GamerPower • © ${it.publisher || platformLabel(it.platform)}`
    });
  }

  function fillChannels(channels, selectedId) {
    const sel = $('freeToKeepChannel');
    if (!sel) return;

    // Preserve current selection unless an explicit selectedId is provided.
    const keepCurrent = !selectedId;
    const current = keepCurrent ? (sel.value || '') : '';

    const arr = Array.isArray(channels) ? channels : [];
    const opts = [`<option value="">${escapeHtml(t('common_select_channel'))}</option>`];
    arr.forEach(function (ch) {
      if (!ch || !ch.id) return;
      const name = ch.name ? `#${ch.name}` : ch.id;
      opts.push(`<option value="${escapeHtml(ch.id)}">${escapeHtml(name)}</option>`);
    });
    sel.innerHTML = opts.join('');
    sel.value = selectedId || current || '';
  }

  async function loadFreeToKeep(force) {
    const guildId = (window.OzarkDashboard.getGuildId && window.OzarkDashboard.getGuildId()) || (window.OzarkDashboard.state && window.OzarkDashboard.state.guildId) || '';
    if (!guildId) return;

    const statusEl = $('freeToKeepStatus');
    if (statusEl) statusEl.textContent = '';

    // Ensure channels list is loaded (text channels)
    // NOTE: this project exposes channels under /api/guilds/:guildId/channels
    try {
      // OzarkDashboard.apiGet already prefixes API_BASE (/api)
      const ch = await apiGet('/guilds/' + encodeURIComponent(guildId) + '/channels');
      fillChannels(ch.items || [], '');
    } catch (e) {
      // Keep selector usable even if channels couldn't be loaded.
      fillChannels([], '');
    }

    try {
      const data = await apiGet('/freetokeep/config?guildId=' + encodeURIComponent(guildId));
      const cfg = data && data.config ? data.config : null;

      $('freeToKeepEnabled').checked = !!(cfg && cfg.enabled);
      $('freeToKeepChannel').value = (cfg && cfg.channelId) ? cfg.channelId : '';

      const pollMin = cfg && cfg.pollIntervalMs ? Math.round(cfg.pollIntervalMs / 60000) : 2;
      $('freeToKeepPollMinutes').value = String(pollMin);
      $('freeToKeepMaxPerCycle').value = String((cfg && cfg.maxPerCycle) ? cfg.maxPerCycle : 3);

      const p = (cfg && cfg.platforms) ? cfg.platforms : { epic: true, steam: true, ubisoft: true };
      $('freeToKeepEpic').checked = p.epic !== false;
      $('freeToKeepSteam').checked = p.steam !== false;
      $('freeToKeepUbisoft').checked = p.ubisoft !== false;

      const ot = (cfg && cfg.offerTypes) ? cfg.offerTypes : { freetokeep: true, freeweekend: false };
      $('freeToKeepTypeKeep').checked = ot.freetokeep !== false;
      $('freeToKeepTypeWeekend').checked = !!ot.freeweekend;

      const eo = (cfg && cfg.embedOptions) ? cfg.embedOptions : {};
      $('freeToKeepEmbedShowPrice').checked = eo.showPrice !== false;
      $('freeToKeepEmbedShowUntil').checked = eo.showUntil !== false;
      $('freeToKeepEmbedShowThumb').checked = eo.showThumbnail !== false;
      $('freeToKeepEmbedShowImage').checked = eo.showImage !== false;
      $('freeToKeepEmbedShowButtons').checked = eo.showButtons !== false;
      $('freeToKeepEmbedShowFooter').checked = eo.showFooter !== false;
      $('freeToKeepEmbedShowClient').checked = eo.showClientButton !== false;

      // Health panel
      const lastRun = cfg && cfg.lastRunAt ? cfg.lastRunAt : '';
      const lastErr = cfg && cfg.lastError ? cfg.lastError : '';
      const lr = $('freeToKeepLastRun');
      const le = $('freeToKeepLastError');
      if (lr) lr.textContent = lastRun ? fmtDate(lastRun) : '—';
      if (le) le.textContent = lastErr ? String(lastErr) : '—';
    } catch (e) {
      if (statusEl) statusEl.textContent = t('freetokeep_load_failed');
    }

    // Always refresh preview after loading config so the right-hand panel stays in sync.
    try { await previewNow(); } catch { /* ignore */ }

    try {
      const recent = await apiGet('/freetokeep/recent?guildId=' + encodeURIComponent(guildId));
      renderRecent(recent.items || []);
    } catch {
      renderRecent([]);
    }
  }

  async function saveFreeToKeep() {
    const guildId = (window.OzarkDashboard.getGuildId && window.OzarkDashboard.getGuildId()) || (window.OzarkDashboard.state && window.OzarkDashboard.state.guildId) || '';
    if (!guildId) return;

    const statusEl = $('freeToKeepStatus');
    if (statusEl) statusEl.textContent = '';

    const enabled = $('freeToKeepEnabled').checked;
    const channelId = $('freeToKeepChannel').value || '';
    const pollMin = Number($('freeToKeepPollMinutes').value || 2);
    const maxPerCycle = Number($('freeToKeepMaxPerCycle').value || 3);

    const body = {
      guildId: guildId,
      enabled: !!enabled,
      channelId: channelId,
      pollIntervalMs: Math.max(60_000, Math.min(30 * 60_000, Math.round(pollMin * 60_000))),
      maxPerCycle: Math.max(1, Math.min(10, Math.round(maxPerCycle))),
      platforms: {
        epic: !!$('freeToKeepEpic').checked,
        steam: !!$('freeToKeepSteam').checked,
        ubisoft: !!$('freeToKeepUbisoft').checked
      },
      offerTypes: {
        freetokeep: !!$('freeToKeepTypeKeep').checked,
        freeweekend: !!$('freeToKeepTypeWeekend').checked
      },
      embedOptions: {
        showPrice: !!$('freeToKeepEmbedShowPrice').checked,
        showUntil: !!$('freeToKeepEmbedShowUntil').checked,
        showThumbnail: !!$('freeToKeepEmbedShowThumb').checked,
        showImage: !!$('freeToKeepEmbedShowImage').checked,
        showButtons: !!$('freeToKeepEmbedShowButtons').checked,
        showFooter: !!$('freeToKeepEmbedShowFooter').checked,
        showClientButton: !!$('freeToKeepEmbedShowClient').checked
      }
    };

    try {
      await apiPut('/freetokeep/config', body);
      if (statusEl) statusEl.textContent = t('common_saved');
      await loadFreeToKeep(true);
    } catch (e) {
      if (statusEl) statusEl.textContent = t('common_save_failed');
    }
  }

  async function previewNow() {
    const guildId = (window.OzarkDashboard.getGuildId && window.OzarkDashboard.getGuildId()) || (window.OzarkDashboard.state && window.OzarkDashboard.state.guildId) || '';
    if (!guildId) return;

    const statusEl = $('freeToKeepStatus');
    if (statusEl) statusEl.textContent = '';

    const previewEl = $('freeToKeepPreview');
    if (previewEl) previewEl.classList.add('panel-loading');
    try {
      // Use current UI selections for preview.
      const qs = new URLSearchParams();
      qs.set('guildId', guildId);
      qs.set('epic', $('freeToKeepEpic').checked ? '1' : '0');
      qs.set('steam', $('freeToKeepSteam').checked ? '1' : '0');
      qs.set('ubisoft', $('freeToKeepUbisoft').checked ? '1' : '0');
      qs.set('keep', $('freeToKeepTypeKeep').checked ? '1' : '0');
      qs.set('weekend', $('freeToKeepTypeWeekend').checked ? '1' : '0');

      // Embed options
      qs.set('sp', $('freeToKeepEmbedShowPrice').checked ? '1' : '0');
      qs.set('su', $('freeToKeepEmbedShowUntil').checked ? '1' : '0');
      qs.set('st', $('freeToKeepEmbedShowThumb').checked ? '1' : '0');
      qs.set('si', $('freeToKeepEmbedShowImage').checked ? '1' : '0');
      qs.set('sb', $('freeToKeepEmbedShowButtons').checked ? '1' : '0');
      qs.set('sf', $('freeToKeepEmbedShowFooter').checked ? '1' : '0');
      qs.set('sc', $('freeToKeepEmbedShowClient').checked ? '1' : '0');

      const data = await apiGet('/freetokeep/preview?' + qs.toString());
      if (data && data.preview) {
        renderPreview(data.preview);
      } else {
        renderPreview(null);
      }
    } catch (e) {
      if (statusEl) statusEl.textContent = t('freetokeep_preview_failed');
    } finally {
      if (previewEl) previewEl.classList.remove('panel-loading');
    }
  }

  async function sendTest() {
    const guildId = (window.OzarkDashboard.getGuildId && window.OzarkDashboard.getGuildId()) || (window.OzarkDashboard.state && window.OzarkDashboard.state.guildId) || '';
    if (!guildId) return;

    const channelId = $('freeToKeepChannel') ? $('freeToKeepChannel').value : '';
    if (!channelId) {
      window.OzarkDashboard.toast && window.OzarkDashboard.toast(t('common_select_channel'), 'error');
      return;
    }

    const previewEl = $('freeToKeepPreview');
    if (previewEl) previewEl.classList.add('panel-loading');
    try {
      const body = {
        guildId: guildId,
        channelId: channelId,
        platforms: {
          epic: !!$('freeToKeepEpic').checked,
          steam: !!$('freeToKeepSteam').checked,
          ubisoft: !!$('freeToKeepUbisoft').checked
        },
        offerTypes: {
          freetokeep: !!$('freeToKeepTypeKeep').checked,
          freeweekend: !!$('freeToKeepTypeWeekend').checked
        },
        embedOptions: {
          showPrice: !!$('freeToKeepEmbedShowPrice').checked,
          showUntil: !!$('freeToKeepEmbedShowUntil').checked,
          showThumbnail: !!$('freeToKeepEmbedShowThumb').checked,
          showImage: !!$('freeToKeepEmbedShowImage').checked,
          showButtons: !!$('freeToKeepEmbedShowButtons').checked,
          showFooter: !!$('freeToKeepEmbedShowFooter').checked,
          showClientButton: !!$('freeToKeepEmbedShowClient').checked
        }
      };
      const res = await apiPost('/freetokeep/test-send', body);
      if (res && res.preview) renderPreview(res.preview);
      window.OzarkDashboard.toast && window.OzarkDashboard.toast(t('freetokeep_test_sent'), 'success');
      await loadFreeToKeep(true);
    } catch (e) {
      window.OzarkDashboard.toast && window.OzarkDashboard.toast(t('freetokeep_test_send_failed'), 'error');
    } finally {
      if (previewEl) previewEl.classList.remove('panel-loading');
    }
  }

  function setup() {
    const btn = $('freeToKeepSave');
    if (btn) btn.addEventListener('click', function () { saveFreeToKeep(); });

    const refresh = $('freeToKeepRefresh');
    if (refresh) refresh.addEventListener('click', function () { loadFreeToKeep(true); });

    const test = $('freeToKeepTest');
    if (test) test.addEventListener('click', function () { previewNow(); });

    const send = $('freeToKeepPreviewSend');
    if (send) send.addEventListener('click', function () { sendTest(); });

    // Live preview: any option change re-renders preview (debounced)
    let previewTimer = null;
    function schedulePreview() {
      if (previewTimer) clearTimeout(previewTimer);
      previewTimer = setTimeout(function () {
        previewNow();
      }, 250);
    }

    const liveIds = [
      'freeToKeepEpic', 'freeToKeepSteam', 'freeToKeepUbisoft',
      'freeToKeepTypeKeep', 'freeToKeepTypeWeekend',
      'freeToKeepEmbedShowPrice', 'freeToKeepEmbedShowUntil', 'freeToKeepEmbedShowThumb',
      'freeToKeepEmbedShowImage', 'freeToKeepEmbedShowButtons', 'freeToKeepEmbedShowFooter',
      'freeToKeepEmbedShowClient'
    ];
    liveIds.forEach(function (id) {
      const el = $(id);
      if (!el) return;
      el.addEventListener('change', schedulePreview);
    });
  }

  window.OzarkDashboard.loadFreeToKeep = loadFreeToKeep;
  window.addEventListener('DOMContentLoaded', setup);
})();
