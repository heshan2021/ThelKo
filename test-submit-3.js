import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testSubmit() {
  const { data: stations, error: err1 } = await supabase.from('stations').select('*').limit(1);
  if (!stations || stations.length === 0) return;
  const stationId = stations[0].id;
  
  console.log("Testing with station:", stations[0].name);
  console.log("Current status_92:", stations[0].status_92);

  const { data, error } = await supabase.rpc("submit_fuel_report", {
    p_station_id: stationId,
    p_device_id: uuidv4(),
    p_fuel_type: "92",
    p_reported_status: "Available",
    p_user_lon: 79.9,
    p_user_lat: 6.9
  });

  if (error) {
    console.error("RPC Error:", JSON.stringify(error, null, 2));
  } else {
    console.log("Success Report 1 (Available):", data);
  }
}
testSubmit();
