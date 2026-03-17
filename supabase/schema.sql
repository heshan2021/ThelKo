-- Phase 1: Database Architecture

-- Enable PostGIS extension for geospatial calculations
CREATE EXTENSION IF NOT EXISTS postgis;

-- Custom ENUMs
CREATE TYPE fuel_status AS ENUM ('Available', 'Empty', 'Unknown');
CREATE TYPE report_status AS ENUM ('Available', 'Empty');

-- Table: users
CREATE TABLE users (
    device_id UUID PRIMARY KEY,
    trust_score INTEGER DEFAULT 10,
    is_shadowbanned BOOLEAN DEFAULT false
);

-- Table: stations
CREATE TABLE stations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    location GEOGRAPHY(Point, 4326) NOT NULL,
    status_92 fuel_status DEFAULT 'Unknown',
    status_95 fuel_status DEFAULT 'Unknown',
    status_auto_diesel fuel_status DEFAULT 'Unknown',
    status_super_diesel fuel_status DEFAULT 'Unknown',
    status_kerosene fuel_status DEFAULT 'Unknown',
    last_updated TIMESTAMPTZ DEFAULT now()
);

-- Table: reports
CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    station_id UUID REFERENCES stations(id) ON DELETE CASCADE,
    device_id UUID REFERENCES users(device_id) ON DELETE CASCADE,
    fuel_type TEXT NOT NULL,
    reported_status report_status NOT NULL,
    user_location GEOGRAPHY(Point, 4326) NOT NULL,
    is_remote BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Phase 2: Anti-Spam Backend Logic

-- Geofencing & Rate Limiting Function (RPC)
CREATE OR REPLACE FUNCTION submit_fuel_report(
    p_station_id UUID,
    p_device_id UUID,
    p_fuel_type TEXT,
    p_reported_status report_status,
    p_user_lon DOUBLE PRECISION,
    p_user_lat DOUBLE PRECISION
) RETURNS JSON AS $$
DECLARE
    v_user_location GEOGRAPHY(Point, 4326);
    v_station_location GEOGRAPHY(Point, 4326);
    v_is_remote BOOLEAN := false;
    v_recent_reports_count INTEGER;
BEGIN
    -- 1. Rate Limiting Check: > 3 reports in last 5 minutes
    SELECT COUNT(*) INTO v_recent_reports_count
    FROM reports
    WHERE device_id = p_device_id
      AND created_at > (now() - INTERVAL '5 minutes');

    IF v_recent_reports_count >= 3 THEN
        -- Silently return success to potentially malicious user
        RETURN json_build_object('success', true, 'message', 'Report received (rate limited)');
    END IF;

    -- Ensure user exists (frictionless tracking)
    INSERT INTO users (device_id)
    VALUES (p_device_id)
    ON CONFLICT (device_id) DO NOTHING;

    -- 2. Geofencing
    v_user_location := ST_SetSRID(ST_MakePoint(p_user_lon, p_user_lat), 4326)::geography;
    
    SELECT location INTO v_station_location
    FROM stations
    WHERE id = p_station_id;

    -- Verify if user is beyond 200 meters from the station
    IF ST_Distance(v_user_location, v_station_location) > 200 THEN
        v_is_remote := true;
    END IF;

    -- Insert the report
    INSERT INTO reports (
        station_id, device_id, fuel_type, reported_status, user_location, is_remote
    ) VALUES (
        p_station_id, p_device_id, p_fuel_type, p_reported_status, v_user_location, v_is_remote
    );

    RETURN json_build_object('success', true, 'message', 'Report successfully submitted');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Consensus Engine Trigger Function
CREATE OR REPLACE FUNCTION process_consensus_report()
RETURNS TRIGGER AS $$
DECLARE
    v_distinct_reporters INTEGER;
    v_is_shadowbanned BOOLEAN;
BEGIN
    -- Check if the user is shadowbanned
    SELECT is_shadowbanned INTO v_is_shadowbanned FROM users WHERE device_id = NEW.device_id;
    
    IF v_is_shadowbanned OR NEW.is_remote THEN
        RETURN NEW; -- Ignore from consensus calculations
    END IF;

    -- Count distinct users reporting THIS EXACT STATUS for THIS EXACT FUEL TYPE at THIS STATION in the last 15 minutes
    SELECT COUNT(DISTINCT device_id) INTO v_distinct_reporters
    FROM reports
    WHERE station_id = NEW.station_id
      AND fuel_type = NEW.fuel_type
      AND reported_status = NEW.reported_status
      AND is_remote = false
      AND created_at > (now() - INTERVAL '15 minutes');

    -- If 3 distinct devices reported the exact same status
    IF v_distinct_reporters >= 3 THEN
        -- Dynamically update the correct fuel column in stations
        EXECUTE format('
            UPDATE stations 
            SET status_%I = %L::fuel_status, last_updated = now() 
            WHERE id = %L', 
            NEW.fuel_type, NEW.reported_status, NEW.station_id
        );

        -- Increment trust score of users who participated in this consensus
        UPDATE users
        SET trust_score = trust_score + 1
        WHERE device_id IN (
            SELECT DISTINCT device_id
            FROM reports
            WHERE station_id = NEW.station_id
              AND fuel_type = NEW.fuel_type
              AND reported_status = NEW.reported_status
              AND is_remote = false
              AND created_at > (now() - INTERVAL '15 minutes')
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Map Trigger to Reports Table
CREATE TRIGGER trigger_consensus_engine
AFTER INSERT ON reports
FOR EACH ROW
EXECUTE FUNCTION process_consensus_report();
