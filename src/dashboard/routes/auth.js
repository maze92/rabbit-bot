// src/dashboard/routes/auth.js

function registerAuthRoutes(ctx) {
  const { app, express, requireDashboardAuth, DashboardUserModel, bcrypt, jwt, JWT_SECRET, sanitizeText, rateLimit, ADMIN_PERMISSIONS } = ctx;

  const loginLimiter = rateLimit({ windowMs: 60_000, max: 10, keyPrefix: 'rl:auth:login:' });

// Usernames for dashboard auth should be simple and predictable to avoid UX/security issues.
function normalizeUsername(raw) {
  if (typeof raw !== 'string') return '';
  const s = sanitizeText(raw, { maxLen: 32, stripHtml: true }).toLowerCase();
  // Allow letters, digits, dot, underscore, dash. Trim anything else.
  const cleaned = s.replace(/[^a-z0-9._-]/g, '');
  return cleaned;
}

function parseAllowedGuildIds(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const v of raw) {
    const s = typeof v === 'string' ? v : (v == null ? '' : String(v));
    const id = s.replace(/\D/g, '').slice(0, 20);
    if (id && !out.includes(id)) out.push(id);
    if (out.length >= 200) break;
  }
  return out;
}

const PERMISSION_KEYS = Object.freeze([
  ...Object.keys(ADMIN_PERMISSIONS || {}),
  'canManageUsers'
]);

function normalizePermissions(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const k of PERMISSION_KEYS) {
    if (raw[k] === true) out[k] = true;
  }
  return out;
}


app.post('/api/auth/login', express.json(), loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body || {};
    // Hard type checks to prevent NoSQL operator injection (e.g. {"$gt":""}).
    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ ok: false, error: 'MISSING_CREDENTIALS' });
    }

    const safeUsername = normalizeUsername(username);
    const safePassword = password;
    console.log('[Dashboard Auth] Login attempt', safeUsername);

    // Backwards-compatible: keep legacy error code used by the UI.
    if (!safeUsername || !safePassword) {
      return res.status(400).json({ ok: false, error: 'MISSING_CREDENTIALS' });
    }

    const envUser = process.env.DASHBOARD_ADMIN_USER;
    const envPass = process.env.DASHBOARD_ADMIN_PASS;

    // Always query with the sanitized username.
    let user = await DashboardUserModel.findOne({ username: safeUsername }).lean();

    // Se não existir user mas as credenciais batem certo com as envs, cria/admin padrão em runtime.
    if (!user && envUser && envPass && safeUsername === envUser && safePassword === envPass) {
      const passwordHash = await bcrypt.hash(password, 10);
      const created = await DashboardUserModel.create({
        username: safeUsername,
        passwordHash,
        role: 'ADMIN',
        permissions: ADMIN_PERMISSIONS
      });
      user = created.toObject();
      console.log('[Dashboard Auth] Created admin from env on login', safeUsername);
    }

    if (!user) {
      return res.status(401).json({ ok: false, error: 'INVALID_LOGIN' });
    }

    let match = false;
    try {
      match = await bcrypt.compare(password, user.passwordHash || '');
    } catch {
      match = false;
    }

    // Se o hash não coincidir mas as envs batem, atualiza o hash e permite login.
    if (!match && envUser && envPass && safeUsername === envUser && safePassword === envPass) {
      const passwordHash = await bcrypt.hash(password, 10);
      await DashboardUserModel.updateOne({ _id: user._id }, { $set: { passwordHash } }).exec();
      match = true;
      console.log('[Dashboard Auth] Updated admin hash from env on login', safeUsername);
    }

    if (!match) {
      return res.status(401).json({ ok: false, error: 'INVALID_LOGIN' });
    }

    const payload = {
      id: user._id.toString(),
      role: user.role,
      permissions: user.permissions || {},
      username: user.username
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });

    return res.json({
      ok: true,
      token
    });
  } catch (err) {
    console.error('[Dashboard Auth] login error', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

app.get('/api/auth/me', requireDashboardAuth, async (req, res) => {
  const u = req.dashboardUser;
  if (!u) {
    return res.status(401).json({ ok: false, error: 'NO_USER' });
  }

  return res.json({
    ok: true,
    user: {
      id: u._id || null,
      username: u.username || 'env-token',
      role: u.role || 'ADMIN',
      permissions: u.permissions || {},
      allowedGuildIds: Array.isArray(u.allowedGuildIds) ? u.allowedGuildIds : []
    }
  });
});

// Create / list users (ADMIN / canManageUsers only).
app.get('/api/auth/users', requireDashboardAuth, async (req, res) => {
  const u = req.dashboardUser;
  const perms = (u && u.permissions) || {};
  const isAdmin = u && u.role === 'ADMIN';
  if (!isAdmin && !perms.canManageUsers) {
    return res.status(403).json({ ok: false, error: 'NO_PERMISSION' });
  }

  const users = await DashboardUserModel.find({})
    .select('-passwordHash')
    .sort({ username: 1 })
    .lean();

  return res.json({ ok: true, users });
});

app.post('/api/auth/users', requireDashboardAuth, express.json(), async (req, res) => {
  const u = req.dashboardUser;
  const perms = (u && u.permissions) || {};
  const isAdmin = u && u.role === 'ADMIN';
  if (!isAdmin && !perms.canManageUsers) {
    return res.status(403).json({ ok: false, error: 'NO_PERMISSION' });
  }

  try {
    const { username, password, role, permissions, allowedGuildIds } = req.body || {};

    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ ok: false, error: 'MISSING_FIELDS' });
    }

    const safeUsername = normalizeUsername(username);
    if (!safeUsername || safeUsername.length < 3) {
      return res.status(400).json({ ok: false, error: 'INVALID_USERNAME' });
    }

    // Basic password policy (dashboard-only, not Discord)
    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({ ok: false, error: 'WEAK_PASSWORD' });
    }

    const existing = await DashboardUserModel.findOne({ username: safeUsername }).lean();
    if (existing) {
      return res.status(409).json({ ok: false, error: 'USERNAME_EXISTS' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await DashboardUserModel.create({
      username: safeUsername,
      passwordHash,
      role: role === 'ADMIN' ? 'ADMIN' : 'MOD',
      permissions: normalizePermissions(permissions),
      allowedGuildIds: parseAllowedGuildIds(allowedGuildIds)
    });

    return res.json({
      ok: true,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        permissions: user.permissions,
        allowedGuildIds: Array.isArray(user.allowedGuildIds) ? user.allowedGuildIds : []
      }
    });
  } catch (err) {
    console.error('[Dashboard Auth] create user error', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});


app.patch('/api/auth/users/:id', requireDashboardAuth, express.json(), async (req, res) => {
  const u = req.dashboardUser;
  const perms = (u && u.permissions) || {};
  const isAdmin = u && u.role === 'ADMIN';
  if (!isAdmin && !perms.canManageUsers) {
    return res.status(403).json({ ok: false, error: 'NO_PERMISSION' });
  }

  try {
    const userId = req.params.id;
    const { role, permissions, allowedGuildIds } = req.body || {};

    const update = {};
    if (role && (role === 'ADMIN' || role === 'MOD')) {
      update.role = role;
    }
    if (permissions && typeof permissions === 'object') {
      update.permissions = normalizePermissions(permissions);
    }
    if (Array.isArray(allowedGuildIds)) {
      update.allowedGuildIds = parseAllowedGuildIds(allowedGuildIds);
    }

    // Avoid empty $set (Mongo treats it as no-op, but keep it explicit)
    if (!Object.keys(update).length) {
      return res.status(400).json({ ok: false, error: 'NO_CHANGES' });
    }

    const updated = await DashboardUserModel.findByIdAndUpdate(
      userId,
      { $set: update },
      { new: true }
    ).select('-passwordHash');

    if (!updated) {
      return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    }

    return res.json({ ok: true, user: updated });
  } catch (err) {
    console.error('[Dashboard Auth] update user error', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});


app.delete('/api/auth/users/:id', requireDashboardAuth, async (req, res) => {
  const u = req.dashboardUser;
  const perms = (u && u.permissions) || {};
  const isAdmin = u && u.role === 'ADMIN';
  if (!isAdmin && !perms.canManageUsers) {
    return res.status(403).json({ ok: false, error: 'NO_PERMISSION' });
  }

  try {
    const userId = req.params.id;
    const existing = await DashboardUserModel.findById(userId).lean();
    if (!existing) {
      return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    }

    await DashboardUserModel.deleteOne({ _id: userId });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[Dashboard Auth] delete user error', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

}

module.exports = { registerAuthRoutes };
