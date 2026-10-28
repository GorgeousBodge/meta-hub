/* Mail Deck demo data (used with ?demo; never touches the server).
   Times are relative to now so the inbox always looks fresh. */
window.MAIL_DEMO = (() => {
  const ago = (mins) => new Date(Date.now() - mins * 60000).toISOString();

  const messages = [
    {
      id: 'g:demo1', account: 'google', unread: true, date: ago(9),
      from: { name: 'Sam Patel', address: 'sam.patel@example.com' },
      subject: 'Five-a-side on Thursday?',
      text: 'Hi mate,\n\nWe\'re one short for five-a-side at Spectrum this Thursday, 7pm kick-off. Any chance you can make it? Pitch is booked, it\'s £6 each on the night.\n\nLet me know by tomorrow if you can so I can tell the others.\n\nCheers,\nSam',
      replies: [
        'Count me in for Thursday — see you at Spectrum just before 7.',
        'Can\'t promise yet. Can I let you know by tomorrow lunchtime?',
        'Sorry, I can\'t make this Thursday. Hope you find someone — next time!',
      ],
    },
    {
      id: 'o:demo2', account: 'microsoft', unread: true, date: ago(47),
      from: { name: 'Surrey Hills Society', address: 'news@surreyhills.example.org' },
      subject: 'Autumn walks programme and volunteer day on 8 November',
      text:
        'Dear member,\n\nThank you for your continued support this year. As the leaves turn, we are delighted to share our autumn walks programme, which runs from the start of November until mid-December.\n\n' +
        'Guided walks\n• Saturday 2 November: St Martha\'s Hill and the Chantries, 5 miles, meeting at Chilworth station at 10am.\n• Sunday 10 November: Box Hill stepping stones and the North Downs Way, 6 miles, moderate climbs, meeting at the National Trust café at 9.30am.\n• Saturday 23 November: Newlands Corner to Silent Pool, 4 miles, easy, dogs welcome on leads.\n• Sunday 8 December: a festive walk around Shere, finishing at the village hall for mince pies.\n\n' +
        'Walks are free for members, but places are limited to 20 people, so please book through the members’ page at least three days ahead. Bring waterproofs and sturdy footwear, as paths can be very muddy at this time of year.\n\n' +
        'Volunteer day\nWe are also looking for volunteers on Saturday 8 November to help clear scrub and repair a stretch of fencing near Newlands Corner. Tools, gloves and a hot lunch are provided. We meet at 9am at the main car park and finish by 3pm. If you would like to come, please reply to this email by Friday 1 November so we can order enough food and equipment.\n\n' +
        'Annual meeting\nOur annual members’ meeting will be held online on Wednesday 27 November at 7pm. The agenda and joining details will follow by email a week before.\n\n' +
        'Thank you again for helping to look after the Surrey Hills.\n\nWith best wishes,\nThe Surrey Hills Society team',
      summary: 'The autumn guided walks run from 2 November to 8 December, free for members but limited to 20 places, booked three days ahead. Volunteers are wanted for scrub clearing near Newlands Corner on 8 November.',
      action: 'Reply by Friday 1 November to join the volunteer day.',
      replies: [
        'I\'d like to help at the volunteer day on 8 November. Please count me in for lunch too.',
        'Thanks for this. Is there any parking at Chilworth for the 2 November walk?',
        'I can\'t make the volunteer day this time, but I\'ll book onto one of the walks.',
      ],
    },
    {
      id: 'g:demo3', account: 'google', unread: true, date: ago(130),
      from: { name: 'Guildford Library', address: 'libraries@surreycc.example.gov.uk' },
      subject: 'Your reserved item is ready to collect',
      text: 'Hello,\n\nThe item you reserved is now waiting for you at Guildford Library:\n\nThe Overstory — Richard Powers\n\nPlease collect it within 7 days. After that it will be passed to the next person in the queue.\n\nSurrey Libraries',
      replies: [
        'Thanks, I\'ll pick it up this week.',
        'Thank you. Could you hold it until Saturday?',
        'Thanks, but I no longer need it, so please pass it on.',
      ],
    },
    {
      id: 'o:demo4', account: 'microsoft', unread: false, date: ago(60 * 5),
      from: { name: 'Mum', address: 'mum@example.co.uk' },
      subject: 'Sunday lunch',
      text: 'Hello love,\n\nAre you still all right for Sunday? I\'m doing a roast, about 1 o\'clock. Bring a jumper, the heating\'s playing up again.\n\nLove Mum xx',
      replies: [
        'Yes, still on for Sunday. I\'ll be there for 1, jumper packed!',
        'Can we make it 2 o\'clock instead? I\'ll bring pudding.',
        'Sorry Mum, I can\'t make this Sunday. Can we do next weekend?',
      ],
    },
    {
      id: 'g:demo5', account: 'google', unread: false, date: ago(60 * 26),
      from: { name: 'South Western Railway', address: 'noreply@swr.example.co.uk' },
      subject: 'Your Delay Repay claim has been approved',
      text: 'Your claim for the 17:42 Waterloo to Guildford on 21 October has been approved. £8.40 will be refunded to your original payment card within 5 working days.\n\nThank you for travelling with South Western Railway.',
      replies: ['Thank you.', 'Thanks. Could you confirm which card it will go to?', 'Thanks for sorting this so quickly.'],
    },
    {
      id: 'o:demo6', account: 'microsoft', unread: false, date: ago(60 * 50),
      from: { name: 'Alex Morgan', address: 'alex.morgan@example.com' },
      subject: 'Re: Board games night',
      text: 'Sounds good! I\'ll bring Wingspan and some snacks. Should we start at 7.30?\n\nAlex',
      replies: ['7.30 is perfect, see you then.', 'Could we start at 8? I\'m back late from Woking.', 'Great, I\'ll sort drinks.'],
    },
    {
      id: 'g:demo7', account: 'google', unread: false, date: ago(60 * 24 * 4),
      from: { name: 'Vercel', address: 'notifications@vercel.example.com' },
      subject: 'Deployment ready: meta-deck',
      text: 'Your deployment for meta-deck is ready.\n\nBranch: main\nCommit: Add Mail Deck\n\nYou are receiving this because you have notifications enabled.',
      replies: ['Thanks!', 'Noted, thanks.', 'Thanks for the update.'],
    },
  ];

  return { messages };
})();
