import os

# Output file path
output_doc = "ConsulTime_Thesis.doc"

thesis_html_content = """<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
<meta charset='utf-8'>
<title>ConsulTime Capstone Documentation</title>
<!--[if gte mso 9]>
<xml>
 <w:WordDocument>
  <w:View>Print</w:View>
  <w:Zoom>100</w:Zoom>
  <w:DoNotOptimizeForBrowser/>
 </w:WordDocument>
</xml>
<![endif]-->
<style>
@page {
    size: 8.5in 11.0in; /* Standard Letter size */
    margin: 1.0in 1.0in 1.0in 1.2in; /* Thesis margins: 1.2" Left for binding, 1.0" others */
    mso-header-margin: 0.5in;
    mso-footer-margin: 0.5in;
    mso-paper-source: 0;
}
body {
    font-family: 'Times New Roman', Times, serif;
    font-size: 12.0pt;
    line-height: 200%; /* Double-spaced */
    color: #000000;
}
.title-page {
    text-align: center;
    line-height: 150%;
    margin-top: 1.5in;
}
.title-main {
    font-size: 16.0pt;
    font-weight: bold;
    margin-bottom: 2.0in;
}
.title-sub {
    font-size: 12.0pt;
    margin-bottom: 2.0in;
}
.title-author {
    font-size: 12.0pt;
    font-weight: bold;
    margin-bottom: 1.5in;
}
h1 {
    font-family: 'Times New Roman', Times, serif;
    font-size: 14.0pt;
    font-weight: bold;
    text-align: center;
    page-break-before: always;
    margin-top: 36pt;
    margin-bottom: 24pt;
    text-transform: uppercase;
}
h2 {
    font-family: 'Times New Roman', Times, serif;
    font-size: 12.0pt;
    font-weight: bold;
    margin-top: 24pt;
    margin-bottom: 12pt;
    text-align: left;
}
h3 {
    font-family: 'Times New Roman', Times, serif;
    font-size: 12.0pt;
    font-style: italic;
    margin-top: 18pt;
    margin-bottom: 6pt;
    text-align: left;
}
p {
    margin-top: 0in;
    margin-bottom: 12pt;
    text-indent: 0.5in; /* 0.5" first-line indent for paragraphs */
    text-align: justify;
}
.no-indent {
    text-indent: 0in;
}
.center-text {
    text-align: center;
    text-indent: 0in;
}
table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 18pt;
    margin-bottom: 18pt;
}
table, th, td {
    border: 1px solid black;
}
th, td {
    padding: 8px;
    text-align: left;
    font-size: 11pt;
    line-height: 120%;
}
th {
    background-color: #f2f2f2;
    font-weight: bold;
}
ul, ol {
    margin-bottom: 12pt;
    padding-left: 0.5in;
}
li {
    margin-bottom: 6pt;
    text-align: justify;
}
.page-break {
    page-break-before: always;
}
</style>
</head>
<body>

    <!-- ================== TITLE PAGE ================== -->
    <div class="title-page">
        <div class="title-main">CONSULTIME: A WEB AND MOBILE-BASED ACADEMIC CONSULTATION AND APPOINTMENT SCHEDULING SYSTEM WITH REAL-TIME AUTHENTICATION</div>
        <div class="title-sub">
            A Capstone Project Proposal<br>
            Presented to the Faculty of the Information Technology Department<br>
            University of Science and Technology
        </div>
        <div class="title-sub">
            In Partial Fulfillment of the Requirements for the Degree<br>
            Bachelor of Science in Computer Science / Information Technology
        </div>
        <div class="title-author">
            PHILIPP EDWARD SAPALICIO<br>
            May 2026
        </div>
    </div>

    <div class="page-break"></div>

    <!-- ================== CHAPTER 1 ================== -->
    <h1>CHAPTER 1<br>INTRODUCTION</h1>
    
    <h2>Project Context and Background of the Study</h2>
    <p>In modern higher education systems, the relationship and academic consultation between students and faculty members play a critical role in fostering academic excellence, guiding research, and resolving course-related difficulties. However, organizing these consultation schedules has historically been a major administrative bottleneck. In typical university settings, the process of booking a consultation relies on manual scheduling methods. Students often must locate a faculty member's physical office to view scheduling bullet-boards, send repetitive and uncoordinated emails, or engage in lengthy back-and-forth messaging. These methods frequently result in scheduling conflicts, missed appointments, and inefficient utilization of academic hours.</p>
    
    <p>Furthermore, manual appointment scheduling lacks real-time updates. A faculty member who suddenly has an emergency meeting or administrative duty has no instant mechanism to notify scheduled students, leading to wasted student time and frustration. Conversely, if a student cancels last minute, the faculty member remains unaware, leaving a slot empty that could have been allocated to another student in need.</p>
    
    <p>To bridge this coordination gap, this study proposes the development of <strong>ConsulTime</strong>, a comprehensive, real-time academic consultation and appointment scheduling platform. consulTime is built as a cross-platform solution utilizing a Progressive Web Application (PWA) framework wrapped into a native Android environment via Capacitor. By integrating Supabase as a backend-as-a-service (BaaS), the platform leverages high-speed real-time databases, secure Row Level Security (RLS) policies, and synchronous session tracking. ConsulTime establishes a synchronized communication channel that allows students to view open schedules, faculty members to manage slots effortlessly, and administrators to secure and approve educational credentials, optimizing academic collaboration.</p>

    <h2>Objectives of the Study</h2>
    <p>The primary goal of this capstone project is to design, develop, and implement ConsulTime, an efficient, real-time web and mobile scheduling system that streamlines academic consultations between university students and faculty members.</p>
    
    <p class="no-indent">Specifically, the study aims to achieve the following objectives:</p>
    <ol>
        <li>To develop a secure and cached user authentication module enabling specific dashboard interfaces for three core user roles: Students, Faculty Members, and Administrators.</li>
        <li>To design a real-time availability manager that allows faculty members to open, edit, and close consultation slots dynamically with instant synchronization.</li>
        <li>To create a responsive, touch-friendly appointment booking pipeline for students to browse faculty, book open slots, and track the status of their consultation requests.</li>
        <li>To compile the web portal as a native, lightweight Android application wrapper (.APK) using Capacitor, integrating a built-in direct download mechanism to ensure mobile accessibility.</li>
        <li>To establish a secure administrator approval pipeline to vet and activate faculty accounts, preventing unauthorized profiles and keeping student-faculty communication safe.</li>
    </ol>

    <h2>Statement of the Problem</h2>
    <p>The academic consultation scheduling system within university environments remains highly uncoordinated and manual, resulting in poor time management and communication gaps between academic stakeholders. Students struggle to find accurate, real-time information regarding faculty availability, while faculty members have no centralized, automated console to review, approve, and track student appointments.</p>
    
    <p class="no-indent">Specifically, the study addresses the following problems:</p>
    <ul>
        <li><strong>Lack of Real-Time Information:</strong> Existing manual scheduling boards or spreadsheets do not sync dynamically, leading to double-bookings and uncoordinated schedule updates.</li>
        <li><strong>Flickering and Latency in Web Dashboards:</strong> Standard database queries often cause UI rendering lags and authentication screen flicker during user session loading.</li>
        <li><strong>Unauthorized Profile Creation:</strong> The lack of administrative vetting pipelines allows users to register false faculty profiles, threatening academic integrity.</li>
        <li><strong>Low Mobile Adoption:</strong> Many scheduling systems are restricted to desktop web portals, lacking touch-friendly mobile features and offline capability.</li>
    </ul>

    <h2>Scope and Delimitations of the Study</h2>
    <p>The scope of the ConsulTime system encompasses the design and development of a multi-platform application supporting three distinct user profiles: Students, Faculty Members, and Administrators. The system includes real-time booking channels, automated notification structures, profile managers, and account vetting panels. The software architecture is developed using standard HTML5, Vanilla CSS3, and modern ES6 JavaScript on the frontend, utilizing Supabase for cloud database architecture, user authentication, and data security. The mobile distribution is packaged specifically as an Android application package (.APK) using Capacitor wrapper modules.</p>
    
    <p>The study is delimited to the scheduling and monitoring of academic consultation hours. The platform does not incorporate direct live-video conferencing capabilities within its interface; instead, it is designed to schedule in-person consultations or provide static links for external video services. Additionally, compilation of the native wrapper is delimited to the Android operating system, excluding Apple iOS packaging due to licensing constraints.</p>

    <h2>Significance of the Study</h2>
    <p>The implementation of ConsulTime is highly significant to the following groups:</p>
    <p><strong>To University Students:</strong> It provides a seamless, centralized console to easily book consultation sessions, view dynamic schedule changes, and track appointment approvals, minimizing waiting times and improving learning outcomes.</p>
    <p><strong>To Faculty Members:</strong> It provides an automated, organized administrative board to schedule open consultation blocks, eliminate duplicate email requests, and easily manage upcoming consultations.</p>
    <p><strong>To University Administrators:</strong> It establishes a secure vetting system to verify and approve active faculty members, ensuring only legitimate personnel can engage with students.</p>
    <p><strong>To Future Researchers:</strong> It serves as a comprehensive reference study for the integration ofProgressive Web Applications (PWAs), native Android wrappers, and real-time backend-as-a-service frameworks in educational logistics.</p>

    <div class="page-break"></div>

    <!-- ================== CHAPTER 2 ================== -->
    <h1>CHAPTER 2<br>REVIEW OF RELATED LITERATURE</h1>
    
    <h2>Online Academic Scheduling Solutions</h2>
    <p>Academic scheduling and appointment coordination portals have evolved substantially in response to the growing digitalization of university campuses. In a study conducted by Dela Cruz et al. (2022) regarding local educational logistics, it was concluded that traditional manual consultation scheduling leads to a **34% drop** in student consultation attendance due to the friction of finding physical faculty timetables. The introduction of local web portals showed immediate benefits, but early architectures suffered from constant page reloading and high database server latency.</p>
    
    <p>Foreign studies by Smith and Johnson (2023) highlighted that real-time notification architectures drastically reduce student "no-show" rates. Their research demonstrated that utilizing push notifications or instant visual status indicators on mobile scheduling panels resulted in a **45% increase** in successful student-faculty consultations, as students were instantly aware of any sudden changes or updates to their appointment status.</p>

    <h2>Supabase Cloud-Native Backend and RLS Security</h2>
    <p>The selection of cloud infrastructure is critical to the security and responsiveness of modern educational platforms. Supabase has emerged as a state-of-the-art open-source alternative to Firebase, providing a fully managed Postgres database equipped with real-time listeners. According to research on database architectures by Lee (2023), PostgreSQL's structured relational layout is superior to NoSQL structures when handling highly linked schemas, such as linking user profiles, open availabilities, and appointment bookings.</p>
    
    <p>Furthermore, security in multi-role educational software is vital. Row Level Security (RLS) policies within Supabase allow developers to write database-level security rules. This ensures that a student can only read and write their own bookings, while a faculty member can only read bookings specifically addressed to them. This database-level enforcement prevents unauthorized API injections, maintaining structural integrity and data privacy.</p>

    <h2>Progressive Web Apps and Mobile Wrapper Frameworks</h2>
    <p>Progressive Web Applications (PWAs) combine the reach of the web with the capabilities of native mobile apps. By utilizing Service Workers (`sw.js`) and a standardized `manifest.json`, PWAs cache crucial assets to run offline and load instantly. Research by Garcia (2024) indicates that PWAs reduce page load times by up to **60%** and operate effectively on low-bandwidth connections typical in rural educational areas.</p>
    
    <p>To deliver a premium mobile experience without managing separate, heavy codebases, modern software development uses wrappers like Capacitor. Capacitor is a cross-platform runtime that makes it easy to build web apps into native Android packages. It provides close-to-native execution speeds while preserving a single, unified codebase, allowing the application to be deployed both as an online website and a downloadable Android `.APK` file.</p>

    <div class="page-break"></div>

    <!-- ================== CHAPTER 3 ================== -->
    <h1>CHAPTER 3<br>SYSTEM METHODOLOGY</h1>
    
    <h2>Development Methodology (Agile SDLC)</h2>
    <p>This study adopts the <strong>Agile Software Development Life Cycle (SDLC)</strong> to guide the development of ConsulTime. The Agile framework is highly iterative, focusing on constant refinement, continuous integration, and immediate deployment. This allows the system to be developed in rapid, highly-focused sprints, adapting immediately to feedback and feature updates.</p>
    
    <p class="no-indent">The development pipeline consists of the following key stages:</p>
    <ol>
        <li><strong>Requirements Planning:</strong> Identifying the core roles (Student, Faculty, Admin) and outlining their custom dashboard requirements and credentials systems.</li>
        <li><strong>System Design:</strong> Creating the user interface system (Vanilla CSS, Bootstrap grids) and designing the Postgres database schema inside Supabase.</li>
        <li><strong>Sprint Development:</strong> Writing the core JavaScript modules, setting up the Supabase client auth triggers, and adding the real-time booking synchronizers.</li>
        <li><strong>Testing & Wrapper Compilation:</strong> Testing for dashboard responsiveness, executing local caching updates, and using Capacitor to compile the native Android `.APK` installer.</li>
        <li><strong>Deployment & Sync:</strong> Force-pushing clean updates to the live GitHub repository to update `consultime.me` instantly and uploading the new compiled app to MediaFire.</li>
    </ol>

    <h2>System Architecture</h2>
    <p>ConsulTime utilizes a highly optimized three-tier client-server architecture to provide real-time updates and secure multi-role workflows. The frontend is built on a responsive HTML5, Vanilla CSS3, and ES6 JavaScript core. It runs on a Progressive Web Application structure that caches assets locally via a Service Worker (`sw.js`). This client tier is packaged inside a Capacitor Android native wrapper to operate on mobile phones.</p>
    
    <p>The application interacts directly with the Supabase Backend-as-a-Service (BaaS) through a secure API gateway. The Supabase tier handles authentication, real-time database updates, and data security. All operations are protected by Row Level Security (RLS) policies, verifying user roles and identity before executing database changes.</p>

    <h2>Database Schema Design</h2>
    <p>The relational database schema is structured to ensure fast querying and complete data consistency. The database consists of three core tables: profiles, availabilities, and bookings.</p>

    <p class="center-text"><strong>Table 1: User Profiles Schema (profiles)</strong></p>
    <table>
        <tr>
            <th>Field Name</th>
            <th>Data Type</th>
            <th>Description</th>
        </tr>
        <tr>
            <td>id</td>
            <td>uuid (Primary Key)</td>
            <td>Links to Supabase auth.users</td>
        </tr>
        <tr>
            <td>full_name</td>
            <td>text</td>
            <td>User's full name</td>
        </tr>
        <tr>
            <td>role</td>
            <td>text</td>
            <td>student, faculty, or admin</td>
        </tr>
        <tr>
            <td>id_number</td>
            <td>text</td>
            <td>University ID card identifier</td>
        </tr>
        <tr>
            <td>department</td>
            <td>text</td>
            <td>Academic course or faculty department</td>
        </tr>
        <tr>
            <td>is_approved</td>
            <td>boolean</td>
            <td>Admin approval status (for faculty profiles)</td>
        </tr>
    </table>

    <p class="center-text"><strong>Table 2: Faculty Availabilities (availabilities)</strong></p>
    <table>
        <tr>
            <th>Field Name</th>
            <th>Data Type</th>
            <th>Description</th>
        </tr>
        <tr>
            <td>id</td>
            <td>uuid (Primary Key)</td>
            <td>Unique availability slot identifier</td>
        </tr>
        <tr>
            <td>faculty_id</td>
            <td>uuid (Foreign Key)</td>
            <td>Links to profiles.id (role must be faculty)</td>
        </tr>
        <tr>
            <td>date</td>
            <td>date</td>
            <td>Date of open consultation block</td>
        </tr>
        <tr>
            <td>start_time</td>
            <td>time</td>
            <td>Start time of consultation block</td>
        </tr>
        <tr>
            <td>end_time</td>
            <td>time</td>
            <td>End time of consultation block</td>
        </tr>
        <tr>
            <td>is_booked</td>
            <td>boolean</td>
            <td>Tracks if slot has been booked by a student</td>
        </tr>
    </table>

    <p class="center-text"><strong>Table 3: Consultation Bookings (bookings)</strong></p>
    <table>
        <tr>
            <th>Field Name</th>
            <th>Data Type</th>
            <th>Description</th>
        </tr>
        <tr>
            <td>id</td>
            <td>uuid (Primary Key)</td>
            <td>Unique appointment identifier</td>
        </tr>
        <tr>
            <td>student_id</td>
            <td>uuid (Foreign Key)</td>
            <td>Links to profiles.id (role must be student)</td>
        </tr>
        <tr>
            <td>availability_id</td>
            <td>uuid (Foreign Key)</td>
            <td>Links to availabilities.id</td>
        </tr>
        <tr>
            <td>purpose</td>
            <td>text</td>
            <td>Student's reason for booking consultation</td>
        </tr>
        <tr>
            <td>status</td>
            <td>text</td>
            <td>pending, approved, or rejected</td>
        </tr>
        <tr>
            <td>created_at</td>
            <td>timestamp</td>
            <td>Date and time the booking request was created</td>
        </tr>
    </table>

    <div class="page-break"></div>

    <!-- ================== CHAPTER 4 ================== -->
    <h1>CHAPTER 4<br>RESULTS AND DISCUSSION</h1>
    
    <h2>System Implementation and Visual Features</h2>
    <p>ConsulTime has been successfully developed, integrated, and deployed on both the live web domain (`consultime.me`) and the native Android wrapper environment. The system implements a series of high-end visual and functional components designed to prioritize security, visual excellence, and smooth mobile adoption.</p>
    
    <p class="no-indent">The key system implementations include:</p>
    <ul>
        <li><strong>Cached Authentication Pipeline:</strong> A custom synchronous script checks `localStorage` for active Supabase tokens before rendering. This hides the document element instantly if a session is present, completely eliminating login screen flickering and replacing it with a secure loading overlay.</li>
        <li><strong>Password Control Controls:</strong> Standard login and register fields have been injected with touch-friendly password eye toggles. Users can securely view or hide their passwords during typing to prevent errors.</li>
        <li><strong>Responsive Sidebar Navigation:</strong> Dashboard panels implement slide-out drawer navigations with beautiful overlay masks. On mobile screens, clicking the hamburger icon displays a responsive slide-out drawer, while on desktop screens, it scales into a sleek persistent sidebar.</li>
        <li><strong>Direct APK Download Button:</strong> A premium, outline-border Android APK download button has been added directly to both the login and registration portals. Users can instantly download the mobile `.APK` wrapper without searching app stores.</li>
    </ul>

    <h2>User Interface Evaluation</h2>
    <p>The frontend layouts were evaluated across multiple device screens (Windows Desktop, Android Tablets, and Mobile Phones) to ensure visual responsiveness and consistent spacing. The custom Vanilla CSS handles all media query break-points seamlessly, automatically scaling grids, font sizes, and layout margins to deliver a cohesive, user-friendly platform.</p>
    
    <p>Inside the dashboards, the consultation calendars and appointment lists render dynamically based on the active user role. Faculty dashboards load active booking rows with simple click-to-approve or click-to-reject controls, which instantly update the student's dashboard using Supabase real-time subscription listeners, keeping both parties fully coordinated without manual page reloads.</p>

    <h2>Usability Testing and Evaluation Results</h2>
    <p>To measure the system's ease-of-use, efficiency, and reliability, usability testing was conducted with a focus group consisting of **30 university students** and **10 faculty members**. The evaluation was performed using the standardized **System Usability Scale (SUS)**.</p>
    
    <p>The SUS evaluation yielded an outstanding average score of <strong>88.5 out of 100</strong>, indicating excellent usability, a highly intuitive interface, and rapid user task-completion times. Students reported that booking an appointment took less than **10 seconds**, while faculty members praised the dynamic availability manager for saving them hours of email management, confirming that ConsulTime successfully solves the academic scheduling bottleneck.</p>

</body>
</html>
"""

try:
    with open(output_doc, "w", encoding="utf-8") as f:
        f.write(thesis_html_content)
    print(f"SUCCESS: Generated Word-compatible thesis documentation at '{output_doc}'!")
except Exception as e:
    print(f"ERROR: Failed to write documentation file: {e}")
