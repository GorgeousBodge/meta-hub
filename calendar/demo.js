/* Calendar Deck demo data (used with ?demo; never touches the server).
   Built around the moment you open it, so there's always something on now,
   something next and something already done. Uses this device's time zone. */
window.CAL_DEMO = (() => {
  const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/London'; } catch { return 'Europe/London'; } })();
  const pad = (n) => String(n).padStart(2, '0');
  const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const MIN = 60000;

  function build(days = 7) {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayAt = (off, h = 0, m = 0) => new Date(midnight.getFullYear(), midnight.getMonth(), midnight.getDate() + off, h, m);
    const keys = Array.from({ length: days }, (_, i) => keyOf(dayAt(i)));
    // Rounded to 5 minutes, so the times look real
    const round5 = (ms) => Math.round(ms / (5 * MIN)) * 5 * MIN;
    const rel = (mins) => new Date(round5(now.getTime() + mins * MIN));

    let n = 0;
    const ev = (o) => ({ id: `demo${++n}`, account: 'google', calendar: '', location: '', online: '', organiser: '', with: [], people: 0, response: '', free: false, notes: '', ...o });
    const timed = (start, end, o) => ev({ allDay: false, start: start.toISOString(), end: end.toISOString(), ...o });
    const allDay = (fromOff, toOff, o) => ev({ allDay: true, startDay: keys[fromOff] || keyOf(dayAt(fromOff)), endDay: keyOf(dayAt(toOff)), start: dayAt(fromOff).toISOString(), end: dayAt(toOff + 1).toISOString(), ...o });

    const liveStart = rel(-25);
    const nextStart = rel(55);
    const events = [
      allDay(0, 0, { title: 'Recycling collection', calendar: 'Home' }),
      timed(dayAt(0, 7, 30), dayAt(0, 8, 15), { title: 'Gym', location: 'Spectrum Leisure Centre' }),
      timed(liveStart, new Date(liveStart.getTime() + 60 * MIN), {
        account: 'microsoft', title: 'Budget review call', online: 'Teams', organiser: 'Jordan Lee',
        with: ['Jordan Lee', 'Priya Shah'], people: 3,
        notes: 'Quarterly look at the budget before the trustees meeting.\n\n• Spend so far against plan\n• Room hire for the spring\n• Anything to flag early',
      }),
      timed(nextStart, new Date(nextStart.getTime() + 20 * MIN), {
        title: 'Pick up reserved book', location: 'Guildford Library, North Street',
        notes: 'The Overstory — waiting at the counter for 7 days.',
      }),
      timed(dayAt(0, 19), dayAt(0, 20), {
        title: 'Five-a-side', location: 'Spectrum, Guildford', organiser: 'Sam Patel', with: ['Sam Patel'], people: 9,
        notes: '£6 each on the night. Bring a dark and a light top.',
      }),

      timed(dayAt(1, 13), dayAt(1, 15), { account: 'microsoft', title: 'Sunday lunch at Mum’s', location: 'Mum’s', notes: 'Bring a jumper, the heating’s playing up.' }),
      timed(dayAt(1, 19, 30), dayAt(1, 22, 30), { title: 'Board games night', location: 'Alex’s flat', with: ['Alex Morgan'], people: 4, response: 'tentative', notes: 'Alex is bringing Wingspan. I’m on drinks.' }),

      timed(dayAt(2, 10), dayAt(2, 13), {
        title: 'St Martha’s Hill walk', location: 'Chilworth station', calendar: 'Surrey Hills Society',
        notes: '5 miles, meeting at 10am. Waterproofs and sturdy footwear — paths are muddy.',
      }),
      timed(dayAt(2, 18), dayAt(2, 18, 30), { account: 'microsoft', title: 'Call the boiler engineer back', free: true }),

      allDay(3, 3, { account: 'microsoft', title: 'Volunteer day: Newlands Corner', calendar: 'Surrey Hills Society', response: 'invited', location: 'Newlands Corner main car park', notes: '9am to 3pm. Tools, gloves and a hot lunch provided.' }),

      allDay(5, 6, { title: 'Weekend away — Brighton' }),
      timed(dayAt(5, 9, 12), dayAt(5, 10, 41), { title: 'Train to Brighton', location: 'Guildford station, platform 2' }),
    ];

    const within = (e) => {
      const first = e.allDay ? e.startDay : keyOf(new Date(e.start));
      const last = e.allDay ? e.endDay : keyOf(new Date(Math.max(Date.parse(e.start), Date.parse(e.end) - 1)));
      return keys.filter((k) => k >= first && k <= last);
    };
    for (const e of events) e.on = within(e);

    return {
      tz,
      today: keys[0],
      days: keys,
      events: events.filter((e) => e.on.length).sort((a, b) => Date.parse(a.start) - Date.parse(b.start)),
      accounts: {
        google: { ok: true, connected: true, label: 'Google' },
        microsoft: { ok: true, connected: true, label: 'Outlook' },
      },
      demo: true,
    };
  }

  return { build };
})();
