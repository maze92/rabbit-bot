# Changelog

## v1.0.0.1

### Added
- Sistema completo de **AutoMod 2.0** com Trust Score
- Sistema centralizado de utilizadores (`warningsService`)
- Trust Score persistente com penalização e regeneração
- Timeout automático ajustado por trust
- Notificações por DM em WARN e MUTE (configurável)
- Sistema Anti-Spam com timeout automático
- RSS Game News com:
  - Dedupe real por hash
  - Retry + jitter
  - Backoff por feed
  - Persistência no MongoDB
- Dashboard Web com:
  - Logs em tempo real
  - Persistência em MongoDB
  - Painel GameNews Status
- Endpoint `/health` com estado do sistema

### Changed
- Arquitetura de moderação centralizada
- Logger unificado para Discord + Dashboard
- Commands handler com cooldowns globais
- Melhor gestão de hierarquia e permissões

### Improved
- UX para staff (logs mais claros e consistentes)
- Proteção contra loops e spam
- Normalização avançada de mensagens no AutoMod
- Separação clara entre lógica de leitura e escrita de trust

### Fixed
- Duplicação de RSS em feeds problemáticos
- Execuções repetidas de comandos
- Crashes silenciosos em falhas externas (RSS, DMs, DB)

---

