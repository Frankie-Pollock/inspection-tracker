import { supabase } from "./supabaseClient.js";

export async function requireAuth() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) window.location.href = "./login.html";
}
``
