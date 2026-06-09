import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    // Verify the user making the request is logged in
    const {
      data: { user },
      error: authError
    } = await supabaseClient.auth.getUser()

    if (authError || !user) {
      throw new Error('Unauthorized')
    }

    // Optional: We can check if the requester is actually an admin by checking the profiles table
    const { data: adminProfile } = await supabaseClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!adminProfile || adminProfile.role !== 'admin') {
      throw new Error('Forbidden: Only administrators can create users.')
    }

    const { email, password, full_name, id_number, role, department, is_approved } = await req.json()

    if (!email || !password || !full_name || !role) {
      throw new Error('Missing required fields.')
    }

    // Use Service Role Key to bypass RLS and create the user without logging in the requester
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: newAuthUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: {
        full_name,
        role,
        department,
        id_number,
        is_approved
      }
    })

    if (createUserError) {
      throw createUserError
    }

    // Now insert the profile row. The trigger in Supabase might already handle this based on user_metadata,
    // but just in case we manually update/insert it with the correct fields.
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: newAuthUser.user.id,
        email: email,
        full_name: full_name,
        role: role,
        department: department,
        id_number: id_number,
        is_approved: is_approved
      })

    if (profileError) {
       // If profile insert fails, we should technically delete the auth user or handle it, but for simplicity:
       throw profileError
    }

    return new Response(
      JSON.stringify({ success: true, user: newAuthUser.user }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    console.error("Error creating user:", error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
