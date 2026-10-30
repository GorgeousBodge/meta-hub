// Turn a picked address suggestion into a full address with coordinates (Ideal Postcodes, Royal Mail
// address file). This is the step that uses one of your purchased lookups, so the answer is cached
// for 30 days at Vercel's edge, and the app keeps the coordinates once it has them.
const { cleanKey, send, fetchT, upstreamError, allowed } = require('../common.js');

// Royal Mail town names come in capitals: "GUILDFORD" -> "Guildford", "STOKE-ON-TRENT" -> "Stoke-on-Trent"
const titleCase = (t) => String(t || '').toLowerCase().replace(/(^|[\s-])([a-z])/g, (m, p, c) => p + c.toUpperCase())
  .replace(/-(On|Upon|Under|In|Le|By|The)-/g, (m) => m.toLowerCase());

module.exports = async (req, res) => {
  if (!allowed(req, res)) return;
  const key = cleanKey(process.env.IDEAL_POSTCODES_KEY);
  if (!key) return send(res, 500, { error: 'IDEAL_POSTCODES_KEY is not set in Vercel' });
  const id = String(req.query.id || '').trim();
  if (!/^[A-Za-z0-9_.:-]{2,100}$/.test(id)) return send(res, 400, { error: 'Invalid address ID' });
  try {
    const r = await fetchT(`https://api.ideal-postcodes.co.uk/v1/autocomplete/addresses/${encodeURIComponent(id)}/gbr?` +
      new URLSearchParams({ api_key: key }), {}, 10000);
    if (r.status === 402) return send(res, 502, { error: 'Ideal Postcodes balance used up. Top up, or remove IDEAL_POSTCODES_KEY to switch address search off.' });
    if (r.status === 404) return send(res, 404, { error: 'That address could not be found. Search again.' });
    if (!r.ok) return send(res, 502, { error: await upstreamError(r, 'Ideal Postcodes') });
    const j = await r.json();
    const a = j.result || j;
    if (a.latitude == null || a.longitude == null || a.latitude === '' || a.longitude === '') {
      return send(res, 502, { error: 'No location for this address. Try its postcode instead.' });
    }
    const line1 = [a.organisation_name && !String(a.line_1 || '').includes(a.organisation_name) ? a.organisation_name : '', a.line_1]
      .filter(Boolean).join(', ');
    send(res, 200, {
      aid: id,
      name: line1 || a.postcode || 'Address',
      sub: [a.line_2, a.line_3, titleCase(a.post_town), a.postcode].filter(Boolean).join(', '),
      lat: Number(a.latitude),
      lon: Number(a.longitude),
      uprn: a.uprn || '',
    }, 30 * 86400);
  } catch (e) {
    send(res, 502, { error: e.message || 'Address lookup failed' });
  }
};
