/* ==========================================================================
   Connect page (/connect/) — connect and disconnect the Gmail and Outlook
   accounts. Desktop page; uses Deck only for the shared access code.
   Everything from the server is shown with textContent.
   ========================================================================== */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const DAY = 86400000;

  function banner(msg, isError) {
    const b = $('banner');
    b.textContent = msg;
    b.classList.toggle('err', !!isError);
    b.hidden = !msg;
  }

  // Result of a sign-in, passed back in the address; shown once, then removed.
  (function readResult() {
    const p = new URLSearchParams(location.search);
    if (p.get('connected')) {
      const label = p.get('connected') === 'google' ? 'Gmail' : 'Outlook';
      banner(`${label} connected${p.get('email') ? `: ${p.get('email')}` : ''}.`);
    } else if (p.get('error')) {
      banner(p.get('error'), true);
    }
    if (p.has('connected') || p.has('error') || p.has('email')) {
      ['connected', 'error', 'email'].forEach((k) => p.delete(k));
      const qs = p.toString();
      history.replaceState(null, '', location.pathname + (qs ? `?${qs}` : ''));
    }
  })();

  async function call(op, { method = 'GET', body } = {}) {
    const q = new URLSearchParams({ c: Deck.code });
    const r = await fetch(`/api/connect/${op}?${q}`, {
      method,
      cache: 'no-store',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = {};
    try { data = await r.json(); } catch { /* keep {} */ }
    if (!r.ok) {
      const e = new Error(data.error || `Server error ${r.status}`);
      e.status = r.status;
      e.locked = !!data.locked;
      throw e;
    }
    return data;
  }

  const when = (ms) => (ms ? new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function accountCard(a, storageOk) {
    const card = el('article', 'cx-card');
    const top = el('div', 'cx-card-top');
    top.append(el('h2', null, a.label));
    let pill;
    if (!a.configured) pill = el('span', 'cx-pill err', 'Not set up');
    else if (a.connected && a.needsReconnect) pill = el('span', 'cx-pill warn', 'Sign in again');
    else if (a.connected) pill = el('span', 'cx-pill ok', 'Connected');
    else pill = el('span', 'cx-pill off', 'Not connected');
    top.append(pill);
    card.append(top);

    if (a.connected) {
      card.append(el('div', 'cx-email', a.email || '(address not available)'));
      const meta = el('div', 'cx-meta');
      meta.append(el('div', null, `Connected ${when(a.connectedAt)}`));
      const refreshed = el('div', null, `Last token refresh ${when(a.refreshedAt)}`);
      // Microsoft refresh tokens lapse 90 days after the last one was issued
      if (a.provider === 'microsoft' && a.rotatedAt && Date.now() - a.rotatedAt > 75 * DAY) {
        refreshed.className = 'warn';
        refreshed.textContent += ' — over 75 days: open Mail soon or reconnect';
      }
      meta.append(refreshed);
      if (a.scopes && a.scopes.length) meta.append(el('div', null, `Access: ${a.scopes.join(', ')}`));
      if (a.needsReconnect) meta.append(el('div', 'warn', 'The provider stopped accepting the saved sign-in. Press Reconnect.'));
      card.append(meta);
    } else {
      const msg = !a.configured
        ? `Add ${a.missing.join(' and ')} in Vercel, then redeploy.`
        : !storageOk ? 'Finish the storage setup below first.' : 'Not connected yet.';
      card.append(el('div', 'cx-meta', msg));
    }
    if (a.error) card.append(el('div', 'cx-meta warn', a.error));

    const actions = el('div', 'cx-actions');
    const canConnect = a.configured && storageOk;
    const connect = el('button', 'cx-btn cx-btn-amber', a.connected ? 'Reconnect' : 'Connect');
    connect.type = 'button';
    connect.disabled = !canConnect;
    connect.addEventListener('click', () => {
      // A full-page visit: the server redirects to Google / Microsoft sign-in
      location.href = `/api/connect/start?${new URLSearchParams({ provider: a.provider, c: Deck.code })}`;
    });
    actions.append(connect);
    if (a.connected) {
      const off = el('button', 'cx-btn cx-btn-quiet', 'Disconnect');
      off.type = 'button';
      off.addEventListener('click', async () => {
        if (!confirm(`Disconnect ${a.label} (${a.email || 'this account'})? Mail and Calendar will stop showing it until you connect again.`)) return;
        off.disabled = true;
        try {
          await call('disconnect', { method: 'POST', body: { provider: a.provider } });
          banner(`${a.label} disconnected.`);
          await load();
        } catch (e) {
          banner(e.message, true);
          off.disabled = false;
        }
      });
      actions.append(off);
    }
    card.append(actions);
    return card;
  }

  function checks(data) {
    const s = data.storage;
    const list = $('checks');
    list.replaceChildren();
    const add = (ok, text, note) => {
      const li = el('li', ok ? 'ok' : 'bad', text);
      if (note) li.append(' ', el('span', null, note));
      list.append(li);
    };
    add(s.url && s.token, 'Upstash Redis connected', s.url && s.token ? `(${s.urlFrom})` : 'Add the Upstash integration from the Vercel Marketplace and connect it to this project');
    add(s.key, 'TOKEN_KEY set', s.key ? '' : s.keyError);
    for (const a of data.accounts) add(a.configured, `${a.label} client ID and secret`, a.configured ? '' : `missing ${a.missing.join(', ')}`);
    $('keyGen').hidden = s.key;
    $('redirect').value = data.redirectUri;
  }

  async function load() {
    try {
      const data = await call('status');
      $('codePanel').hidden = true;
      $('main').hidden = false;
      const grid = $('accounts');
      grid.replaceChildren(...data.accounts.map((a) => accountCard(a, data.storage.configured)));
      checks(data);
    } catch (e) {
      if (e.status === 401) {
        $('main').hidden = true;
        $('codePanel').hidden = false;
        if (Deck.code) banner('Wrong access code', true);
        $('codeInput').focus();
      } else {
        banner(e.message, true);
      }
    }
  }

  /* ---------- buttons ---------- */
  $('codeForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('codeInput').value.trim();
    if (!v) return;
    Deck.setCode(v);
    $('codeInput').value = '';
    banner('');
    load();
  });

  async function copy(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
      const old = btn.textContent;
      btn.textContent = 'Copied';
      setTimeout(() => { btn.textContent = old; }, 1500);
    } catch {
      banner('Copy failed: select the text and copy it by hand.', true);
    }
  }
  $('copyRedirect').addEventListener('click', (e) => copy($('redirect').value, e.currentTarget));

  // TOKEN_KEY: 32 random bytes as base64, made locally with the browser's crypto
  $('genKey').addEventListener('click', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    $('keyOut').value = btoa(String.fromCharCode(...bytes));
    $('copyKey').disabled = false;
  });
  $('copyKey').addEventListener('click', (e) => copy($('keyOut').value, e.currentTarget));

  $('forget').addEventListener('click', (e) => {
    e.preventDefault();
    Deck.store.del('deck.code');
    Deck.setCode('');
    location.reload();
  });

  if (!Deck.code) { $('codePanel').hidden = false; $('codeInput').focus(); } else load();
})();
