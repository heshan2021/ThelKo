-- Insert mock fuel stations across Sri Lanka for testing Thel Thiyenawada

INSERT INTO stations (name, address, location, status_92, status_95, status_auto_diesel, status_super_diesel, status_kerosene, last_updated)
VALUES
  (
    'Ceypetco Mount Lavinia',
    'Galle Rd, Mount Lavinia, Colombo',
    ST_SetSRID(ST_MakePoint(79.8653, 6.8378), 4326)::geography,
    'Available', 'Unknown', 'Available', 'Empty', 'Unknown',
    now() - interval '30 minutes'
  ),
  (
    'LIOC Bambalapitiya',
    'Galle Rd, Colombo 04',
    ST_SetSRID(ST_MakePoint(79.8542, 6.8906), 4326)::geography,
    'Empty', 'Available', 'Unknown', 'Available', 'Unknown',
    now() - interval '1 hour'
  ),
  (
    'Ceypetco Kandy Town Primary',
    'Dalada Vidiya, Kandy',
    ST_SetSRID(ST_MakePoint(80.6358, 7.2941), 4326)::geography,
    'Available', 'Available', 'Available', 'Unknown', 'Empty',
    now() - interval '10 minutes'
  ),
  (
    'Sinopec Hambantota',
    'Main Street, Hambantota',
    ST_SetSRID(ST_MakePoint(81.1219, 6.1246), 4326)::geography,
    'Unknown', 'Unknown', 'Empty', 'Empty', 'Available',
    now() - interval '4 hours' -- This will trigger the 2-hour decay logic in UI
  ),
  (
    'Ceypetco Galle Fort',
    'Rampart St, Galle',
    ST_SetSRID(ST_MakePoint(80.2170, 6.0268), 4326)::geography,
    'Available', 'Empty', 'Available', 'Available', 'Available',
    now() - interval '5 minutes'
  ),
  (
    'LIOC Kurunegala Central',
    'Colombo Rd, Kurunegala',
    ST_SetSRID(ST_MakePoint(80.3662, 7.4871), 4326)::geography,
    'Empty', 'Empty', 'Empty', 'Unknown', 'Unknown',
    now() - interval '1 day' -- Decay trigger test
  ),
  (
    'Sinopec Anuradhapura',
    'Puttalam Rd, Anuradhapura',
    ST_SetSRID(ST_MakePoint(80.4077, 8.3510), 4326)::geography,
    'Available', 'Available', 'Available', 'Available', 'Available',
    now() - interval '1 minute'
  ),
  (
    'Ceypetco Nuwara Eliya',
    'Lawson St, Nuwara Eliya',
    ST_SetSRID(ST_MakePoint(80.7818, 6.9733), 4326)::geography,
    'Empty', 'Available', 'Unknown', 'Empty', 'Available',
    now() - interval '45 minutes'
  );
