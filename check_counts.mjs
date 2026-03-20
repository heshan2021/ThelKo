import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: unknownData } = await supabase.from('stations').select('id').eq('official_hours', 'Unknown');
  const { data: knownData } = await supabase.from('stations').select('id').neq('official_hours', 'Unknown');
  console.log(`Stations with Unknown hours: ${unknownData?.length || 0}`);
  console.log(`Stations with Known hours: ${knownData?.length || 0}`);
}
check();
