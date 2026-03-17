require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  console.log("Fetching stations...");
  const { data, error } = await supabase.from("stations").select("*");
  if (error) {
    console.error("Fetch error:", error);
  } else {
    console.log(`Found ${data.length} stations.`);
    if (data.length > 0) console.log(data[0]);
  }
}
check();
