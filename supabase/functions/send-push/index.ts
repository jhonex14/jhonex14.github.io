import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { JWT } from "npm:google-auth-library@9";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const type = payload.type;
    const record = payload.record;
    const old_record = payload.old_record;

    // We only care about new requests (INSERT) or approved requests (UPDATE)
    const isNewRequest = type === 'INSERT';
    const isApproved = type === 'UPDATE' && record.status === 'approved' && old_record.status !== 'approved';

    if (!isNewRequest && !isApproved) {
      return new Response(JSON.stringify({ ignored: true, reason: 'Not an insert or approval update' }), { headers: corsHeaders, status: 200 });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // If new request, notify faculty. If approved, notify student.
    const recipientId = isNewRequest ? record.faculty_id : record.student_id;
    
    // Fetch recipient's FCM token
    const profileResponse = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${recipientId}&select=fcm_token`, {
      headers: {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
      }
    });
    
    const profileData = await profileResponse.json();
    const fcmToken = profileData[0]?.fcm_token;

    if (!fcmToken) {
      return new Response(JSON.stringify({ error: 'User has no FCM token saved' }), { status: 200, headers: corsHeaders });
    }

    // Parse the Firebase Service Account JSON from the environment variable
    const serviceAccountJson = JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT') || '{}');
    
    if (!serviceAccountJson.client_email) {
      return new Response(JSON.stringify({ error: 'Firebase credentials missing' }), { status: 500, headers: corsHeaders });
    }

    // Authenticate with Google
    const jwtClient = new JWT({
      email: serviceAccountJson.client_email,
      key: serviceAccountJson.private_key,
      scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
    });
    
    const tokens = await jwtClient.authorize();
    const accessToken = tokens.access_token;
    
    // Construct the notification message
    let title = '';
    let body = '';
    if (isNewRequest) {
        title = 'New Consultation Request';
        body = `A student requested a consultation on ${record.appointment_date} at ${record.start_time.substring(0, 5)}`;
    } else {
        title = 'Consultation Approved!';
        body = `Your request for ${record.appointment_date} at ${record.start_time.substring(0, 5)} was approved by the faculty.`;
    }

    // Send the notification via FCM HTTP v1 API
    const fcmResponse = await fetch(`https://fcm.googleapis.com/v1/projects/${serviceAccountJson.project_id}/messages:send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        message: {
          token: fcmToken,
          notification: {
            title: title,
            body: body
          },
          data: {
            appointment_id: record.id
          }
        }
      })
    });

    const fcmResult = await fcmResponse.json();
    return new Response(JSON.stringify({ success: true, result: fcmResult }), { headers: corsHeaders, status: 200 });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { headers: corsHeaders, status: 400 });
  }
});
