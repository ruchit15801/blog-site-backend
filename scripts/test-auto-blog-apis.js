const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:4000';
const EMAIL = process.env.TEST_ADMIN_EMAIL || 'admin@blogcafeai.com';
const PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'Admin@12345!';

async function request(path, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text };
    }
    return { status: res.status, ok: res.ok, body };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const out = {};

  try {
    out.health = await request('/', { method: 'GET' }, 7000);
  } catch (err) {
    out.health = { error: err.message };
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  try {
    out.login = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
  } catch (err) {
    out.login = { error: err.message };
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  const loginToken = out.login.body?.accessToken || out.login.body?.token;
  if (!out.login.ok || !loginToken) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  const token = loginToken;
  const authHeaders = { Authorization: `Bearer ${token}` };

  try {
    out.settingsGet = await request('/api/admin/auto-blog/settings', {
      method: 'GET',
      headers: authHeaders,
    });
    out.settingsPatch = await request('/api/admin/auto-blog/settings', {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ enabled: true }),
    });
    out.logs = await request('/api/admin/auto-blog/logs', {
      method: 'GET',
      headers: authHeaders,
    });
    out.runNow = await request('/api/admin/auto-blog/run-now', {
      method: 'POST',
      headers: authHeaders,
    }, 180000);
  } catch (err) {
    out.runNow = { error: err.message };
  }

  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error('API smoke test failed:', err.message);
  process.exit(1);
});
