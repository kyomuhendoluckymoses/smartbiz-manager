import { createClient } from "@supabase/supabase-js";

export const supabaseUrl = "YOUR_SUPABASE_URL";
export const supabaseKey = "YOUR_KEY_HERE";
export const supabase = createClient(supabaseUrl, supabaseKey);
