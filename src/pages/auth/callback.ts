import type { APIRoute } from "astro";
import { createSupabaseClient } from "@/lib/supabase";

export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  const authCode = url.searchParams.get("code");

  if (!authCode) {
    return new Response("No code provided", { status: 400 });
  }

  const supabase = createSupabaseClient({ request: new Request(url), cookies });
  const { error } = await supabase.auth.exchangeCodeForSession(authCode);

  if (error) {
    return redirect("/connexion?error=session");
  }

  // Les cookies de session sont posés automatiquement par createSupabaseClient → setAll
  return redirect("/dashboard/user");
};
