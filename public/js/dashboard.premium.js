// public/js/dashboard.premium.js
//
// Estado premium por servidor. Os módulos extra e as licenças são sempre
// associados à guild selecionada.

(function () {
  'use strict';

  var NS = (window.OzarkDashboard = window.OzarkDashboard || {});

  function byId(id) { return document.getElementById(id); }
  function t(key, params) { return NS.t ? NS.t(key, params) : key; }
  function notify(msg, opts) { if (typeof NS.toast === 'function') NS.toast(msg, opts); }
  function guildId() { return (NS.state && NS.state.guildId) ? NS.state.guildId : null; }

  var premium = null;   // { enabled, active, until, note, activatedAt }
  var paymentPlan = null;
  var premiumGuildId = null;
  var premiumLoadSequence = 0;
  var checkoutLoading = false;
  var adminGuilds = [];
  var adminPayments = [];
  var paymentsPage = 1;
  var paymentsPages = 0;
  var moduleLoadCache = Object.create(null);

  function loadPremiumModule(module) {
    var gid = guildId();
    if (!gid || !module || typeof NS.loadPremiumModuleData !== 'function') return Promise.resolve();
    var key = gid + ':' + module;
    if (moduleLoadCache[key]) return moduleLoadCache[key];
    var cache = moduleLoadCache;
    var request = Promise.resolve().then(function () {
      return NS.loadPremiumModuleData(module);
    }).catch(function (err) {
      if (moduleLoadCache === cache) delete cache[key];
      throw err;
    });
    cache[key] = request;
    return request;
  }

  function isAdmin() {
    var me = NS.state && NS.state.me;
    return !!(me && me.role === 'BOT_OWNER');
  }

  function isBotOwner() {
    var me = NS.state && NS.state.me;
    return !!(me && me.role === 'BOT_OWNER');
  }

  function canStartCheckout() {
    var me = NS.state && NS.state.me;
    var permissions = me && me.permissions;
    return !!(me && (
      me.role === 'BOT_ADMIN' ||
      me.role === 'BOT_OWNER' ||
      (permissions && permissions.canEditConfig === true)
    ));
  }

  function formatMoney(amount, currency) {
    try {
      var locale = (NS.state && NS.state.lang) || document.documentElement.lang || 'pt-PT';
      return new Intl.NumberFormat(locale, { style: 'currency', currency: currency }).format(Number(amount));
    } catch {
      return String(amount) + ' ' + String(currency || '');
    }
  }

  function formatPaymentDate(value) {
    if (!value) return '—';
    var date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
  }

  function updateGuildPremiumMarker(active) {
    var select = byId('guildPicker');
    if (!select) return;
    Array.prototype.slice.call(select.options).forEach(function (option) {
      var name = option.dataset.guildName;
      if (!name) return;
      option.textContent = name + (active && option.value === guildId() ? ' ★' : '');
    });
  }

  // Bloqueia os módulos até confirmar a licença do servidor selecionado.
  function applyLock() {
    var paidActive = !!(premium && premium.active);
    var active = paidActive;

    Array.prototype.slice.call(document.querySelectorAll('[data-premium="true"]')).forEach(function (card) {
      card.setAttribute('data-premium-locked', active ? 'false' : 'true');
      card.classList.toggle('is-premium-locked', !active);
      var body = card.querySelector('.feature-card__body');
      var detailsToggle = card.querySelector('.feature-card__toggle');
      if (body) {
        body.inert = !active;
        if (!active) {
          body.classList.add('hidden');
          card.classList.remove('is-expanded');
        }
      }
      if (detailsToggle) {
        detailsToggle.classList.toggle('hidden', !active);
        if (!active) detailsToggle.setAttribute('aria-expanded', 'false');
      }
      Array.prototype.slice.call(card.querySelectorAll('button, input, select, textarea')).forEach(function (el) {
        if (el.getAttribute('data-premium-action') !== 'offer') el.disabled = !active;
      });
      var offerButton = card.querySelector('[data-premium-action="offer"]');
      if (offerButton) offerButton.classList.toggle('hidden', active);
    });

    updateGuildPremiumMarker(active);
    var offerCheckoutBtn = byId('btnPremiumOfferCheckout');
    var offerReferenceLink = byId('premiumOfferReferenceLink');
    var canRenew = paidActive && premium && premium.until;
    var canPurchase = canStartCheckout() && paymentPlan && paymentPlan.available && (!paidActive || canRenew);
    var canUseCheckout = canPurchase && paymentPlan.checkoutAvailable;
    var canUseReferenceLink = canPurchase && paymentPlan.referenceLinkAvailable && paymentPlan.paymentLink;
    if (offerCheckoutBtn) {
      offerCheckoutBtn.classList.toggle('hidden', !canUseCheckout);
      offerCheckoutBtn.textContent = canUseCheckout
        ? t('premium_checkout_button', { price: formatMoney(paymentPlan.amount, paymentPlan.currency) })
        : '';
      offerCheckoutBtn.disabled = checkoutLoading;
    }
    if (offerReferenceLink) {
      offerReferenceLink.classList.toggle('hidden', !canUseReferenceLink || canUseCheckout);
      if (canUseReferenceLink && !canUseCheckout) offerReferenceLink.href = paymentPlan.paymentLink;
      else offerReferenceLink.removeAttribute('href');
    }

    var settingsForm = byId('premiumSettingsForm');
    if (settingsForm) settingsForm.classList.toggle('hidden', !isBotOwner());

    if (typeof NS.applyPremiumState === 'function') NS.applyPremiumState(active);
  }

  function openPremiumOffer(card) {
    var dialog = byId('premiumOfferDialog');
    if (!dialog || typeof dialog.showModal !== 'function') return;
    var title = byId('premiumOfferTitle');
    var cardTitle = card && card.querySelector('.feature-card__name');
    if (title) {
      title.textContent = t('premium_offer_title', {
        module: cardTitle ? cardTitle.textContent : ''
      });
    }

    var plan = byId('premiumOfferPlan');
    var hasOffer = paymentPlan && paymentPlan.amount && paymentPlan.currency && paymentPlan.durationDays;
    if (plan) {
      plan.textContent = hasOffer
        ? t('premium_offer_plan', {
          days: paymentPlan.durationDays,
          price: formatMoney(paymentPlan.amount, paymentPlan.currency)
        })
        : t('premium_offer_plan_unavailable');
    }

    var status = byId('premiumOfferStatus');
    if (status) {
      var message = !guildId()
        ? 'premium_offer_select_guild'
        : !paymentPlan || !paymentPlan.available
          ? 'premium_offer_unavailable'
          : canStartCheckout() && paymentPlan.checkoutAvailable
            ? 'premium_offer_checkout_ready'
            : canStartCheckout() && paymentPlan.referenceLinkAvailable
              ? 'premium_offer_reference_payment'
            : 'premium_offer_admin_required';
      status.textContent = t(message);
    }

    applyLock();
    if (!dialog.open) dialog.showModal();
  }

  async function loadPremium() {
    var requestSequence = ++premiumLoadSequence;
    var gid = guildId();
    if (!gid) {
      moduleLoadCache = Object.create(null);
      premiumGuildId = null;
      premium = { enabled: false, active: false };
      paymentPlan = null;
      NS.state.premiumPayerId = null;
      if (typeof NS.refreshPremiumBadges === 'function') NS.refreshPremiumBadges();
      if (typeof NS.applyPremiumState === 'function') NS.applyPremiumState(false);
      applyLock();
      return;
    }
    if (premiumGuildId !== gid) {
      moduleLoadCache = Object.create(null);
      premiumGuildId = gid;
      premium = { enabled: false, active: false };
      paymentPlan = null;
      NS.state.premiumPayerId = null;
      if (typeof NS.refreshPremiumBadges === 'function') NS.refreshPremiumBadges();
      if (typeof NS.applyPremiumState === 'function') NS.applyPremiumState(false);
      applyLock();
    }
    try {
      var res = await NS.apiGet('/premium?guildId=' + encodeURIComponent(gid));
      if (requestSequence !== premiumLoadSequence || guildId() !== gid) return;
      premium = (res && res.premium) ? res.premium : { enabled: false, active: false };
      paymentPlan = (res && res.payment) ? res.payment : null;
      NS.state.premiumPayerId = premium.active && res.server
        ? String(res.server.purchaserDiscordUserId || '')
        : null;
    } catch (err) {
      if (requestSequence !== premiumLoadSequence || guildId() !== gid) return;
      console.error('Premium load error', err);
      premium = { enabled: false, active: false };
      paymentPlan = null;
      NS.state.premiumPayerId = null;
    } finally {
      if (requestSequence === premiumLoadSequence) {
        if (typeof NS.refreshPremiumBadges === 'function') NS.refreshPremiumBadges();
        applyLock();
      }
    }
  }

  function localDateTime(value) {
    if (!value) return '';
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  }

  function renderAdminGuilds() {
    var list = byId('premiumGuildsList');
    if (!list || !isAdmin()) return;
    var query = String((byId('premiumAdminSearch') || {}).value || '').trim().toLowerCase();
    var items = adminGuilds.filter(function (item) {
      return !query || [item.guildId, item.guildName, item.ownerId, item.ownerName, item.purchasedByUserId, item.purchaserName, item.note, item.latestPayment && item.latestPayment.paypalPayerEmail]
        .some(function (value) { return String(value || '').toLowerCase().includes(query); });
    });
    list.innerHTML = '';
    if (!items.length) {
      var empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = t('premium_admin_empty');
      list.appendChild(empty);
      return;
    }

    items.forEach(function (item) {
      var row = document.createElement('article');
      row.className = 'list-item premium-guild-row';
      var summary = document.createElement('div');
      summary.className = 'premium-guild-row__summary';
      var title = document.createElement('strong');
      title.textContent = item.guildName || item.guildId;
      var state = document.createElement('span');
      state.className = 'premium-status' + (item.active ? ' premium-status--on' : '');
      state.textContent = item.active
        ? t('premium_admin_active')
        : (item.enabled ? t('premium_admin_expired') : t('premium_admin_disabled'));
      summary.appendChild(title);
      summary.appendChild(state);
      row.appendChild(summary);
      var guildMeta = document.createElement('small');
      guildMeta.textContent = [
        t('premium_admin_guild_id') + ': ' + item.guildId,
        item.ownerName || item.ownerId
          ? t('premium_server_owner') + ': ' + (item.ownerName || t('premium_server_unknown')) + (item.ownerId ? ' (' + item.ownerId + ')' : '')
          : '',
        item.purchaserName || item.purchasedByUserId
          ? t('premium_server_payer') + ': ' + (item.purchaserName || t('premium_server_unknown')) + (item.purchasedByUserId ? ' (' + item.purchasedByUserId + ')' : '')
          : '',
        item.note || '',
        item.until ? t('premium_until', { date: formatPaymentDate(item.until) }) : t('premium_admin_permanent'),
      ].filter(Boolean).join(' · ');
      row.appendChild(guildMeta);

      if (item.latestPayment) {
        var payment = document.createElement('small');
        payment.textContent = [
          formatMoney(item.latestPayment.amount, item.latestPayment.currency),
          item.latestPayment.paypalPayerEmail || '',
          formatPaymentDate(item.latestPayment.completedAt),
          item.latestPayment.paypalCaptureId || ''
        ].filter(Boolean).join(' · ');
        row.appendChild(payment);
        if (item.latestPayment.approvalUrl) {
          var approval = document.createElement('a');
          approval.href = item.latestPayment.approvalUrl;
          approval.target = '_blank';
          approval.rel = 'noopener noreferrer';
          approval.textContent = t('premium_reference_link');
          row.appendChild(approval);
        }
      }

      var form = document.createElement('form');
      form.className = 'premium-guild-row__form';
      form.dataset.guildId = item.guildId;
      var enabledLabel = document.createElement('label');
      enabledLabel.className = 'premium-guild-row__switch';
      var enabled = document.createElement('input');
      enabled.type = 'checkbox';
      enabled.checked = item.enabled;
      enabledLabel.appendChild(enabled);
      enabledLabel.appendChild(document.createTextNode(t('premium_admin_enable')));

      var untilLabel = document.createElement('label');
      untilLabel.textContent = t('premium_admin_until');
      var until = document.createElement('input');
      until.className = 'input';
      until.type = 'datetime-local';
      until.value = localDateTime(item.until);
      until.setAttribute('aria-label', t('premium_admin_until'));
      untilLabel.appendChild(until);

      var note = document.createElement('input');
      note.className = 'input';
      note.type = 'text';
      note.maxLength = 200;
      note.value = item.note || '';
      note.placeholder = t('premium_admin_note');

      var save = document.createElement('button');
      save.className = 'btn xs';
      save.type = 'submit';
      save.textContent = t(enabled.checked ? 'premium_admin_save_guild' : 'premium_admin_activate_guild');
      enabled.addEventListener('change', function () {
        save.textContent = t(enabled.checked ? 'premium_admin_save_guild' : 'premium_admin_deactivate_guild');
      });
      form.appendChild(enabledLabel);
      form.appendChild(untilLabel);
      form.appendChild(note);
      form.appendChild(save);
      row.appendChild(form);
      list.appendChild(row);
    });
  }

  function renderAdminPayments() {
    var list = byId('premiumPaymentsList');
    if (!list || !isAdmin()) return;
    list.innerHTML = '';
    if (!adminPayments.length) {
      var empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = t('premium_payments_empty');
      list.appendChild(empty);
    } else {
      adminPayments.forEach(function (item) {
        var row = document.createElement('article');
        row.className = 'list-item premium-payment-row';
        var title = document.createElement('strong');
        title.textContent = item.guildName || item.guildId || t('premium_server_unknown');
        row.appendChild(title);
        var metadata = document.createElement('small');
        var statusKey = 'premium_payment_status_' + String(item.status || '').toLowerCase();
        metadata.textContent = [
          item.status ? t(statusKey) : '',
          item.guildId ? t('premium_admin_guild_id') + ': ' + item.guildId : '',
          item.purchaserDiscordUsername || item.purchaserDiscordUserId
            ? t('premium_server_payer') + ': ' + (item.purchaserDiscordUsername || item.purchaserDiscordUserId)
            : '',
          item.paypalPayerEmail || '',
          item.amount ? formatMoney(item.amount, item.currency) : '',
          formatPaymentDate(item.completedAt || item.createdAt),
          item.expiresAt ? t('premium_until', { date: formatPaymentDate(item.expiresAt) }) : '',
          item.paypalCaptureId || ''
        ].filter(Boolean).join(' · ');
        row.appendChild(metadata);
        list.appendChild(row);
      });
    }

    var pageLabel = byId('premiumPaymentsPage');
    if (pageLabel) pageLabel.textContent = t('premium_payments_page', {
      page: paymentsPages ? paymentsPage : 0,
      pages: paymentsPages
    });
    var previous = byId('premiumPaymentsPrevious');
    var next = byId('premiumPaymentsNext');
    if (previous) previous.disabled = paymentsPage <= 1;
    if (next) next.disabled = !paymentsPages || paymentsPage >= paymentsPages;
  }

  async function loadAdminData() {
    if (!isAdmin()) return;
    try {
      var statusFilter = byId('premiumPaymentsStatus');
      var paymentQuery = new URLSearchParams({
        page: String(paymentsPage),
        pageSize: '50',
        status: statusFilter ? statusFilter.value : 'ALL'
      });
      var results = await Promise.all([
        isBotOwner() ? NS.apiGet('/premium/admin/settings') : Promise.resolve(null),
        NS.apiGet('/premium/admin/guilds'),
        NS.apiGet('/premium/payments?' + paymentQuery.toString())
      ]);
      var settings = results[0] && results[0].settings;
      adminGuilds = results[1] && Array.isArray(results[1].items) ? results[1].items : [];
      adminPayments = results[2] && Array.isArray(results[2].items) ? results[2].items : [];
      paymentsPage = results[2] && results[2].page || 1;
      paymentsPages = results[2] && results[2].pages || 0;
      if (settings && isBotOwner()) {
        byId('premiumAdminAmount').value = '10.00';
        byId('premiumAdminCurrency').value = 'EUR';
        byId('premiumAdminDuration').value = settings.durationDays || '';
        byId('premiumAdminPaymentLink').value = settings.paymentLink || '';
        paymentPlan = Object.assign({}, paymentPlan || {}, settings, { available: paymentPlan && paymentPlan.available });
      }
      renderAdminGuilds();
      renderAdminPayments();
      applyLock();
    } catch (err) {
      console.error('Premium admin data error', err);
      var list = byId('premiumGuildsList');
      if (list) list.textContent = t('premium_payments_error');
      var paymentsList = byId('premiumPaymentsList');
      if (paymentsList) paymentsList.textContent = t('premium_payments_error');
    }
  }

  async function savePremiumSettings(event) {
    event.preventDefault();
    var status = byId('premiumSettingsStatus');
    try {
      var res = await NS.apiPatch('/premium/admin/settings', {
        durationDays: byId('premiumAdminDuration').value,
        paymentLink: byId('premiumAdminPaymentLink').value
      });
      if (!res || res.ok === false) throw new Error((res && res.error) || 'ERROR');
      await loadPremium();
      if (status) status.textContent = t('premium_admin_saved');
    } catch (err) {
      console.error('Premium settings save error', err);
      if (status) status.textContent = t('premium_admin_save_error');
    }
  }

  async function saveGuild(guildId, values, form) {
    var button = form && form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    try {
      var res = await NS.apiPatch('/premium/admin/guilds/' + encodeURIComponent(guildId), values);
      if (!res || res.ok === false) throw new Error((res && res.error) || 'ERROR');
      notify(t('premium_admin_saved'), { type: 'success' });
      await loadAdminData();
      return true;
    } catch (err) {
      console.error('Premium guild update error', err);
      notify(t('premium_admin_save_error'), { type: 'error' });
      return false;
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function grantGuild(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var guildId = String(byId('premiumAdminGuildId').value || '').trim();
    var untilValue = byId('premiumAdminGuildUntil').value
      ? new Date(byId('premiumAdminGuildUntil').value).toISOString()
      : null;
    var saved = await saveGuild(guildId, {
      enabled: true,
      until: untilValue,
      note: byId('premiumAdminGuildNote').value
    }, form);
    if (saved) form.reset();
  }

  async function startCheckout(event) {
    var gid = guildId();
    var button = event && event.currentTarget;
    if (!gid || !canStartCheckout() || !paymentPlan || !paymentPlan.available || checkoutLoading) return;
    checkoutLoading = true;
    applyLock();
    try {
      var res = await NS.apiPost('/premium/checkout', { guildId: gid });
      var approvalUrl = new URL(res && res.approvalUrl);
      if (approvalUrl.protocol !== 'https:' || !/(^|\.)paypal\.com$/i.test(approvalUrl.hostname)) {
        throw new Error('INVALID_PAYPAL_APPROVAL_URL');
      }
      window.location.assign(approvalUrl.toString());
    } catch (err) {
      console.error('Premium checkout error', err);
      notify(t('premium_checkout_error'), { type: 'error' });
    } finally {
      checkoutLoading = false;
      if (button) button.disabled = false;
      applyLock();
    }
  }

  NS.loadPremium = loadPremium;
  NS.loadPremiumAdmin = loadAdminData;
  NS.isPremiumActive = function () { return !!(premium && premium.active); };
  NS.isPremiumModuleLocked = function () { return !(NS.isPremiumActive()); };

  document.addEventListener('DOMContentLoaded', function () {
    var premiumDialog = byId('premiumOfferDialog');
    var featuresSection = byId('tab-features');
    if (premiumDialog && featuresSection) featuresSection.appendChild(premiumDialog);
    var offerCheckoutBtn = byId('btnPremiumOfferCheckout');
    if (offerCheckoutBtn) offerCheckoutBtn.addEventListener('click', function (event) { startCheckout(event); });
    [byId('extrasGrid'), byId('featuresGrid')].forEach(function (grid) {
      if (!grid) return;
      grid.addEventListener('click', function (event) {
        var detailsToggle = event.target.closest('.feature-card__toggle');
        if (detailsToggle) {
          var detailsCard = detailsToggle.closest('[data-premium="true"]');
          if (!detailsCard || detailsCard.getAttribute('data-premium-locked') === 'true') return;
          if (detailsCard.hasAttribute('data-feature')) return;
          var isExpanded = typeof NS.toggleFeatureCard === 'function'
            ? NS.toggleFeatureCard(detailsCard)
            : false;
          if (isExpanded) {
            loadPremiumModule(detailsCard.getAttribute('data-premium-module')).catch(function (err) {
              console.error('Failed to load Premium module details', err);
            });
          }
          return;
        }
        var offer = event.target.closest('[data-premium-action="offer"]');
        if (!offer) return;
        var card = offer.closest('[data-premium="true"]');
        if (card && card.getAttribute('data-premium-locked') === 'true') openPremiumOffer(card);
      });
    });
    var offerDialog = byId('premiumOfferDialog');
    [byId('btnClosePremiumOffer'), byId('btnCancelPremiumOffer')].forEach(function (button) {
      if (button) button.addEventListener('click', function () {
        if (offerDialog && offerDialog.open) offerDialog.close();
      });
    });
    if (offerDialog) offerDialog.addEventListener('click', function (event) {
      if (event.target === offerDialog) offerDialog.close();
    });

    var settingsForm = byId('premiumSettingsForm');
    if (settingsForm) settingsForm.addEventListener('submit', savePremiumSettings);
    var grantForm = byId('premiumAdminGrantForm');
    if (grantForm) grantForm.addEventListener('submit', grantGuild);
    var guildList = byId('premiumGuildsList');
    if (guildList) guildList.addEventListener('submit', function (event) {
      var form = event.target.closest('form[data-guild-id]');
      if (!form) return;
      event.preventDefault();
      var fields = form.querySelectorAll('input');
      var untilValue = fields[1].value ? new Date(fields[1].value).toISOString() : null;
      saveGuild(form.dataset.guildId, {
        enabled: fields[0].checked,
        until: untilValue,
        note: fields[2].value
      }, form);
    });
    var accountSearch = byId('premiumAdminSearch');
    if (accountSearch) accountSearch.addEventListener('input', renderAdminGuilds);
    var paymentStatus = byId('premiumPaymentsStatus');
    if (paymentStatus) paymentStatus.addEventListener('change', function () {
      paymentsPage = 1;
      loadAdminData();
    });
    var previousPage = byId('premiumPaymentsPrevious');
    if (previousPage) previousPage.addEventListener('click', function () {
      if (paymentsPage > 1) {
        paymentsPage -= 1;
        loadAdminData();
      }
    });
    var nextPage = byId('premiumPaymentsNext');
    if (nextPage) nextPage.addEventListener('click', function () {
      if (paymentsPage < paymentsPages) {
        paymentsPage += 1;
        loadAdminData();
      }
    });

    window.addEventListener('dashboard:premium-return', function (event) {
      var status = event && event.detail ? event.detail.status : '';
      if (status === 'success') {
        loadPremium();
        notify(t('premium_payment_success'), { type: 'success' });
      } else if (status === 'cancelled') {
        notify(t('premium_payment_cancelled'), { type: 'info' });
      } else if (status === 'error') {
        notify(t('premium_payment_error'), { type: 'error' });
      }
    });
    applyLock();
  });
})();
