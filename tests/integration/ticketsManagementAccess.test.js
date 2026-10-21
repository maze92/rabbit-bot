const test = require("node:test");
const assert = require("node:assert/strict");
const { registerTicketsRoutes } = require("../../src/dashboard/routes/tickets");

test("ticket management routes do not require a Premium license", () => {
  const routes = new Map();
  const premiumGuard = function premiumGuard() {};
  const passThrough = function passThrough(req, res, next) {
    if (next) next();
  };
  const app = {
    get(path, ...handlers) {
      routes.set("GET " + path, handlers);
    },
    post(path, ...handlers) {
      routes.set("POST " + path, handlers);
    },
  };

  registerTicketsRoutes({
    app,
    requireDashboardAuth: passThrough,
    requirePerm: () => passThrough,
    requireGuildAccess: () => passThrough,
    requirePremium: () => premiumGuard,
    rateLimit: () => passThrough,
    sanitizeText: (value) => value,
    getActorFromRequest: () => "test",
    recordAudit: async () => {},
    _getClient: () => null,
    _getModels: () => ({}),
  });

  const managementRoutes = [
    "GET /api/tickets",
    "GET /api/tickets/:ticketId/audit",
    "GET /api/tickets/:ticketId/messages",
    "POST /api/tickets/:ticketId/close",
    "POST /api/tickets/:ticketId/reopen",
    "POST /api/tickets/:ticketId/reply",
  ];

  for (const route of managementRoutes) {
    assert.ok(routes.has(route), `expected route ${route} to be registered`);
    assert.ok(
      !routes.get(route).includes(premiumGuard),
      `${route} must not use the Premium guard`,
    );
  }
});
