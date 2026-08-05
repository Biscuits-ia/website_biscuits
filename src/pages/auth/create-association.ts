import type { APIRoute } from 'astro';
import { createSupabaseClient, createSupabaseAdminClient } from '@/lib/supabase';
import {
  EMAIL_RE,
  MAX_ADDRESS,
  MAX_DESCRIPTION,
  MAX_EMAIL,
  MAX_NAME,
  MAX_PHONE,
} from '@/lib/validation';

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    if (!import.meta.env.SUPABASE_URL || !import.meta.env.SUPABASE_ANON_KEY) {
      return new Response(JSON.stringify({ error: 'Configuration Supabase manquante.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const formData = await request.formData();
    const structureName = formData.get('structure_name') as string | null;
    const siret = formData.get('siret') as string | null;
    const rnaNumber = formData.get('rna_number') as string | null;
    const address = formData.get('address') as string | null;
    const phoneNumber = formData.get('phone_number') as string | null;
    const contactEmail = formData.get('contact_email') as string | null;
    const description = formData.get('description') as string | null;

    // Validation
    if (!structureName || !address || !phoneNumber || !contactEmail) {
      return new Response(
        JSON.stringify({ error: 'Veuillez remplir tous les champs obligatoires.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (
      structureName.trim().length > MAX_NAME ||
      address.trim().length > MAX_ADDRESS ||
      phoneNumber.trim().length > MAX_PHONE ||
      contactEmail.trim().length > MAX_EMAIL ||
      (description?.trim().length ?? 0) > MAX_DESCRIPTION
    ) {
      return new Response(
        JSON.stringify({ error: 'Un ou plusieurs champs depassent la longueur autorisee.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!EMAIL_RE.test(contactEmail.trim())) {
      return new Response(JSON.stringify({ error: 'Adresse email invalide.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Valider le SIRET si fourni
    if (siret && !/^\d{14}$/.test(siret)) {
      return new Response(
        JSON.stringify({ error: 'Le numéro SIRET doit contenir exactement 14 chiffres.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Valider le RNA si fourni
    if (rnaNumber && !/^W\d{9}$/.test(rnaNumber)) {
      return new Response(
        JSON.stringify({
          error: 'Le numéro RNA doit avoir le format W suivi de 9 chiffres (ex: W123456789).',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createSupabaseClient({ request, cookies });
    const adminClient = createSupabaseAdminClient();

    // Récupérer l'utilisateur connecté
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Vous devez être connecté.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Vérifier si l'utilisateur a déjà une association
    const { data: existingAssoc } = await adminClient
      .from('associations')
      .select('id')
      .eq('id', user.id)
      .single();

    if (existingAssoc) {
      return new Response(JSON.stringify({ error: 'Vous avez déjà un profil association.' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Créer l'enregistrement dans la table associations (avec admin client pour bypass RLS)
    const { error: assocError } = await adminClient.from('associations').insert({
      id: user.id,
      structure_name: structureName.trim(),
      siret: siret || null,
      rna_number: rnaNumber || null,
      address: address.trim(),
      phone_number: phoneNumber.trim(),
      contact_email: contactEmail.trim().toLowerCase(),
      description: description?.trim() || null,
      is_verified: false,
    });

    if (assocError) {
      console.error('[Auth] create-association error:', assocError);
      return new Response(
        JSON.stringify({ error: 'Erreur lors de la création du profil association.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Créer la demande d'inscription (avec admin client pour bypass RLS)
    const { error: requestError } = await adminClient.from('association_requests').insert({
      structure_name: structureName.trim(),
      siret: siret || null,
      rna_number: rnaNumber || null,
      address: address.trim(),
      phone_number: phoneNumber.trim(),
      contact_email: contactEmail.trim().toLowerCase(),
      description: description?.trim() || null,
      status: 'pending',
    });

    if (requestError) {
      console.error('[Auth] create-association request error:', requestError);
      // On ne bloque pas si la demande échoue, l'association est déjà créée
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Profil association créé avec succès. Votre demande de vérification est en cours.',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[Auth] create-association route error:', err);
    return new Response(JSON.stringify({ error: 'Erreur serveur. Veuillez réessayer.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
