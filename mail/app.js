/* ==========================================================================
   Mail Deck — Gmail + Outlook.com inbox, reading and replies on the glasses.
   Shared HUD, access code, lock screen and keys come from /deck/deck.js.
   Server: /api/mail/<op> (api/mail/[op].js). Accounts are connected on /connect/.

   Email content is untrusted: it is only ever put on screen with textContent,
   no images are loaded and nothing is ever opened from a message.
   ========================================================================== */
(() => {
  'use strict';

  const POLL_MS = 2 * 60 * 1000;
  const SPEAK_MAX = 4000;
  const TABS = [
    { key: 'all', label: 'All' },
    { key: 'google', label: 'Gmail' },
    { key: 'microsoft', label: 'Outlook' },
  ];
  const ACCOUNT_LABEL = { google: 'Gmail', microsoft: 'Outlook' };

  const $ = (id) => document.getElementById(id);
  const VIEWS = { inbox: $('inbox'), read: $('reader'), reply: $('composer'), confirm: $('confirm') };

  const state = {
    view: 'inbox',
    tab: Deck.store.get('mail.tab', 'all'),
    items: [],
    accounts: {},
    unread: { total: 0, more: false },
    current: null,      // the open message (full)
    currentItem: null,  // its row in the inbox
    lastFocusId: null,
    suggestions: {},    // id -> [replies]
    drafts: {},         // id -> draft text
    finalText: '',
    sending: false,
    speaking: false,
    stale: false,
    pollTimer: null,
  };
  if (!TABS.some((t) => t.key === state.tab)) state.tab = 'all';

  /* ---------- server or demo ---------- */
  const DEMO = window.MAIL_DEMO || { messages: [] };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const demoMsg = (id) => DEMO.messages.find((m) => m.id === id);

  const server = {
    async list() {
      if (Deck.demo) {
        await wait(250);
        const items = DEMO.messages.map(({ id, account, unread, date, from, subject, text }) => ({ id, account, unread, date, from, subject, snippet: text.slice(0, 120) }));
        const count = (a) => items.filter((m) => m.unread && (!a || m.account === a)).length;
        return {
          items,
          accounts: {
            google: { ok: true, connected: true, label: 'Gmail', unread: count('google') },
            microsoft: { ok: true, connected: true, label: 'Outlook', unread: count('microsoft') },
          },
          unread: { total: count(), more: false },
        };
      }
      return Deck.api('mail/list', {}, { timeout: 25000 });
    },
    async unread() {
      if (Deck.demo) {
        const total = DEMO.messages.filter((m) => m.unread).length;
        return { total, more: false };
      }
      return Deck.api('mail/unread');
    },
    async read(id) {
      if (Deck.demo) {
        await wait(300);
        const m = demoMsg(id);
        return {
          ...m,
          replyTo: m.from,
          accountLabel: ACCOUNT_LABEL[m.account],
          accountEmail: m.account === 'google' ? 'you@gmail.example' : 'you@outlook.example',
          long: m.text.length > 1100,
          ai: true,
          signOff: 'Russ',
        };
      }
      return Deck.api('mail/read', { id });
    },
    async seen(id) {
      if (Deck.demo) { const m = demoMsg(id); if (m) m.unread = false; return { ok: true }; }
      return Deck.api('mail/seen', {}, { method: 'POST', body: { id } });
    },
    async summary(id) {
      if (Deck.demo) { await wait(900); const m = demoMsg(id); return { summary: m.summary || '', action: m.action || '' }; }
      return Deck.api('mail/summary', {}, { method: 'POST', body: { id }, timeout: 30000 });
    },
    async suggest(id) {
      if (Deck.demo) { await wait(1100); return { replies: demoMsg(id).replies || [] }; }
      return Deck.api('mail/suggest', {}, { method: 'POST', body: { id }, timeout: 30000 });
    },
    async tidy(id, text) {
      if (Deck.demo) {
        await wait(800);
        let t = text.replace(/\b(um+|uh+|erm|like,)\s*/gi, '').replace(/\s+/g, ' ').trim();
        t = t.charAt(0).toUpperCase() + t.slice(1);
        if (!/[.!?]$/.test(t)) t += '.';
        return { text: t };
      }
      return Deck.api('mail/tidy', {}, { method: 'POST', body: { id, text }, timeout: 30000 });
    },
    async send(id, text) {
      if (Deck.demo) { await wait(900); return { ok: true, demo: true }; }
      return Deck.api('mail/send', {}, { method: 'POST', body: { id, text }, timeout: 30000 });
    },
  };

  /* ---------- small helpers ---------- */
  function node(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text; // always textContent: mail is untrusted
    return n;
  }

  const senderName = (from) => (from && (from.name || from.address)) || 'Unknown sender';

  function shortTime(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const yest = new Date(now); yest.setDate(now.getDate() - 1);
    if (d.toDateString() === yest.toDateString()) return 'Yesterday';
    if (now - d < 6 * 86400000) return d.toLocaleDateString('en-GB', { weekday: 'short' });
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  const longTime = (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  function badge(account) {
    return node('span', `badge is-${account}`, ACCOUNT_LABEL[account] || account);
  }

  const unreadLabel = () => {
    const n = state.unread.total;
    if (!n) return 'All read';
    return `${n}${state.unread.more ? '+' : ''} unread`;
  };

  function setUnread(u) {
    state.unread = { total: Number(u.total) || 0, more: !!u.more };
    Deck.title('Mail', unreadLabel());
    // The launcher badge reads this too, so its count is right straight away
    Deck.store.set('mail.unread', { count: state.unread.total, more: state.unread.more, at: Date.now(), demo: Deck.demo });
  }

  /* ---------- views ---------- */
  function show(view) {
    state.view = view;
    for (const [k, v] of Object.entries(VIEWS)) v.hidden = k !== view;
    Deck.back(view !== 'inbox');
    const hints = {
      inbox: [['Swipe', 'move'], ['Pinch', 'open'], ['← →', 'account']],
      read: [['Swipe', 'scroll'], ['Pinch', 'select'], ['Back', 'inbox']],
      reply: [['Pinch', 'pick or write'], ['Swipe', 'move'], ['Back', 'message']],
      confirm: [['Pinch', 'choose'], ['Swipe', 'scroll'], ['Back', 'edit']],
    }[view];
    Deck.hints(hints);
  }

  /* ---------- inbox ---------- */
  function renderTabs() {
    const bar = $('tabs');
    bar.replaceChildren(...TABS.map((t) => {
      const b = node('button', `tab focusable${t.key === state.tab ? ' is-active' : ''}`);
      b.type = 'button';
      b.dataset.tab = t.key;
      b.append(t.label);
      const n = t.key === 'all' ? state.unread.total : (state.accounts[t.key] && state.accounts[t.key].unread) || 0;
      if (n) b.append(node('span', 'tab-count', String(n)));
      b._select = () => setTab(t.key, false);
      return b;
    }));
  }

  function visibleItems() {
    return state.tab === 'all' ? state.items : state.items.filter((m) => m.account === state.tab);
  }

  function rowFor(m) {
    const b = node('button', `card mail-row focusable${m.unread ? ' is-unread' : ''}`);
    b.type = 'button';
    b.dataset.id = m.id;
    if (m.unread) b.append(node('span', 'unread-mark'));
    const top = node('div', 'mail-row-top');
    top.append(node('span', 'mail-from', senderName(m.from)), node('span', 'mail-time', shortTime(m.date)));
    const subject = node('div', 'mail-subject', m.subject);
    const bottom = node('div', 'mail-row-bottom');
    bottom.append(badge(m.account));
    if (m.unread) bottom.append(node('span', 'card-meta', 'Unread'));
    b.append(top, subject, bottom);
    b.setAttribute('aria-label', `${m.unread ? 'Unread. ' : ''}${senderName(m.from)}: ${m.subject}`);
    b._select = () => openMessage(m);
    return b;
  }

  function accountNotes() {
    const notes = [];
    for (const key of ['google', 'microsoft']) {
      if (state.tab !== 'all' && state.tab !== key) continue;
      const a = state.accounts[key];
      if (!a || a.ok) continue;
      const n = node('div', 'mail-note');
      n.append(node('b', null, `${ACCOUNT_LABEL[key]}: `));
      n.append(a.connected === false
        ? 'not connected. Open /connect/ on your computer to sign in.'
        : a.reconnect ? 'needs signing in again on /connect/.' : (a.error || 'couldn’t load.'));
      notes.push(n);
    }
    return notes;
  }

  function renderList({ keepFocus = true } = {}) {
    const list = $('list');
    const items = visibleItems();
    const rows = items.map(rowFor);
    const notes = accountNotes();
    if (!rows.length) {
      const anyConnected = Object.values(state.accounts).some((a) => a && a.ok);
      rows.push(node('div', 'notice', anyConnected ? 'Nothing new here.' : 'No accounts connected yet.'));
    }
    list.replaceChildren(...rows, ...notes);
    renderTabs();
    if (state.view === 'inbox' && keepFocus) {
      const target = (state.lastFocusId && list.querySelector(`[data-id="${CSS.escape(state.lastFocusId)}"]`)) ||
        list.querySelector('.mail-row') || $('tabs').querySelector('.is-active');
      const active = document.activeElement;
      // Only move focus if it's not on a tab the user is using
      if (!active || !$('inbox').contains(active) || active.classList.contains('mail-row') || active === document.body) Deck.focus(target);
    }
  }

  function setTab(key, focusFirstRow) {
    if (state.tab === key && !focusFirstRow) return;
    state.tab = key;
    Deck.store.set('mail.tab', key);
    state.lastFocusId = null;
    renderList({ keepFocus: false });
    $('list').scrollTop = 0;
    const tabBtn = $('tabs').querySelector(`[data-tab="${key}"]`);
    if (focusFirstRow) Deck.focus($('list').querySelector('.mail-row') || tabBtn);
    else Deck.focus(tabBtn);
  }

  async function loadInbox({ quiet = false } = {}) {
    if (!quiet) Deck.status('loading');
    try {
      const data = await server.list();
      state.items = data.items || [];
      state.accounts = data.accounts || {};
      setUnread(data.unread || {});
      state.stale = false;
      renderList();
      const anyFail = Object.values(state.accounts).some((a) => a && !a.ok && a.connected !== false);
      Deck.status(Deck.demo ? 'demo' : anyFail ? 'cached' : 'live', Deck.demo ? null : anyFail ? 'Partial' : null);
    } catch (err) {
      if (err.locked) return;
      Deck.status('offline');
      if (!quiet) {
        const list = $('list');
        if (!state.items.length) {
          const s = node('div', 'state');
          s.append(node('div', 'state-title err', 'Couldn’t load mail'), node('div', 'state-msg', err.message));
          list.replaceChildren(s);
        }
        Deck.toast(err.message, { error: true });
      }
    }
  }

  /* ---------- reading ---------- */
  function fillHeader(m) {
    $('rdFrom').textContent = senderName(m.from);
    $('rdBadge').replaceWith(Object.assign(badge(m.account), { id: 'rdBadge' }));
    $('rdSubject').textContent = m.subject;
    const addr = m.from && m.from.name && m.from.address ? `${m.from.address} · ` : '';
    $('rdMeta').textContent = `${addr}${longTime(m.date)}`;
  }

  async function openMessage(item) {
    stopSpeaking();
    state.currentItem = item;
    state.lastFocusId = item.id;
    state.current = null;
    fillHeader(item);
    $('rdSum').hidden = true;
    $('rdText').textContent = 'Opening…';
    $('rdText').classList.add('is-loading');
    $('rdBody').scrollTop = 0;
    show('read');
    Deck.focus($('rdBody'));
    try {
      const m = await server.read(item.id);
      if (!state.currentItem || state.currentItem.id !== item.id) return; // moved on meanwhile
      state.current = m;
      fillHeader(m);
      $('rdText').classList.remove('is-loading');
      $('rdText').textContent = m.text || '(This message has no text.)';
      if (m.long && m.ai) loadSummary(m);
      if (item.unread) markSeen(item);
    } catch (err) {
      if (err.locked) return;
      $('rdText').classList.remove('is-loading');
      $('rdText').textContent = `Couldn’t open this message. ${err.message}`;
    }
  }

  async function loadSummary(m) {
    $('rdSum').hidden = false;
    $('rdSumText').textContent = 'Summarising…';
    $('rdSumText').classList.add('is-loading');
    $('rdSumAction').hidden = true;
    try {
      const s = await server.summary(m.id);
      if (!state.current || state.current.id !== m.id) return;
      m.summaryText = s.summary;
      m.actionText = s.action;
      $('rdSumText').classList.remove('is-loading');
      $('rdSumText').textContent = s.summary || 'No summary available.';
      $('rdSumAction').hidden = !s.action;
      $('rdSumAction').textContent = s.action ? `→ ${s.action}` : '';
    } catch (err) {
      if (err.locked) return;
      $('rdSum').hidden = true;
    }
  }

  async function markSeen(item) {
    item.unread = false;
    if (state.unread.total > 0) setUnread({ total: state.unread.total - 1, more: state.unread.more });
    const acc = state.accounts[item.account];
    if (acc && acc.unread > 0) acc.unread -= 1;
    try {
      await server.seen(item.id);
    } catch (err) {
      if (!err.locked) Deck.toast('Couldn’t mark as read', { error: true });
    }
  }

  /* ---------- listen ---------- */
  function setSpeaking(on) {
    state.speaking = on;
    $('btnListen').classList.toggle('is-speaking', on);
    $('btnListenLabel').textContent = on ? 'Stop' : 'Listen';
  }
  function stopSpeaking() { if (state.speaking) Deck.hush(); setSpeaking(false); }

  function listen() {
    const m = state.current;
    if (!m) return;
    if (state.speaking) { stopSpeaking(); return; }
    if (!Deck.canSpeak) { Deck.toast('Speech isn’t available here', { error: true }); return; }
    const parts = [`From ${senderName(m.from)}.`, `${m.subject}.`];
    if (m.summaryText) parts.push(`Summary: ${m.summaryText}`, m.actionText ? `${m.actionText}.` : '', 'The message:');
    parts.push(String(m.text || '').slice(0, SPEAK_MAX));
    const ok = Deck.say(parts.filter(Boolean).join(' '), { onend: () => setSpeaking(false) });
    setSpeaking(!!ok);
  }

  /* ---------- replying ---------- */
  function openReply() {
    const m = state.current;
    if (!m) { Deck.toast('Still opening the message…'); return; }
    stopSpeaking();
    const head = $('rpHead');
    head.replaceChildren('Reply to ', node('b', null, senderName(m.replyTo || m.from)), ` · ${m.accountLabel || ACCOUNT_LABEL[m.account]}`);
    $('rpText').value = state.drafts[m.id] || '';
    show('reply');
    $('rpList').scrollTop = 0;
    renderSuggestions(m);
    updateTidy();
  }

  function renderSuggestions(m) {
    const box = $('rpSuggest');
    const cached = state.suggestions[m.id];
    if (cached) {
      box.replaceChildren(...cached.map((text) => {
        const b = node('button', 'card suggestion focusable');
        b.type = 'button';
        b.append(node('span', 'card-title', text));
        b._select = () => { $('rpText').value = text; state.drafts[m.id] = text; review(); };
        return b;
      }));
      if (!cached.length) box.replaceChildren(node('div', 'rp-wait', 'No suggestions for this one. Write your own below.'));
      // Land on the first idea, unless you've already started writing your own
      const active = document.activeElement;
      const writing = active === $('rpText') && $('rpText').value.trim();
      const elsewhere = active && $('composer').contains(active) && active !== $('rpText');
      if (state.view === 'reply' && !writing && !elsewhere) Deck.focus(box.querySelector('.suggestion') || $('rpText'));
      return;
    }
    if (!m.ai) {
      box.replaceChildren(node('div', 'rp-wait', 'AI suggestions are off. Write your reply below.'));
      Deck.focus($('rpText'));
      return;
    }
    const waitEl = node('div', 'rp-wait');
    waitEl.append(node('div', 'spin'), 'Thinking of replies…');
    box.replaceChildren(waitEl);
    Deck.focus($('rpText'));
    server.suggest(m.id).then((r) => {
      state.suggestions[m.id] = (r.replies || []).filter(Boolean);
      if (state.view === 'reply' && state.current && state.current.id === m.id) {
        renderSuggestions(m);
      }
    }).catch((err) => {
      if (err.locked) return;
      state.suggestions[m.id] = [];
      if (state.view === 'reply') box.replaceChildren(node('div', 'rp-wait', 'Couldn’t get suggestions. Write your reply below.'));
    });
  }

  function updateTidy() {
    const has = $('rpText').value.trim().length > 0;
    $('btnTidy').disabled = !has || !(state.current && state.current.ai);
    $('btnReview').disabled = !has;
  }

  async function tidy() {
    const m = state.current;
    const text = $('rpText').value.trim();
    if (!m || !text) return;
    const btn = $('btnTidy');
    btn.disabled = true;
    Deck.toast('Tidying…', { ms: 4000 });
    try {
      const r = await server.tidy(m.id, text);
      $('rpText').value = r.text || text;
      state.drafts[m.id] = $('rpText').value;
      Deck.toast('Tidied — check it, then Review');
    } catch (err) {
      if (!err.locked) Deck.toast(err.message, { error: true });
    } finally {
      updateTidy();
      Deck.focus($('btnReview'));
    }
  }

  function withSignOff(text, signOff) {
    const t = text.trim();
    if (!signOff) return t;
    const tail = t.slice(-signOff.length - 2).toLowerCase();
    return tail.includes(signOff.toLowerCase()) ? t : `${t}\n\n${signOff}`;
  }

  function review() {
    const m = state.current;
    const text = $('rpText').value.trim();
    if (!m) return;
    if (!text) { Deck.toast('Write or pick a reply first', { error: true }); Deck.focus($('rpText')); return; }
    state.drafts[m.id] = text;
    state.finalText = withSignOff(text, m.signOff);
    const to = m.replyTo || m.from;
    const from = $('cfFrom');
    from.replaceChildren(node('b', null, m.accountLabel || ACCOUNT_LABEL[m.account]), ` ${m.accountEmail || ''}`);
    $('cfTo').textContent = to && to.name ? `${to.name} <${to.address}>` : (to && to.address) || '';
    $('cfSubject').textContent = m.subject;
    $('cfText').textContent = state.finalText;
    $('cfText').scrollTop = 0;
    $('btnSend').disabled = false;
    $('btnEdit').disabled = false;
    show('confirm');
    Deck.focus($('btnEdit')); // Send is never the default: it takes a deliberate swipe
  }

  async function sendNow() {
    const m = state.current;
    if (!m || state.sending) return;
    state.sending = true;
    $('btnSend').disabled = true;
    $('btnEdit').disabled = true;
    Deck.toast('Sending…', { ms: 8000 });
    try {
      const r = await server.send(m.id, state.finalText);
      delete state.drafts[m.id];
      Deck.toast(r && r.demo ? 'Sent (demo — nothing was sent)' : 'Reply sent', { ms: 3000 });
      show('read');
      Deck.focus($('btnReply'));
    } catch (err) {
      if (!err.locked) Deck.toast(err.message, { error: true, ms: 4000 });
      $('btnSend').disabled = false;
      $('btnEdit').disabled = false;
      Deck.focus($('btnEdit'));
    } finally {
      state.sending = false;
    }
  }

  /* ---------- back ---------- */
  function goBack() {
    if (state.view === 'confirm') { show('reply'); Deck.focus($('rpText')); updateTidy(); return true; }
    if (state.view === 'reply') {
      if (state.current) state.drafts[state.current.id] = $('rpText').value;
      show('read'); Deck.focus($('btnReply')); return true;
    }
    if (state.view === 'read') {
      stopSpeaking();
      state.current = null;
      state.currentItem = null;
      show('inbox');
      renderList();
      if (state.stale) loadInbox({ quiet: true });
      return true;
    }
    return false;
  }

  /* ---------- keys ---------- */
  function scrollBox(box, dir) {
    const max = box.scrollHeight - box.clientHeight;
    if (dir === 'down' && box.scrollTop >= max - 2) return false;
    if (dir === 'up' && box.scrollTop <= 2) return false;
    box.scrollBy({ top: dir === 'down' ? 150 : -150, behavior: 'smooth' });
    return true;
  }

  function inboxKey(action, cur) {
    const tabs = [...$('tabs').querySelectorAll('.tab')];
    const rows = [...$('list').querySelectorAll('.mail-row')];
    const tabIndex = TABS.findIndex((t) => t.key === state.tab);
    if (action === 'left' || action === 'right') {
      const next = tabIndex + (action === 'right' ? 1 : -1);
      if (next < 0 || next >= TABS.length) { Deck.bump(cur); return; }
      setTab(TABS[next].key, rows.includes(cur));
      return;
    }
    if (tabs.includes(cur)) {
      if (action === 'down') { if (rows[0]) Deck.focus(rows[0]); else Deck.bump(cur); } else Deck.bump(cur);
      return;
    }
    const i = rows.indexOf(cur);
    if (i < 0) { Deck.focus(rows[0] || tabs[tabIndex]); return; }
    if (action === 'up') { Deck.focus(i === 0 ? tabs[tabIndex] : rows[i - 1]); return; }
    if (action === 'down') { if (rows[i + 1]) Deck.focus(rows[i + 1]); else Deck.bump(cur); }
  }

  function readKey(action, cur) {
    const body = $('rdBody');
    const listenBtn = $('btnListen');
    const replyBtn = $('btnReply');
    if (cur !== body && cur !== listenBtn && cur !== replyBtn) { Deck.focus(body); return; }
    if (cur === body) {
      if (action === 'down') { if (!scrollBox(body, 'down')) Deck.focus(replyBtn); }
      else if (action === 'up') { if (!scrollBox(body, 'up')) Deck.bump(body); }
      else if (action === 'left') Deck.focus(listenBtn);
      else if (action === 'right') Deck.focus(replyBtn);
      return;
    }
    if (action === 'up') Deck.focus(body);
    else if (action === 'left' && cur === replyBtn) Deck.focus(listenBtn);
    else if (action === 'right' && cur === listenBtn) Deck.focus(replyBtn);
    else Deck.bump(cur);
  }

  function replyKey(action, cur) {
    const items = [...$('composer').querySelectorAll('.suggestion, #rpText, .rp-keys .key:not(:disabled)')];
    if (!items.includes(cur)) { Deck.focus(items[0]); return; }
    const next = Deck.nearest(items, cur, action);
    if (next) Deck.focus(next); else Deck.bump(cur);
  }

  function confirmKey(action, cur) {
    const text = $('cfText');
    const edit = $('btnEdit');
    const sendBtn = $('btnSend');
    if (cur === text) {
      if (action === 'down' && !scrollBox(text, 'down')) Deck.focus(edit);
      else if (action === 'up' && !scrollBox(text, 'up')) Deck.bump(text);
      else if (action === 'left') Deck.focus(edit);
      else if (action === 'right') Deck.focus(sendBtn);
      return;
    }
    if (action === 'up') Deck.focus(text);
    else if (action === 'right' && cur === edit && !sendBtn.disabled) Deck.focus(sendBtn);
    else if (action === 'left' && cur === sendBtn) Deck.focus(edit);
    else if (cur !== edit && cur !== sendBtn) Deck.focus(edit);
    else Deck.bump(cur);
  }

  function onKey(e) {
    const action = Deck.action(e);
    if (!action) return;
    const cur = document.activeElement;

    // In the reply box: typing, Backspace, Enter, ← → and the glasses' input all
    // work natively. Up/Down and Escape move out of it.
    if (cur && cur.id === 'rpText') {
      if (action === 'up' || action === 'down') {
        e.preventDefault();
        state.drafts[state.current ? state.current.id : ''] = cur.value;
        replyKey(action, cur);
      } else if (e.key === 'Escape') {
        // Back: out of the box to Review, or back to the message if nothing's written
        e.preventDefault();
        if ($('btnReview').disabled) goBack(); else Deck.focus($('btnReview'));
      }
      return;
    }

    e.preventDefault();
    if (action === 'select') {
      if (e.repeat) return;
      if (cur === $('hudBack')) { Deck.press(cur); goBack(); return; }
      if (cur && cur._select && !cur.disabled) { Deck.press(cur); cur._select(); }
      return;
    }
    if (action === 'back') {
      if (!goBack() && !Deck.toHub()) Deck.bump(cur);
      return;
    }
    if (state.view === 'inbox') inboxKey(action, cur);
    else if (state.view === 'read') readKey(action, cur);
    else if (state.view === 'reply') replyKey(action, cur);
    else if (state.view === 'confirm') confirmKey(action, cur);
  }

  /* ---------- polling: light, only while visible ---------- */
  async function poll() {
    if (Deck.demo || Deck.locked || document.hidden) return;
    try {
      const u = await server.unread();
      const changed = u.total !== state.unread.total || !!u.more !== state.unread.more;
      setUnread(u);
      Deck.status('live');
      if (changed) {
        if (state.view === 'inbox') loadInbox({ quiet: true });
        else state.stale = true;
      }
    } catch (err) {
      if (!err.locked) Deck.status('offline');
    }
  }

  function startPolling() {
    stopPolling();
    if (Deck.demo) return;
    state.pollTimer = setInterval(poll, POLL_MS);
  }
  function stopPolling() { if (state.pollTimer) clearInterval(state.pollTimer); state.pollTimer = null; }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stopPolling(); stopSpeaking(); } else { poll(); startPolling(); }
  });

  /* ---------- wiring ---------- */
  $('btnListen')._select = listen;
  $('btnReply')._select = openReply;
  $('btnTidy')._select = tidy;
  $('btnReview')._select = review;
  $('btnEdit')._select = () => { show('reply'); Deck.focus($('rpText')); updateTidy(); };
  $('btnSend')._select = sendNow;
  $('rdBody')._select = () => Deck.focus($('btnReply'));
  $('cfText')._select = () => Deck.focus($('btnEdit'));
  $('rpText').addEventListener('input', () => {
    if (state.current) state.drafts[state.current.id] = $('rpText').value;
    updateTidy();
  });

  document.addEventListener('keydown', onKey);
  document.addEventListener('click', (e) => {
    if (e.target.closest('#hudBack')) { goBack(); return; }
    const b = e.target.closest('.focusable');
    if (b && b._select && !b.disabled) b._select();
  });

  function init() {
    show('inbox');
    renderTabs();
    const cached = Deck.store.get('mail.unread', null);
    if (cached && !cached.demo && !Deck.demo) state.unread = { total: cached.count || 0, more: !!cached.more };
    Deck.title('Mail', Deck.demo ? 'Demo' : '');
    loadInbox().then(() => { if (!Deck.locked) Deck.focus($('list').querySelector('.mail-row') || $('tabs').querySelector('.is-active')); });
    startPolling();
  }

  init();
})();
