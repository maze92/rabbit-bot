/**
 * Evento: messageCreate
 * 
 * Responsável por:
 * - Processar comandos prefixados (ex: !mute, !warn, !clear)
 * - Executar o sistema de auto-moderação em mensagens normais
 * 
 * Regras importantes:
 * - Se for comando, NÃO executa AutoMod (evita falsos positivos / conflitos)
 * - Ignora bots e DMs
 */

const autoModeration = require('../systems/autoModeration');
const config = require('../config/defaultConfig');

module.exports = (client) => {
  client.on('messageCreate', async (message) => {
    try {
      // ------------------------------
      // Validações básicas
      // ------------------------------
      if (!message) return;
      if (!message.guild) return;           // Ignora DMs
      if (!message.content) return;
      if (message.author?.bot) return;      // Ignora bots

      // ------------------------------
      // Garantir dados completos (partials)
      // - Em alguns casos o Discord envia mensagens incompletas
      // - Isto evita falhas em message.member / content / etc.
      // ------------------------------
      if (message.partial) {
        try {
          await message.fetch();
        } catch {
          return; // se não conseguir buscar, ignora
        }
      }

      // Garantir member (necessário para permissões/hierarquia no AutoMod)
      if (!message.member) {
        try {
          await message.guild.members.fetch(message.author.id);
        } catch {
          // Se falhar, não bloqueamos comandos, mas AutoMod pode falhar
        }
      }

      const prefix = config.prefix || '!';

      // ------------------------------
      // Processamento de comandos prefixados
      // ------------------------------
      if (message.content.startsWith(prefix)) {
        // Ex: "!" sozinho não faz nada
        if (message.content.trim() === prefix) return;

        // Extrai args (tudo após o prefix)
        const args = message.content
          .slice(prefix.length)
          .trim()
          .split(/\s+/);

        const commandName = (args.shift() || '').toLowerCase();
        if (!commandName) return;

        // Obtém comando carregado no index.js
        const command = client.commands.get(commandName);
        if (!command) return;

        // Executa o comando
        try {
          await command.execute(message, args, client);
        } catch (err) {
          console.error(`[Command Error] ${commandName}:`, err);

          // Feedback opcional ao utilizador
          await message.reply('❌ There was an error executing this command.')
            .catch(() => null);
        }

        // IMPORTANTE:
        // Comando não passa pelo AutoMod
        return;
      }

      // ------------------------------
      // AutoModeração (mensagens normais)
      // ------------------------------
      try {
        await autoModeration(message, client);
      } catch (err) {
        console.error('[AutoMod] Error in messageCreate:', err);
      }

    } catch (err) {
      console.error('[messageCreate] Critical error:', err);
    }
  });
};
