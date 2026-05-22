const supabaseUrl = 'https://uximseyeqkhoghsrksds.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV4aW1zZXllcWtob2doc3Jrc2RzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNjYwODksImV4cCI6MjA5NDY0MjA4OX0.5BdspRtw7IBI201E-RrqXiDJ-MDQFBpKhJlaujP-i6w';

async function main() {
    try {
        // Fetch all profiles
        const profResponse = await fetch(`${supabaseUrl}/rest/v1/profiles?select=*`, {
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`
            }
        });
        const profiles = await profResponse.json();
        console.log("All Profiles:");
        profiles.forEach(p => {
            console.log(`- ID: ${p.id} | Name: ${p.full_name} | Role: ${p.role}`);
        });

        // Fetch all availability
        const availResponse = await fetch(`${supabaseUrl}/rest/v1/faculty_availability?select=*`, {
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`
            }
        });
        const availability = await availResponse.json();
        console.log("\nAll Availability Records:");
        availability.forEach(item => {
            console.log(`- ID: ${item.id} | FacultyID: ${item.faculty_id} | DayOfWeek: ${item.day_of_week} | SpecificDate: ${item.specific_date} | Time: ${item.start_time} - ${item.end_time}`);
        });

    } catch (e) {
        console.error("Error:", e);
    }
}

main();
