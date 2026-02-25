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

    el.innerHTML = arr.map(function (it) {
      const title = escapeHtml(it.title || '');
      const platform = escapeHtml((it.platform || '').toUpperCase());
      const when = escapeHtml(fmtDate(it.postedAt || it.createdAt));
      const worth = escapeHtml(it.worth || '');
      const end = escapeHtml(it.endDate || '');
      const meta = [worth, end ? ('until ' + end) : ''].filter(Boolean).join(' — ');
      const link = it.url ? `<a class="link" href="${escapeHtml(it.url)}" target="_blank" rel="noopener">↗</a>` : '';
      return `
        <div class="list-item">
          <div class="list-main">
            <div class="list-title">${title}</div>
            <div class="list-sub">${platform} • ${when}${meta ? ' • ' + meta : ''}</div>
          </div>
          <div class="list-actions">${link}</div>
        </div>`;
    }).join('');
  }

  function fillChannels(channels, selectedId) {
    const sel = $('freeToKeepChannel');
    if (!sel) return;

    const arr = Array.isArray(channels) ? channels : [];
    const opts = [`<option value="">${escapeHtml(t('common_select_channel'))}</option>`];
    arr.forEach(function (ch) {
      if (!ch || !ch.id) return;
      const name = ch.name ? `#${ch.name}` : ch.id;
      opts.push(`<option value="${escapeHtml(ch.id)}">${escapeHtml(name)}</option>`);
    });
    sel.innerHTML = opts.join('');
    sel.value = selectedId || '';
  }

  async function loadFreeToKeep(force) {
    const guildId = window.OzarkDashboard.getGuildId && window.OzarkDashboard.getGuildId();
    if (!guildId) return;

    const statusEl = $('freeToKeepStatus');
    if (statusEl) statusEl.textContent = '';

    // Ensure channels list is loaded
    try {
      const ch = await apiGet('/api/core/channels?guildId=' + encodeURIComponent(guildId));
      fillChannels(ch.channels || [], '');
    } catch (e) {
      // silent
    }

    try {
      const data = await apiGet('/api/freetokeep/config?guildId=' + encodeURIComponent(guildId));
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
    } catch (e) {
      if (statusEl) statusEl.textContent = t('freetokeep_load_failed');
    }

    try {
      const recent = await apiGet('/api/freetokeep/recent?guildId=' + encodeURIComponent(guildId));
      renderRecent(recent.items || []);
    } catch {
      renderRecent([]);
    }
  }

  async function saveFreeToKeep() {
    const guildId = window.OzarkDashboard.getGuildId && window.OzarkDashboard.getGuildId();
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
      }
    };

    try {
      await apiPut('/api/freetokeep/config', body);
      if (statusEl) statusEl.textContent = t('common_saved');
      await loadFreeToKeep(true);
    } catch (e) {
      if (statusEl) statusEl.textContent = t('common_save_failed');
    }
  }

  function setup() {
    const btn = $('freeToKeepSave');
    if (btn) btn.addEventListener('click', function () { saveFreeToKeep(); });
  }

  window.OzarkDashboard.loadFreeToKeep = loadFreeToKeep;
  window.addEventListener('DOMContentLoaded', setup);
})();
