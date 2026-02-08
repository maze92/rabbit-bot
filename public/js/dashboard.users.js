// Users module extension for OzarkDashboard
// Lógica da tab de Utilizadores extraída para este módulo.
// Este ficheiro substitui OzarkDashboard.loadUsers e OzarkDashboard.loadUserHistory
// pelas implementações reais, usando o namespace global.

(function () {
  if (!window.OzarkDashboard) return;

  const D = window.OzarkDashboard;
  const state = D.state;
  const apiGet = D.apiGet;
  const apiPost = D.apiPost;
  const toast = D.toast;
  const t = D.t;
  let userHistoryAbortController = null;
  const escapeHtml = D.escapeHtml;

  function buildUserRow(u, listEl) {
    if (!u || u.bot) return null;

    const row = document.createElement('div');
    row.className = 'list-item';
    row.dataset.userId = u.id || '';
    row.dataset.username = u.username || u.tag || u.id || '';

    const name = u.username || u.tag || u.id;
    const roles = (u.roles || []).map(function (r) { return r.name; }).join(', ');
    const isBot = !!u.bot;

    row.innerHTML = `
      <div class="user-row-header">
        <div class="title">${escapeHtml(name)}</div>
        <div class="user-type-badge ${isBot ? 'bot' : 'human'}">
          ${escapeHtml(isBot ? (t('users_row_bot')) : (t('users_row_user')))}
        </div>
      </div>
      <div class="subtitle">
        ${escapeHtml(u.id)}${roles ? ' • ' + escapeHtml(roles) : ''}
      </div>
    `;

    row.addEventListener('click', function () {
      const previouslyActive = listEl.querySelector('.list-item.active');
      if (previouslyActive) previouslyActive.classList.remove('active');
      row.classList.add('active');

      state.selectedUserId = u.id || null;
      loadUserHistory(u);
    });

    return row;
  }

  function appendUserRows(listEl, items) {
    if (!Array.isArray(items) || !items.length) return;
    items.forEach(function (u) {
      const row = buildUserRow(u, listEl);
      if (row) listEl.appendChild(row);
    });
  }


  async function loadUsers() {
  const listEl = document.getElementById('usersList');
  const searchEl = document.getElementById('usersSearch');
  const limitEl = document.getElementById('usersLimit');
  const btnLoadMore = document.getElementById('btnUsersLoadMore');

  if (!listEl) return;

  // Atualizar contador de membros (se soubermos)
  const membersLabel = document.getElementById('usersMemberCount');
  if (membersLabel) {
    const guildInfo = Array.isArray(state.guilds)
      ? state.guilds.find(function (g) { return g && g.id === state.guildId; })
      : null;
    if (guildInfo && typeof guildInfo.memberCount === 'number') {
      membersLabel.textContent = state.lang === 'pt'
        ? (guildInfo.memberCount + ' membros')
        : (guildInfo.memberCount + ' members');
    } else {
      membersLabel.textContent = '';
    }
  }

  if (!state.guildId) {
    listEl.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = t('users_select_guild');
    listEl.appendChild(empty);
    if (btnLoadMore) btnLoadMore.style.display = 'none';
    return;
  }

  const guildId = state.guildId;
  const search = (searchEl && searchEl.value ? searchEl.value.toString().trim() : '');
  let limit = 50;
  if (limitEl && limitEl.value) {
    const n = Number(limitEl.value);
    if (Number.isFinite(n) && n > 0) limit = n;
  }

  state.usersPage = 1;
  state.usersSearch = search;
  state.usersLimit = limit;

  function setLoadMoreVisible(visible) {
    if (!btnLoadMore) return;
    btnLoadMore.style.display = visible ? '' : 'none';
    btnLoadMore.disabled = !visible;
  }

  function renderUsers(items, append) {
    if (!append) listEl.innerHTML = '';

    if (!Array.isArray(items) || !items.length) {
      if (!append) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = t('users_empty_generic');
        listEl.appendChild(empty);
      }
      return;
    }

    appendUserRows(listEl, items);
  }

  async function fetchPage(page, opts) {
    const append = !!(opts && opts.append);
    const sync = !!(opts && opts.sync);

    const params = [];
    params.push('page=' + encodeURIComponent(String(page)));
    params.push('limit=' + encodeURIComponent(String(limit)));
    if (search) params.push('search=' + encodeURIComponent(search));
    if (sync) params.push('sync=1');

    const url = '/guilds/' + encodeURIComponent(guildId) + '/users?' + params.join('&');
    const res = await apiGet(url);

    const items = Array.isArray(res.items) ? res.items : [];
    const total = typeof res.total === 'number' ? res.total : items.length;

    // Render
    renderUsers(items, append);

    // Load more
    const hasMore = (page * limit) < total;
    setLoadMoreVisible(hasMore);

    state.usersPage = page;
    state.usersTotal = total;

    // Auto-select user previously selected (only on first page render)
    if (!append && state.selectedUserId) {
      const row = listEl.querySelector('.list-item[data-user-id="' + CSS.escape(state.selectedUserId) + '"]');
      if (row) row.classList.add('active');
    }

    return { items, total, hasMore };
  }

  return window.OzarkDashboard.withLoading(function () {
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('loading'))}</div>`;
    setLoadMoreVisible(false);
    return fetchPage(1, { append: false });
  }, {
    onError: function () {
      listEl.innerHTML = '';
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = t('users_error_generic');
      listEl.appendChild(empty);
      setLoadMoreVisible(false);
    }
  });
}

// Bind controls once
document.addEventListener('DOMContentLoaded', function () {
  const btnReload = document.getElementById('btnReloadUsers');
  const btnLoadMore = document.getElementById('btnUsersLoadMore');
  const btnSync = document.getElementById('btnSyncUsers');
  const searchEl = document.getElementById('usersSearch');
  const limitEl = document.getElementById('usersLimit');

  let searchTimer = null;

  function reload() {
    window.OzarkDashboard.loadUsers().catch(function () {});
  }

  if (btnReload) btnReload.addEventListener('click', reload);

  if (limitEl) {
    limitEl.addEventListener('change', reload);
  }

  if (searchEl) {
    searchEl.addEventListener('input', function () {
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        reload();
        searchTimer = null;
      }, 300);
    });
  }

  if (btnLoadMore) {
    btnLoadMore.addEventListener('click', function () {
      if (!state.guildId) return;

      const guildId = state.guildId;
      const page = (typeof state.usersPage === 'number' ? state.usersPage : 1) + 1;
      const limit = typeof state.usersLimit === 'number' ? state.usersLimit : 50;
      const search = state.usersSearch || '';

      const params = [];
      params.push('page=' + encodeURIComponent(String(page)));
      params.push('limit=' + encodeURIComponent(String(limit)));
      if (search) params.push('search=' + encodeURIComponent(search));

      const url = '/guilds/' + encodeURIComponent(guildId) + '/users?' + params.join('&');

      btnLoadMore.disabled = true;

      apiGet(url)
        .then(function (res) {
          const listEl = document.getElementById('usersList');
          if (!listEl) return;

          const items = Array.isArray(res.items) ? res.items : [];
          const total = typeof res.total === 'number' ? res.total : items.length;

          appendUserRows(listEl, items);

          state.usersPage = page;
          state.usersTotal = total;

          const hasMore = (page * limit) < total;
          btnLoadMore.style.display = hasMore ? '' : 'none';
        })
        .catch(function (err) {
          toast((err && err.apiMessage) || t('users_error_generic'));
        })
        .finally(function () {
          btnLoadMore.disabled = false;
        });
    });
  }

  if (btnSync) {
    btnSync.addEventListener('click', function () {
      if (!state.guildId) return;

      const guildId = state.guildId;
      const limit = typeof state.usersLimit === 'number' ? state.usersLimit : 50;
      const search = (document.getElementById('usersSearch') && document.getElementById('usersSearch').value)
        ? document.getElementById('usersSearch').value.toString().trim()
        : '';

      const params = [];
      params.push('page=1');
      params.push('limit=' + encodeURIComponent(String(limit)));
      if (search) params.push('search=' + encodeURIComponent(search));
      params.push('sync=1');

      btnSync.disabled = true;

      apiGet('/guilds/' + encodeURIComponent(guildId) + '/users?' + params.join('&'))
        .then(function () {
          reload();
        })
        .catch(function (err) {
          toast((err && err.apiMessage) || t('users_error_generic'));
        })
        .finally(function () {
          btnSync.disabled = false;
        });
    });
  }
});

async function loadUserHistory(user) {
    const detailEl = document.getElementById('userDetailPanel');
    if (!detailEl) return;

    if (!state.guildId || !user || !user.id) {
      detailEl.innerHTML = `<div class="empty">${escapeHtml(t('users_detail_empty'))}</div>`;
      return;
    }

    // Placeholder for bots
    if (user.bot) {
      detailEl.innerHTML = `
        <div class="title">${escapeHtml(t('users_history_title'))}</div>
        <div class="subtitle">${escapeHtml(user.username || user.id)} • BOT</div>
        <div class="empty">${escapeHtml(t('users_history_none'))}</div>
      `;
      return;
    }

    // Cancelar pedidos anteriores de histórico (evita race conditions)
    if (userHistoryAbortController) {
      userHistoryAbortController.abort();
    }
    userHistoryAbortController = new AbortController();
    const signal = userHistoryAbortController.signal;

    detailEl.innerHTML = `<div class="empty">${escapeHtml(t('loading'))}</div>`;


    try {
      const [historyRes, userRes] = await Promise.all([
        apiGet(
          '/guilds/' +
            encodeURIComponent(state.guildId) +
            '/users/' +
            encodeURIComponent(user.id) +
            '/history',
          { signal: signal }
        ),
        apiGet(
          '/user?guildId=' +
            encodeURIComponent(state.guildId) +
            '&userId=' +
            encodeURIComponent(user.id),
          { signal: signal }
        )
      ]);

      if (!historyRes || historyRes.ok === false) {
        console.error('User history error', historyRes && historyRes.error);
        detailEl.innerHTML = `<div class="empty">${escapeHtml(t('cases_error_generic'))}</div>`;
        return;
      }

      const infractions = historyRes.infractions || [];
      const counts = historyRes.counts || {};
      const tickets = historyRes.tickets || [];

      const dbInfo = userRes && userRes.db ? userRes.db : null;

      let html = '';

      html += `<div class="title">${escapeHtml(t('users_history_title'))}</div>`;
      html += `<div class="subtitle">${escapeHtml(user.username || user.id)} • ${escapeHtml(user.id)}</div>`;

      // Trust e próxima penalização
      if (dbInfo && typeof dbInfo.trust === 'number') {
        html += '<div class="history-section user-trust">';
        html += `<h3>${escapeHtml(t('users_trust_title'))}</h3>`;

        html += '<div class="user-trust-main">';

        // Badge para nível de trust (baixo / médio / alto)
        var trustVal = dbInfo.trust;
        var trustLabel = dbInfo.trustLabel ? String(dbInfo.trustLabel) : '';
        var trustLabelLower = trustLabel.toLowerCase();
        var trustLevelClass = 'neutral';

        if (trustLabelLower.includes('alto') || trustLabelLower.includes('high')) {
          trustLevelClass = 'high';
        } else if (
          trustLabelLower.includes('médio') ||
          trustLabelLower.includes('medio') ||
          trustLabelLower.includes('medium')
        ) {
          trustLevelClass = 'medium';
        } else if (trustLabelLower.includes('baixo') || trustLabelLower.includes('low')) {
          trustLevelClass = 'low';
        }

        html += '<div class="user-trust-header">';
        html +=
          '<div class="user-trust-score">' +
          escapeHtml(t('users_trust_score')) +
          ': ' +
          String(trustVal) +
          '</div>';

        if (trustLabel) {
          html +=
            '<span class="trust-badge trust-badge-' +
            trustLevelClass +
            '">' +
            escapeHtml(trustLabel) +
            '</span>';
        }

        html += '</div>';

        if (dbInfo.nextPenalty && dbInfo.nextPenalty.automationEnabled) {
          var np = dbInfo.nextPenalty;
          var remaining =
            typeof np.remaining === 'number' ? np.remaining : null;
          var mins =
            typeof np.estimatedMuteMinutes === 'number'
              ? np.estimatedMuteMinutes
              : null;

          // Número atual de WARNs (para mostrar no texto de limiar)
          var currentWarns =
            dbInfo && typeof dbInfo.warnings === 'number'
              ? dbInfo.warnings
              : (counts && counts.WARN) || 0;

          html += '<div class="user-trust-next">';
          if (mins !== null) {
            if (remaining !== null && remaining > 0) {
              html += `<span>${escapeHtml(t('users_trust_next_penalty_prefix'))} ${String(
                remaining
              )} warn(s); ${escapeHtml(t('users_trust_next_penalty_suffix'))} ~${String(mins)} min</span>`;
            } else {
              html += `<span>${escapeHtml(
                t('users_trust_next_penalty_at_threshold')
              )} ~${String(mins)} min (${String(currentWarns)} WARN(s) atuais)</span>`;
            }
          }
          html += '</div>';
        } else {
          html +=
            '<div class="user-trust-next-disabled">' +
            escapeHtml(t('users_trust_automation_disabled')) +
            '</div>';
        }

        html += '</div>'; // user-trust-main
        html += '</div>'; // history-section user-trust
      }

      // Badges de resumo
      html += '<div class="badge-row">';

      const warnCount =
        dbInfo && typeof dbInfo.warnings === 'number'
          ? dbInfo.warnings
          : (counts.WARN || 0);
      const muteCount = counts.MUTE || 0;

      if (warnCount || muteCount) {
        if (warnCount) {
          html += `<div class="badge badge-warn">WARN: ${String(warnCount)}</div>`;
        }
        if (muteCount) {
          html += `<div class="badge badge-mute">MUTE: ${String(muteCount)}</div>`;
        }
      } else {
        html += `<div class="badge">${escapeHtml(t('users_history_none'))}</div>`;
      }

      html += '</div>';

      // Ações rápidas de moderação
      html += '<div class="history-section user-actions">';
      html += `<h3>${escapeHtml(t('users_actions_title'))}</h3>`;

      html += '<div class="user-actions-fields">';
      html += `<input type="text" class="input xs user-actions-reason" placeholder="${escapeHtml(
        t('users_actions_reason_placeholder')
      )}" name="auto_field_6" id="auto_id_6">`;
      html += '</div>';

      html += '<div class="badge-row user-actions-buttons">';
      html += `<button type="button" class="btn xs btn-warn" data-action="warn">${escapeHtml(
        t('users_actions_warn')
      )}</button>`;
      html += `<button type="button" class="btn xs btn-unmute" data-action="unmute">${escapeHtml(
        t('users_actions_unmute')
      )}</button>`;
      html += `<button type="button" class="btn xs btn-reset" data-action="reset">${escapeHtml(
        t('users_actions_reset')
      )}</button>`;
      html += '</div>';
      html += '</div>';

      // Infrações recentes
      html += '<div class="history-section">';
      html += `<h3>${escapeHtml(t('users_history_infractions'))}</h3>`;
      html +=
        '<div class="history-hint">' +
        escapeHtml(t('users_history_click_to_remove')) +
        '</div>';

      if (!infractions.length) {
        html += `<div class="empty" style="margin-top:4px;">${escapeHtml(t('users_history_none'))}</div>`;
      } else {
        html += '<ul class="infractions-list">';
        infractions.forEach(function (inf) {
          const id = (inf._id || inf.id || '').toString();
          const when = inf.createdAt
            ? new Date(inf.createdAt).toLocaleString()
            : '';
          const reason = inf.reason || '';
          const line =
            '[' +
            (inf.type || 'UNK') +
            '] ' +
            (reason ? reason : '') +
            (when ? ' • ' + when : '');
          html += `<li class="infraction-item" data-infraction-id="${escapeHtml(id)}">${escapeHtml(line)}</li>`;
        });
        html += '</ul>';
      }
      html += '</div>';

      // Tickets recentes
      html += '<div class="history-section">';
      html += `<h3>${escapeHtml(t('users_history_tickets'))}</h3>`;

      if (!tickets.length) {
        html += `<div class="empty" style="margin-top:4px;">${escapeHtml(t('users_history_none'))}</div>`;
      } else {
        html += '<ul>';
        tickets.forEach(function (tkt) {
          const opened = tkt.createdAt
            ? new Date(tkt.createdAt).toLocaleString()
            : '';
          const status = tkt.closedAt
            ? (t('users_ticket_closed'))
            : (t('users_ticket_open'));
          const line =
            '#' +
            String(tkt.ticketNumber).padStart(3, '0') +
            ' • ' +
            status +
            (opened ? ' • ' + opened : '');
          html += `<li>${escapeHtml(line)}</li>`;
        });
        html += '</ul>';
      }
      html += '</div>';

      detailEl.innerHTML = html;

      // Bind quick moderation actions
      try {
        const container = detailEl.querySelector('.user-actions');
        if (container) {
          container.querySelectorAll('button[data-action]').forEach(function (btn) {
            btn.addEventListener('click', function () {
              const action = btn.getAttribute('data-action');
              if (!state.guildId || !user || !user.id) return;

              const reasonInput =
                container.querySelector('.user-actions-reason') || null;

              const reasonRaw = reasonInput && reasonInput.value ? reasonInput.value : '';
              const reason = reasonRaw.trim() || t('common_no_reason_provided');

              if (action === 'reset-history') {
                apiPost('/mod/reset-history', {
                  guildId: state.guildId,
                  userId: user.id,
                  reason: reason
                })
                  .then(function (res) {
                    if (!res || res.ok === false) {
                      console.error('Reset history failed', res && res.error);
                      toast(res && res.error ? String(res.error) : t('cases_error_generic'));
                      return;
                    }
                    toast(t('users_actions_reset_history') + ' OK');
                    window.OzarkDashboard.loadUserHistory(user).catch(function () {});
                  })
                  .catch(function (err) {
                    console.error('Reset history error', err);
                    toast(t('cases_error_generic'));
                  });
              } else if (action === 'warn') {
                apiPost('/mod/warn', {
                  guildId: state.guildId,
                  userId: user.id,
                  reason: reason
                })
                  .then(function (res) {
                    if (!res || res.ok === false) {
                      console.error('Warn failed', res && res.error);
                      toast(res && res.error ? String(res.error) : t('cases_error_generic'));
                      return;
                    }
                    toast(t('users_actions_warn') + ' OK');
                    // reload history to reflect new infraction
                    window.OzarkDashboard.loadUserHistory(user).catch(function () {});
                  })
                  .catch(function (err) {
                    console.error('Warn error', err);
                    toast(t('cases_error_generic'));
                  });
              } else if (action === 'unmute') {
                apiPost('/mod/unmute', {
                  guildId: state.guildId,
                  userId: user.id,
                  reason: reason
                })
                  .then(function (res) {
                    if (!res || res.ok === false) {
                      console.error('Unmute failed', res && res.error);
                      toast(res && res.error ? String(res.error) : t('cases_error_generic'));
                      return;
                    }
                    toast(t('users_actions_unmute') + ' OK');
                    window.OzarkDashboard.loadUserHistory(user).catch(function () {});
                  })
                  .catch(function (err) {
                    console.error('Unmute error', err);
                    toast(t('cases_error_generic'));
                  });
              } else if (action === 'reset') {
                // Prevent accidental double-click spam (backend also rate-limits).
                if (state._resetTrustInFlight) return;
                state._resetTrustInFlight = true;
                apiPost('/mod/reset-trust', {
                  guildId: state.guildId,
                  userId: user.id,
                  reason: reason
                })
                  .then(function (res) {
                    if (!res || res.ok === false) {
                      console.error('Reset trust failed', res && res.error);
                      toast(res && res.error ? String(res.error) : t('cases_error_generic'));
                      return;
                    }
                    toast(t('users_actions_reset') + ' OK');
                    window.OzarkDashboard.loadUserHistory(user).catch(function () {});
                  })
                  .catch(function (err) {
                    console.error('Reset trust error', err);
                    toast(t('cases_error_generic'));
                  })
                  .finally(function () {
                    state._resetTrustInFlight = false;
                  });
              }
            });
          });
        }

        // Bind infractions click-to-remove
        const infraList = detailEl.querySelector('.infractions-list');
        if (infraList) {
          infraList.querySelectorAll('.infraction-item').forEach(function (li) {
            li.addEventListener('click', function () {
              const id = li.getAttribute('data-infraction-id');
              if (!id || !state.guildId || !user || !user.id) return;

              if (!window.confirm(t('users_history_remove_confirm'))) return;

              // Avoid hammering the API (prevents 429s when user clicks multiple items quickly)
              const now = Date.now();
              if (state._removeInfractionInFlight) return;
              if (state._removeInfractionCooldownUntil && now < state._removeInfractionCooldownUntil) {
                const waitMs = state._removeInfractionCooldownUntil - now;
                toast((t('common_rate_limit_wait') || 'Aguarda um momento...') + ` (${Math.ceil(waitMs / 100) / 10}s)`);
                return;
              }
              state._removeInfractionInFlight = true;
              li.classList.add('removing');

              apiPost('/mod/remove-infraction', {
                guildId: state.guildId,
                userId: user.id,
                infractionId: id
              })
                .then(function (res) {
                  if (!res || res.ok === false) {
                    console.error('Remove infraction failed', res && res.error);
                    toast(res && res.error ? String(res.error) : t('cases_error_generic'));
                    return;
                  }
                  toast(t('users_history_remove_success'));
                  window.OzarkDashboard.loadUserHistory(user).catch(function () {});
                })
                .catch(function (err) {
                  console.error('Remove infraction error', err);
                  // If backend provides retryAfterMs, show a helpful message.
                  const ra = err && err.payload && typeof err.payload.retryAfterMs === 'number' ? err.payload.retryAfterMs : null;
                  if (err && err.status === 429 && ra) {
                    toast((t('common_rate_limit_wait') || 'Muitas ações seguidas. Aguarda') + ` ${Math.ceil(ra / 100) / 10}s`);
                  } else {
                    toast((err && err.apiMessage) || t('cases_error_generic'));
                  }
                })
                .finally(function () {
                  state._removeInfractionInFlight = false;
                  state._removeInfractionCooldownUntil = Date.now() + 800;
                  // Keep the visual state if the item was removed on refresh; otherwise re-enable.
                  try { li.classList.remove('removing'); } catch (_) {}
                });
            });
          });
        }
      } catch (err) {
        console.error('Failed to bind user quick actions', err);
      }
    } catch (err) {
      if (err && err.name === 'AbortError') {
        // Pedido de histórico cancelado devido a uma nova seleção de utilizador; ignorar.
        return;
      }
      console.error('Failed to load user history', err);
      detailEl.innerHTML =
        `<div class="empty">${escapeHtml(t('users_history_error_generic'))}</div>`;
    }
  }

  // Substituir as funções expostas no namespace pela versão deste módulo
  D.loadUsers = loadUsers;
  D.loadUserHistory = loadUserHistory;
})();