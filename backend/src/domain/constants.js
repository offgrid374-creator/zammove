'use strict';
/* Shared business constants. The frontend keeps display copies; the backend values are the ones that count. */
/* hauling vehicle types; 'tw' = 3-wheeler cargo (Bajaj RE / Piaggio Ape class). Prices are placeholders for the company to confirm. */
const HV = [
  { id: 'tw', n: '3-Wheeler', cap: 'Bajaj / Piaggio type · 500 kg · 5 ft bed', base: 600, km: 15 },
  { id: 'pk', n: 'Pickup Truck', cap: '1 ton · 8 ft bed', base: 1200, km: 25 },
  { id: 'l3', n: 'L300 Van', cap: '1.5 tons · 10 ft', base: 1800, km: 30 },
  { id: 'cv', n: 'Closed Van', cap: '3 tons · 14 ft', base: 2500, km: 35 },
  { id: 'w6', n: '6-Wheeler', cap: '6 tons · 20 ft', base: 4000, km: 50 },
];
/* self-drive fleet with the details a customer should see before renting */
const RV = [
  {
    id: 'r1',
    n: 'Toyota Vios',
    sp: '5 seats · Automatic',
    day: 1800,
    color: 'Silver Metallic',
    year: 2022,
    trans: 'Automatic',
    fuel: 'Gasoline',
    seats: 5,
    bags: '2 large bags',
    aircon: true,
    features: ['Air conditioning', 'Bluetooth audio', 'Rear parking camera', 'Dual front airbags'],
    notes: 'Best for city driving and airport runs.',
  },
  {
    id: 'r2',
    n: 'Toyota Hiace',
    sp: '15 seats · Manual',
    day: 3500,
    color: 'White Pearl',
    year: 2021,
    trans: 'Manual',
    fuel: 'Diesel',
    seats: 15,
    bags: 'Rear cargo area for 10+ bags',
    aircon: true,
    features: ['Rear air conditioning', 'Sliding side door', 'USB charging'],
    notes: 'Group trips and family outings; long body, park with care.',
  },
  {
    id: 'r3',
    n: 'Isuzu D-Max',
    sp: '5 seats · 4x4',
    day: 3000,
    color: 'Obsidian Gray',
    year: 2023,
    trans: 'Automatic',
    fuel: 'Diesel',
    seats: 5,
    bags: 'Open cargo bed (no cover)',
    aircon: true,
    features: ['4x4 drive', 'Hill descent control', 'Tow hitch'],
    notes: 'Rough roads and light cargo; the bed is open to rain.',
  },
];
/* rental-only types (passenger vehicles). They can be rented out but never take hauling bookings. */
const RT = [
  { id: 'sd', n: 'Sedan', cap: '4–5 passengers · trunk for 2–3 bags', rentOnly: true },
  { id: 'su', n: 'SUV / AUV', cap: '7 passengers · 3 rows', rentOnly: true },
  { id: 'mv', n: 'Passenger Van', cap: '10–15 passengers', rentOnly: true },
];
/* what each type is good for and the usual seat count; shown on the rental model page */
const TYPE_INFO = {
  tw: { use: 'Small deliveries, a few boxes, market and store runs', seats: 2 },
  pk: { use: 'Furniture pieces, appliances, construction materials', seats: 5 },
  l3: { use: 'Small house or room moves, appliances, store deliveries', seats: 3 },
  cv: { use: 'Full apartment moves, goods that must stay dry', seats: 3 },
  w6: { use: 'Large house moves, bulk goods, business deliveries', seats: 3 },
  sd: { use: 'City driving, airport runs, small families', seats: 5 },
  su: { use: 'Family trips, rough roads, extra luggage', seats: 7 },
  mv: { use: 'Group trips, outings, events', seats: 15 },
};
const VT = [...HV, ...RT]; // every type a vehicle can be registered as
/* rental statuses that hold the vehicle for their dates */
const RBUSY = ['Pending', 'Approved', 'Active'];
const DC = { ZAM10: 0.1, WELCOME: 0.05 },
  /* helpers (movers) the driver brings, at most this many per vehicle type; the mover fee goes to the driver */
  MOV_MAX = { tw: 1, pk: 2, l3: 3, cv: 4, w6: 6 },
  /* how much is being moved: the smallest vehicle type that fits (types in HV are ordered small to large) */
  SIZES = [
    { id: 'S', n: 'A few items (boxes, one appliance)', min: 'tw' },
    { id: 'M', n: 'Studio or one room', min: 'pk' },
    { id: 'L', n: 'Two to three rooms', min: 'l3' },
    { id: 'XL', n: 'Whole house or office', min: 'cv' },
  ],
  LATE_MIN = 30, // a driver this many minutes past the pickup time (not yet at pickup) counts as late
  OPEN_UNTIL_H = 2, // a scheduled booking waits for a driver until this many hours before pickup
  STRIKES_REVIEW = 3, // late/no-show strikes in 90 days that send a driver to admin review
  DEP = 5000, // minimum refundable rental deposit; owners may ask more per vehicle
  DEP_MAX = 100000,
  MOVER_FEE = 500,
  SERVICE_FEE = 0.05;

/* Self-drive rental agreement. The clauses are copied into each rental's contract when the owner approves it,
   so later edits here never change a contract that was already issued. Bump CONTRACT_V when you change them. */
const CONTRACT_V = 2;
/* photos taken at release and at return (all required) */
const HANDOVER_PH = [
  ['front', 'Front'],
  ['back', 'Back'],
  ['left', 'Left side'],
  ['right', 'Right side'],
  ['odo', 'Odometer'],
  ['fuel', 'Fuel gauge'],
];
const CLAIM_DAYS = 3; // the owner may claim against the deposit up to 3 days after the return
const CONTRACT = [
  [
    'Parties and vehicle',
    'The Owner rents the vehicle described above to the Renter for self-drive use, without a driver, for the rental period stated above. ZamMove only connects the parties, records payments and keeps this agreement.',
  ],
  [
    'Rental fee and deposit',
    'The Renter pays the full rental fee and the refundable security deposit stated above through ZamMove before pickup. The vehicle is released only after both are verified. The deposit is returned when the rental is completed, less any amount kept under the Deposit claims clause.',
  ],
  [
    'Authorized driver',
    'Only the Renter may drive the vehicle, using the driver’s license stated above, which must stay valid for the whole rental period. The Renter may not lend, sub-rent or hand over the vehicle to anyone else.',
  ],
  [
    'Permitted use',
    'The vehicle stays within Zamboanga City unless the Owner agrees in writing. It may not be used for hauling or transport for hire, racing, towing, driving under the influence, carrying more passengers than its seats, or any unlawful purpose.',
  ],
  [
    'Location sharing',
    'For the safety of the vehicle, the Renter keeps location sharing switched on in ZamMove (My rentals → Share location) while driving during the rental period. The Owner and ZamMove staff may see the vehicle’s location only from release until the vehicle is returned. Leaving Zamboanga City alerts the Owner.',
  ],
  [
    'Condition, fuel and odometer',
    'At release and at return the Owner records the odometer, fuel level and condition in ZamMove with photos of the front, back, both sides, odometer and fuel gauge, and the Renter confirms them or reports a difference. The Renter returns the vehicle with the same fuel level, clean, with all keys, documents and accessories received.',
  ],
  [
    'Accidents, damage and loss',
    'The Renter reports any accident, damage, breakdown or loss to the Owner and through ZamMove immediately, and to the police when required. The Renter pays for damage, loss and towing caused by the Renter’s fault or by use not allowed in this agreement, after the Owner shows the repair cost.',
  ],
  [
    'Deposit claims',
    'Within 3 days after the return, the Owner may claim part or all of the deposit for damage, missing items, fuel or late return, with photos and the amount. The Renter may accept or dispute the claim in ZamMove; a ZamMove administrator decides disputes from the handover photos and evidence. The rest of the deposit is refunded when the rental is completed.',
  ],
  [
    'Traffic violations',
    'Fines, tolls, parking fees and violations incurred during the rental period are the Renter’s responsibility.',
  ],
  [
    'Late return',
    'The vehicle is returned at the return location on the end date. After a 2-hour grace period, every late day or part of a day is charged at the daily rate unless the Owner agrees to an extension in ZamMove.',
  ],
  [
    'Owner’s obligations',
    'The Owner hands over a roadworthy, clean vehicle with a valid registration (OR/CR) and compulsory third-party liability insurance (CTPL), and tells the Renter about any known defect before release.',
  ],
  [
    'Cancellation',
    'The Renter may cancel in ZamMove before the vehicle is released. Payments already verified are handled under ZamMove’s refund policy.',
  ],
  [
    'Personal data',
    'The parties’ personal data, license and ID photos and location are used only for this rental, safety and legal claims, in line with the Data Privacy Act of 2012 (RA 10173).',
  ],
  [
    'Signatures',
    'This agreement may be signed electronically in ZamMove or on a printed copy. Electronic signatures are valid under the Electronic Commerce Act (RA 8792). Each party can read and print the signed agreement in ZamMove at any time.',
  ],
];

/* Driver service agreement between a vehicle owner and a driver, issued when the driver accepts an assignment. */
const DRIVER_AGREEMENT_V = 1;
const DRIVER_AGREEMENT = [
  [
    'Parties and vehicle',
    'The Owner entrusts the vehicle described above to the Driver to carry out hauling bookings accepted through ZamMove. ZamMove provides the platform, verifies documents and keeps this agreement; it is not the employer of the Driver.',
  ],
  [
    'Earnings',
    'Customers pay through ZamMove. Trip earnings are remitted weekly through the ZamMove cashier. The Driver receives the driver’s share stated above of each trip’s earnings after ZamMove’s service share; the rest belongs to the Owner. Every amount is visible in ZamMove.',
  ],
  [
    'Fuel, maintenance and costs',
    'Fuel is paid by the party stated above. The Owner pays maintenance, repairs from normal wear, registration and insurance. The Driver reports any defect immediately and does not drive an unsafe vehicle.',
  ],
  [
    'Use of the vehicle',
    'The vehicle is used only for bookings accepted in ZamMove, only by the Driver, within Zamboanga City, following traffic laws. No personal use, passengers for hire, other drivers or unlawful use.',
  ],
  [
    'Documents',
    'The Driver keeps the driver’s license and NBI or police clearance valid; the Owner keeps the registration (OR/CR) and compulsory third-party liability insurance (CTPL) valid. Expired documents stop new bookings until they are renewed in ZamMove.',
  ],
  [
    'Trip rules',
    'The Driver follows ZamMove’s trip process: Start PIN, cargo checklist, live location during trips, Delivery PIN and payment recording.',
  ],
  [
    'Care and condition',
    'The Driver keeps the vehicle clean, parks it safely and returns it with its keys, documents and tools when this agreement ends.',
  ],
  [
    'Accidents, damage and violations',
    'Accidents and damage are reported at once through ZamMove and to the Owner. Fines and violations caused by the Driver are the Driver’s responsibility. Damage caused by the Driver’s negligence is settled through ZamMove’s incident process.',
  ],
  [
    'Ending the agreement',
    'Either party may end this agreement in ZamMove, giving the notice period stated above. It may be ended at once for a serious breach such as driving under the influence, unlawful use or fraud. ZamMove may suspend the assignment while a serious incident is investigated.',
  ],
  [
    'Personal data',
    'The parties’ personal data, documents and trip locations are used only for this agreement, safety and legal claims, in line with the Data Privacy Act of 2012 (RA 10173).',
  ],
  [
    'Signatures',
    'This agreement may be signed electronically in ZamMove or on a printed copy. Electronic signatures are valid under the Electronic Commerce Act (RA 8792). An administrator activates the assignment after both parties sign.',
  ],
];

/* the ONE booking status order (+ terminal 'Cancelled', 'Rejected', and 'No driver found') */
const FLOW = [
  'Pending',
  'Accepted',
  'On the Way to Pickup',
  'Awaiting Down Payment',
  'Down Payment Confirmed',
  'Items Loaded',
  'In Transit',
  'Arrived at Destination',
  'Delivery Confirmation',
  'Awaiting Final Payment',
  'Completed',
];
const DRIVER_STEPS = [
  'On the Way to Pickup',
  'Awaiting Down Payment',
  'Items Loaded',
  'Arrived at Destination',
  'Awaiting Final Payment',
];
/* statuses during which the driver's live location is shared with the customer */
const TRACK_ST = [
  'On the Way to Pickup',
  'Awaiting Down Payment',
  'Down Payment Confirmed',
  'Items Loaded',
  'In Transit',
  'Arrived at Destination',
];
const ROAD = ['Items Loaded', 'In Transit', 'Arrived at Destination', 'Delivery Confirmation'];
const CANCEL_OK = ['Pending', 'No driver found', 'Accepted', 'On the Way to Pickup', 'Awaiting Down Payment'],
  CANCEL_FREE = ['Pending', 'No driver found', 'Accepted']; // free until the driver heads to the pickup
const RENTAL_FLOW = ['Pending', 'Approved', 'Active', 'Returned', 'Completed'];

const APP_ST = [
  'Pending Review',
  'Under Verification',
  'Interview Scheduled',
  'Awaiting Additional Documents',
  'For Orientation',
  'Approved',
  'Rejected',
];
const DOCS = {
  driver: [
    'Professional driver’s license',
    'Government-issued ID',
    'NBI or police clearance',
    'Proof of address',
  ],
  owner: ['Government-issued ID', 'Proof of address', 'Business permit (if any)'],
};
const ICT = {
  start: ['Submitted'],
  evidence: ['Under review', 'Statement recorded'],
  statement: ['Under review', 'Evidence requested'],
  decide: ['Under review', 'Evidence requested', 'Statement recorded'],
  close: ['Decision recorded'],
};
const ICTo = {
  start: 'Under review',
  evidence: 'Evidence requested',
  statement: 'Statement recorded',
  decide: 'Decision recorded',
  close: 'Closed',
};

const PIN_TTL = 30 * 6e4,
  MAX_TRY = 5,
  LOCK = 5 * 6e4;
const PAY_OK = ['Recorded by driver', 'Verified'];

/* Zamboanga City places with coordinates (service area), checked against OpenStreetMap (Nominatim) */
const PL = [
  ['Tetuan, Zamboanga City', 6.9194, 122.084],
  ['Sta. Maria, Zamboanga City', 6.9312, 122.0749],
  ['Putik, Zamboanga City', 6.9413, 122.0958],
  ['Tumaga, Zamboanga City', 6.9394, 122.0796],
  ['Guiwan, Zamboanga City', 6.929, 122.0923],
  ['Canelar, Zamboanga City', 6.9163, 122.0703],
  ['Pasonanca, Zamboanga City', 6.9478, 122.0727],
  ['Baliwasan, Zamboanga City', 6.9159, 122.0598],
  ['Ayala, Zamboanga City', 6.965, 121.9477],
  ['Mercedes, Zamboanga City', 6.9586, 122.1476],
  ['Zone I (Downtown), Zamboanga City', 6.9062, 122.0718],
  ['Zone IV, Zamboanga City', 6.9053, 122.0758],
  ['Sta. Catalina, Zamboanga City', 6.9091, 122.0868],
  ['Divisoria, Zamboanga City', 6.9461, 122.1028],
  ['Lunzuran, Zamboanga City', 6.9589, 122.0909],
  ['Sinunuc, Zamboanga City', 6.9337, 122.0015],
  ['Talon-Talon, Zamboanga City', 6.9098, 122.1113],
  ['Recodo, Zamboanga City', 6.9544, 121.9598],
  ['Mampang, Zamboanga City', 6.9157, 122.134],
  ['Pasobolong, Zamboanga City', 6.968, 122.1304],
  ['Maasin, Zamboanga City', 6.9712, 122.0062],
  ['Taluksangay, Zamboanga City', 6.951, 122.1821],
  ['Cabatangan, Zamboanga City', 6.9422, 122.0547],
  ['San Roque, Zamboanga City', 6.9306, 122.0463],
  ['Bunguiao, Zamboanga City', 7.1044, 122.1951],
  ['Vitali, Zamboanga City', 7.3704, 122.2879],
  ['Cawit, Zamboanga City', 6.9557, 121.9739],
  ['Zamboanga City Hall', 6.9039, 122.0765],
  ['Fort Pilar Shrine, Zamboanga City', 6.9013, 122.0827],
  ['Paseo del Mar, Zamboanga City', 6.9003, 122.0812],
  ['Zamboanga International Airport', 6.9222, 122.0598],
  ['KCC Mall de Zamboanga', 6.9198, 122.0735],
  ['Ateneo de Zamboanga University', 6.9104, 122.0761],
  ['Western Mindanao State University, Zamboanga City', 6.9135, 122.0615],
  ['Zamboanga City Port', 6.9032, 122.0728],
  ['Pasonanca Park, Zamboanga City', 6.953, 122.073],
  ['Zamboanga City Public Market', 6.9041, 122.0744],
];
const zcBox = (la, lo) => la >= 6.85 && la <= 7.5 && lo >= 121.9 && lo <= 122.4;
const inZC = t => {
  t = String(t || '').toLowerCase();
  if (t.includes('zamboanga')) return true;
  const c = t.match(/\((-?\d+\.\d+), (-?\d+\.\d+)\)/);
  if (c) return zcBox(+c[1], +c[2]);
  return PL.some(x => t.includes(x[0].split(',')[0].toLowerCase()));
};
const coord = t => {
  const x = PL.find(p => p[0] == t);
  if (x) return [x[1], x[2]];
  const m = String(t || '').match(/\((-?\d+\.\d+), (-?\d+\.\d+)\)/);
  return m && zcBox(+m[1], +m[2]) ? [+m[1], +m[2]] : null;
};
const hv = (a, b) => {
  const r = Math.PI / 180,
    x = (b[0] - a[0]) * r,
    y = (b[1] - a[1]) * r,
    h = Math.sin(x / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(y / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
const kmBetween = (a, b) => {
  const A = coord(a),
    B = coord(b);
  return A && B ? Math.max(1, Math.ceil(hv(A, B) * 1.3)) : 0;
};

/* cargo manifest parsing (pre-departure checklist) */
const FR =
    /fragile|glass|mirror|\btv\b|television|fridge|refrigerator|aircon|appliance|ceramic|lamp|monitor|piano|artwork|china|vase|chandelier/i,
  HVR = /jewel|cash|laptop|\bsafe\b|vault|gold|camera|valuable|computer/i;
const parseItems = t =>
  String(t || '')
    .split(/[\n,;]+|\s+and\s+/i)
    .map(x => x.trim())
    .filter(Boolean)
    .map(x => {
      let q = 1,
        n = x,
        m;
      if ((m = n.match(/^(\d+)\s*(?:x|pcs?|pieces?)?\s+(.+)/i))) {
        q = +m[1];
        n = m[2];
      } else if ((m = n.match(/^(.+?)\s*x\s*(\d+)$/i))) {
        q = +m[2];
        n = m[1];
      }
      const d = n.match(
        /(\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?(?:\s*[x×]\s*\d+(?:\.\d+)?)?\s*(?:cm|in|ft|m)\b)/i
      );
      return {
        n: n.slice(0, 80),
        q: Math.max(1, Math.min(999, q)),
        dim: d ? d[1] : '',
        fr: FR.test(n),
        hv: HVR.test(n),
      };
    });

module.exports = {
  RT,
  TYPE_INFO,
  VT,
  RBUSY,
  HV,
  RV,
  DC,
  DEP,
  DEP_MAX,
  MOV_MAX,
  SIZES,
  LATE_MIN,
  OPEN_UNTIL_H,
  STRIKES_REVIEW,
  coord,
  HANDOVER_PH,
  CLAIM_DAYS,
  CONTRACT_V,
  DRIVER_AGREEMENT_V,
  DRIVER_AGREEMENT,
  CONTRACT,
  MOVER_FEE,
  SERVICE_FEE,
  FLOW,
  DRIVER_STEPS,
  ROAD,
  TRACK_ST,
  CANCEL_OK,
  CANCEL_FREE,
  RENTAL_FLOW,
  APP_ST,
  DOCS,
  ICT,
  ICTo,
  PIN_TTL,
  MAX_TRY,
  LOCK,
  PAY_OK,
  PL,
  zcBox,
  inZC,
  coord,
  hv,
  kmBetween,
  parseItems,
};
