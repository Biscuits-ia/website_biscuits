// With `output: 'static'` configured:
// export const prerender = false;
import type { APIRoute } from "astro";
import { createSupabaseClient } from "@/lib/supabase";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const formData = await request.formData();
  const email    = formData.get("email") instanceof File ? null : (formData.get("email") as string | null);
  const password = formData.get("password") instanceof File ? null : (formData.get("password") as string | null);

  if (!email || !password) {
    return new Response("Email and password are required", { status: 400 });
  }

  const supabase = createSupabaseClient({ request, cookies });
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return new Response(error.message, { status: 500 });
  }

  const { access_token, refresh_token } = data.session;
  cookies.set("sb-access-token", access_token, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 jours
  });
  cookies.set("sb-refresh-token", refresh_token, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 jours
  });
  return redirect("/dashboard/user/");
};