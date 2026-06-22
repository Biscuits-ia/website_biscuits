// src/pages/api/me/export-data.ts
// RGPD  Droit d'\''accs : exporte toutes les donnes personnelles de l'\''utilisateur
// courant dans un fichier JSON tlchargeable. Conforme Art. 15 RGPD.

import type { APIRoute } from "astro";
import { createSupabaseClient } from "@/lib/supabase";

export const prerender = false;

export const GET: APIRoute = async ({ request, cookies }) => {
  const supabase = createSupabaseClient({ request, cookies });
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Non authentifi." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Tables personnelles exportes. Les RLS policies filtrent par user_id.
  const personalTables = [
    "profiles",
    "volunteer_appointments",
    "workshop_registrations",
    "requests",
    "activity_logs",
  ] as const;

  const exportPayload: Record<string, unknown> = {
    exported_at: new Date().toISOString(),
    user_id: user.id,
    email: user.email,
    metadata: user.user_metadata,
    data: {} as Record<string, unknown>,
  };

  const dataBag = exportPayload.data as Record<string, unknown>;

  for (const table of personalTables) {
    const column = table === "profiles" ? "id" : "user_id";
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq(column, user.id);

    if (error) {
      dataBag[table] = { error: error.message };
    } else {
      dataBag[table] = data ?? [];
    }
  }

  const filename = `biscuits-ia-export-${user.id}-${Date.now()}.json`;
  return new Response(JSON.stringify(exportPayload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
};
