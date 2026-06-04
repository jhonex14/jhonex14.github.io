const supabaseUrl = 'https://uximseyeqkhoghsrksds.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV4aW1zZXllcWtob2doc3Jrc2RzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNjYwODksImV4cCI6MjA5NDY0MjA4OX0.5BdspRtw7IBI201E-RrqXiDJ-MDQFBpKhJlaujP-i6w';

async function registerTestFaculty() {
    console.log("Registering test faculty user...");
    const email = 'test_faculty_' + Math.random().toString(36).substring(7) + '@university.edu';
    const password = 'Password123!';
    try {
        const response = await fetch(`${supabaseUrl}/auth/v1/signup`, {
            method: 'POST',
            headers: {
                'apikey': supabaseKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: email,
                password: password,
                data: {
                    full_name: 'Test Faculty User',
                    role: 'faculty',
                    id_number: '2026-TEST',
                    department: 'ICT Dept',
                    address: '123 Street, City',
                    age: '30'
                }
            })
        });
        const data = await response.json();
        console.log("Response Status:", response.status);
        console.log("Response Data:", JSON.stringify(data, null, 2));
    } catch (err) {
        console.error("Sign up error:", err);
    }
}

registerTestFaculty();
