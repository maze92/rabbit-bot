(function () {
  const I18n = {
    currentLang: 'pt',
    translations: {},
    fallbackTranslations: {},

    async init(lang) {
      this.currentLang = lang || 'pt';

      // Carregar sempre PT como fallback
      if (!this.fallbackTranslations.pt) {
        await this.loadLocale('pt');
        this.fallbackTranslations.pt = (window.OzarkLocales && window.OzarkLocales.pt) || {};
      }

      if (lang && lang !== 'pt') {
        await this.loadLocale(lang);
        this.translations = (window.OzarkLocales && window.OzarkLocales[lang]) || {};
      } else {
        this.translations = this.fallbackTranslations.pt;
      }

      // DOM será atualizado via applyI18n() do dashboard.
    },

    loadLocale(lang) {
      return new Promise(function (resolve, reject) {
        if (window.OzarkLocales && window.OzarkLocales[lang]) {
          return resolve();
        }
        const script = document.createElement('script');
        script.src = '/locales/' + lang + '.js';
        script.async = true;
        script.onload = function () {
          resolve();
        };
        script.onerror = function (err) {
          console.error('Falha ao carregar locale', lang, err);
          resolve(); // não bloquear init; vamos cair no fallback
        };
        document.head.appendChild(script);
      });
    },

    t(key, params) {
      params = params || {};
      const value =
        this.lookup(this.translations, key) ||
        this.lookup(this.fallbackTranslations.pt || {}, key);

      if (!value) return key;
      return this.interpolate(value, params);
    },

    lookup(obj, key) {
      if (!obj) return null;
      const parts = key.split('.');
      let cur = obj;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if (!Object.prototype.hasOwnProperty.call(cur, p)) return null;
        cur = cur[p];
      }
      return typeof cur === 'string' ? cur : null;
    },

    interpolate(str, params) {
      return str.replace(/\{(\w+)\}/g, function (_, v) {
        return Object.prototype.hasOwnProperty.call(params, v)
          ? String(params[v])
          : '{' + v + '}';
      });
    },

    applyToDOM() {
      // Texto normal
      document.querySelectorAll('[data-i18n]').forEach(function (el) {
        const key = el.getAttribute('data-i18n');
        if (!key) return;
        el.textContent = I18n.t(key);
      });

      // Placeholders
      document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
        const key = el.getAttribute('data-i18n-placeholder');
        if (!key) return;
        el.placeholder = I18n.t(key);
      });
    }
  };

  window.OzarkDashboard = window.OzarkDashboard || {};
  window.OzarkDashboard.I18n = I18n;
  window.OzarkDashboard.t = function (key, params) {
    return I18n.t(key, params);
  };

  // Função global para código legacy
  window.t = function (key, params) {
    return I18n.t(key, params);
  };
})();