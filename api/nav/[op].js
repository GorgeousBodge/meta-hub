// Nav Deck server: one Vercel function for all of Nav's endpoints, so the whole hub stays
// well inside the Hobby plan's 12-function limit.
//   /api/nav/route    walking / cycling directions (openrouteservice)
//   /api/nav/geocode  place, street and postcode search
//   /api/nav/reverse  nearest address to a point
//   /api/nav/nearby   stations and bus stops near you (OpenStreetMap)
//   /api/nav/trains   live departures (Rail Data Marketplace)
//   /api/nav/buses    live bus times (TransportAPI)
// Each handler lives in api/_lib/nav/ and checks the access code itself.
const { send } = require('../_lib/common.js');

const HANDLERS = {
  route: require('../_lib/nav/route.js'),
  geocode: require('../_lib/nav/geocode.js'),
  reverse: require('../_lib/nav/reverse.js'),
  nearby: require('../_lib/nav/nearby.js'),
  trains: require('../_lib/nav/trains.js'),
  buses: require('../_lib/nav/buses.js'),
};

module.exports = async (req, res) => {
  const handler = HANDLERS[String(req.query.op || '')];
  if (!handler) return send(res, 404, { error: 'Unknown Nav endpoint' });
  return handler(req, res);
};
