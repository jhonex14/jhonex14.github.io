const fs = require('fs');
const path = require('path');
const supabaseUrl = 'https://uximseyeqkhoghsrksds.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV4aW1zZXllcWtob2doc3Jrc2RzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNjYwODksImV4cCI6MjA5NDY0MjA4OX0.5BdspRtw7IBI201E-RrqXiDJ-MDQFBpKhJlaujP-i6w';

async function checkProfiles() {
    try {
        const response = await fetch(`${supabaseUrl}/rest/v1/profiles?select=*`, {
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`
            }
        });
        const data = await response.json();
        fs.writeFileSync(path.join(__dirname, 'profiles.json'), JSON.stringify(data, null, 2));
        console.log("Saved profiles to profiles.json");
    } catch (err) {
        console.error("Fetch error:", err);
    }
}

checkProfiles();
