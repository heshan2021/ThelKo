-- Existing: 'Available', 'Empty', 'Unknown'
-- New ENUM creation script (requires dropping default constraints temporarily)
ALTER TYPE fuel_status ADD VALUE IF NOT EXISTS 'Likely Available';
ALTER TYPE fuel_status ADD VALUE IF NOT EXISTS 'Confirmed Available';
ALTER TYPE fuel_status ADD VALUE IF NOT EXISTS 'Not Sure';

CREATE OR REPLACE FUNCTION process_consensus_report()
RETURNS TRIGGER AS $$
DECLARE
    v_distinct_available INT;
    v_distinct_empty INT;
    v_current_status fuel_status;
    v_target_column TEXT;
BEGIN
    -- Prevent Geofence spoofing
    IF NEW.is_remote = true THEN
        RETURN NEW;
    END IF;

    v_target_column := 'status_' || NEW.fuel_type;

    -- Get current status of THIS fuel at THIS station
    EXECUTE format('SELECT %I FROM stations WHERE id = %L', v_target_column, NEW.station_id) INTO v_current_status;

    -- Get vote counts for the last 15 minutes
    SELECT COUNT(DISTINCT device_id) INTO v_distinct_available
    FROM reports WHERE station_id = NEW.station_id AND fuel_type = NEW.fuel_type AND reported_status = 'Available' AND created_at > (now() - INTERVAL '15 minutes');

    SELECT COUNT(DISTINCT device_id) INTO v_distinct_empty
    FROM reports WHERE station_id = NEW.station_id AND fuel_type = NEW.fuel_type AND reported_status = 'Empty' AND created_at > (now() - INTERVAL '15 minutes');

    -- State Machine Logic
    IF NEW.reported_status = 'Empty' AND (v_current_status = 'Available' OR v_current_status = 'Likely Available' OR v_current_status = 'Confirmed Available') THEN
        -- Immediate Dispute
        EXECUTE format('UPDATE stations SET %I = %L::fuel_status, last_updated = now() WHERE id = %L', v_target_column, 'Not Sure', NEW.station_id);
    ELSIF NEW.reported_status = 'Available' THEN
        IF v_distinct_available >= 2 THEN
            EXECUTE format('UPDATE stations SET %I = %L::fuel_status, last_updated = now() WHERE id = %L', v_target_column, 'Confirmed Available', NEW.station_id);
        ELSIF v_current_status != 'Confirmed Available' THEN
            EXECUTE format('UPDATE stations SET %I = %L::fuel_status, last_updated = now() WHERE id = %L', v_target_column, 'Likely Available', NEW.station_id);
        END IF;
    ELSIF NEW.reported_status = 'Empty' THEN
        -- Two empty votes confirm empty, one vote keeps it disputed/unknown
        IF v_distinct_empty >= 2 THEN
            EXECUTE format('UPDATE stations SET %I = %L::fuel_status, last_updated = now() WHERE id = %L', v_target_column, 'Empty', NEW.station_id);
        ELSE
            EXECUTE format('UPDATE stations SET %I = %L::fuel_status, last_updated = now() WHERE id = %L', v_target_column, 'Not Sure', NEW.station_id);
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
