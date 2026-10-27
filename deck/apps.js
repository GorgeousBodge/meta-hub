/* ==========================================================================
   The apps in this repo, in launcher order. Add a line here when you add an
   app folder (see docs/NEW-APP.md). The hub reads this; apps don't need it.
     id     folder name and key in /api/status ("apps": { id: … })
     name   tile title
     blurb  one short line under the title
     icon   SVG body on a 64×64 grid (the same shapes as the app's glasses icon)
   ========================================================================== */
window.DECK_APPS = [
  {
    id: 'home',
    name: 'Home',
    blurb: 'Lights · heating · TV',
    icon: '<path d="M12 31 32 14l20 17" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 27v22h28V27" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><rect x="27" y="34" width="10" height="9" rx="1.5" fill="currentColor"/>',
  },
  {
    id: 'news',
    name: 'News',
    blurb: 'Headlines · briefing',
    icon: '<rect x="12" y="15" width="17" height="15" rx="1.5" fill="currentColor"/><path d="M35 17h17M35 27h17M12 37h40M12 45h40" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>',
  },
  {
    id: 'nav',
    name: 'Nav',
    blurb: 'Directions · trains · buses',
    icon: '<path d="M15 50V40h12l10-10" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M51 14 44.5 34.5 40.2 26.8 32.5 22.5Z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  },
];
