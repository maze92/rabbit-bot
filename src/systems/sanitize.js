// src/systems/sanitize.js

function sanitizeText(value, options = {}) {
  if (value === null || value === undefined) return '';
  let str = String(value);

  // opcional: encurtar textos muito grandes
  const maxLen = options.maxLen ?? 2000;
  if (str.length > maxLen) {
    str = str.slice(0, maxLen);
  }

  // remove control chars mais esquisitos
  str = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // se quiseres ser agressivo com HTML:
  // remove tags simples (não é um parser perfeito, mas ajuda muito)
  if (options.stripHtml !== false) {
    str = str.replace(/<[^>]*>/g, '');
  }

  return str.trim();
}

module.exports = {
  sanitizeText,
};
