// Supabase Configuration
// Replace with your actual Supabase URL and Key
const GOOGLE_CLIENT_ID = '354413155894-3j42tctmks8o90vpt56mlln7l3tms44f.apps.googleusercontent.com';

// Update Notification Config
const REQUIRED_APK_VERSION = "1.0"; // Change this whenever you want to force users to download a new APK
const MEDIAFIRE_LINK = "https://www.mediafire.com/file/euvwn6ttzail5qu/consultime.apk/file"; // Replace with actual MediaFire link
const GOOGLE_DRIVE_LINK = "https://drive.google.com/"; // Replace with actual Google Drive link
const supabaseUrl = 'https://uximseyeqkhoghsrksds.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV4aW1zZXllcWtob2doc3Jrc2RzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNjYwODksImV4cCI6MjA5NDY0MjA4OX0.5BdspRtw7IBI201E-RrqXiDJ-MDQFBpKhJlaujP-i6w';

let supabaseClient;
if (window.supabase) {
    supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
}

// XSS Sanitizer: escape any text coming from the database before inserting into innerHTML
function sanitizeHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .replace(/\//g, '&#x2F;');
}

const App = {
    user: null,
    profile: null,
    charts: {},
    weeklyAppointments: [],
    version: '1.0.9',

    get settingsVerified() {
        return sessionStorage.getItem('ct_settings_verified') === 'true';
    },
    set settingsVerified(val) {
        sessionStorage.setItem('ct_settings_verified', val ? 'true' : 'false');
    },

    initialized: false,

    init: async function () {
        if (!supabaseClient) return;
        if (this.initialized) return;
        this.initialized = true;

        // Register PWA Service Worker
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('./sw.js')
                    .then(reg => console.log('PWA Service Worker registered successfully:', reg.scope))
                    .catch(err => console.error('PWA Service Worker registration failed:', err));
            });
        }

        // Restore Dark Mode
        if (localStorage.getItem('darkMode') === 'true') {
            document.body.classList.add('dark-mode');
        }

        this.attachEventListeners();

        // Initialize registration address selectors if present
        if (document.getElementById('addressRegion')) {
            this.initAddressSelectors('address');
        }


        // Check for password recovery hash (Supabase redirects to login.html#access_token=...&type=recovery)
        if (window.location.hash && window.location.hash.includes('type=recovery')) {
            const recoveryModalEl = document.getElementById('recoveryModal');
            if (recoveryModalEl) {
                const recoveryModal = new bootstrap.Modal(recoveryModalEl);
                recoveryModal.show();
            }
        }
        
        // Check URL parameters for pending status alerts (on login page)
        const params = new URLSearchParams(window.location.search);
        if (params.get('pending') === 'true') {
            const loginAlert = document.getElementById('loginAlert');
            if (loginAlert) {
                loginAlert.innerHTML = `<i class="fa-solid fa-clock me-2"></i><strong>Account Pending Approval:</strong> Your faculty registration was successful! An administrator must approve your account before you can log in.`;
                loginAlert.classList.remove('d-none');
            }
        }
        if (params.get('kicked') === 'true') {
            const loginAlert = document.getElementById('loginAlert');
            if (loginAlert) {
                loginAlert.innerHTML = `<i class="fa-solid fa-circle-exclamation me-2"></i><strong>Session Terminated:</strong> You have been logged out because this account was signed in on another device or browser.`;
                loginAlert.classList.remove('d-none');
            }
        }

        await this.checkAuthStatus();

        // Listen for auth state changes — page-aware to prevent redirect loops
        supabaseClient.auth.onAuthStateChange(async (event, session) => {
            console.log("Auth state change detected:", event, session ? session.user?.id : 'null');

            const path = window.location.pathname;
            const isAuthPage = path.includes('login.html') || path.includes('register.html');
            const isDashboard = path.includes('dashboard.html');
            const isProfilePage = path.includes('profile.html');
            const isIndexPage = !isAuthPage && !isDashboard && !isProfilePage;

            if (session) {
                this.user = session.user;

                if (isAuthPage) {
                    // On login/register: load profile then redirect to the correct dashboard
                    if (!this.profile || this.profile.id !== this.user.id) {
                        await this.checkAuthStatus();
                    }
                    this.routePage();
                } else if (isIndexPage) {
                    // On the landing page (index.html): just update the navbar buttons
                    if (!this.profile || this.profile.id !== this.user.id) {
                        await this.checkAuthStatus();
                    }
                    const userMenu = document.getElementById('userMenu');
                    if (userMenu && this.profile) {
                        const userRole = this.profile.role || 'student';
                        const dashboardLink = userRole === 'admin' ? 'admin-dashboard.html' : (userRole === 'faculty' ? 'faculty-dashboard.html' : 'student-dashboard.html');
                        userMenu.innerHTML = `
                            <a href="${dashboardLink}" class="btn btn-outline-light me-2 rounded-pill px-4">Dashboard</a>
                            <button onclick="App.handleLogout()" class="btn btn-accent rounded-pill px-4 fw-bold shadow-sm">Logout</button>
                        `;
                    }
                }
                // On dashboard/profile pages: do NOT call routePage() — the page is already loaded.
                // routePage() will be called by checkAuthStatus() during init() instead.

            } else {
                // Session is null — only react to explicit SIGNED_OUT, not to brief token-refresh gaps
                if (event === 'SIGNED_OUT') {
                    this.user = null;
                    this.profile = null;
                    const userMenu = document.getElementById('userMenu');
                    if (userMenu) {
                        userMenu.innerHTML = `
                            <a href="login.html" class="btn btn-outline-light me-2 rounded-pill px-4">Login</a>
                            <a href="register.html" class="btn btn-accent rounded-pill px-4 fw-bold shadow-sm">Get Started</a>
                        `;
                    }
                    // Only redirect to login if we were on a protected page
                    if (isDashboard || isProfilePage) {
                        window.location.replace('login.html');
                    }
                }
            }
        });
        
        this.initRealtime();
        this.checkAppVersion(); // Check if APK needs updating
        this.startAppointmentMonitor(); // Start background interval for alerts and auto-reject
        this.requestNotificationPermission(); // Ask for OS notification permission
        if (this.profile && this.profile.role === 'student') {
            this.initChatbot();
        }

        this.routePage();
        this.startHeaderClock();
        this.checkAppUpdate();

        // Start consultation alarm poller loop
        this.checkConsultationAlarms();
        setInterval(() => this.checkConsultationAlarms(), 30000);

        // Resume AudioContext on user interaction to bypass autoplay restrictions
        const resumeAudio = () => {
            if (this.audioCtx && this.audioCtx.state === 'suspended') {
                this.audioCtx.resume();
            }
        };
        document.addEventListener('click', resumeAudio, { passive: true });
        document.addEventListener('touchstart', resumeAudio, { passive: true });
    },

    toggleDarkMode: function() {
        document.body.classList.toggle('dark-mode');
        localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
        // Re-render charts to update colors if on faculty dashboard
        if (this.profile && this.profile.role === 'faculty') {
            this.fetchFacultyRequests();
        }
    },

    startHeaderClock: function() {
        const dateEl = document.getElementById('headerDate');
        const timeEl = document.getElementById('headerTime');
        if (!dateEl || !timeEl) return;

        const updateClock = () => {
            const now = new Date();
            
            // Format Date: e.g. "Tuesday, May 19, 2026"
            const dateOptions = { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' };
            dateEl.textContent = now.toLocaleDateString('en-US', dateOptions);

            // Format Time: e.g. "04:45:12 PM"
            let hours = now.getHours();
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const seconds = String(now.getSeconds()).padStart(2, '0');
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12;
            hours = hours ? hours : 12; // the hour '0' should be '12'
            const formattedHours = String(hours).padStart(2, '0');
            
            timeEl.textContent = `${formattedHours}:${minutes}:${seconds} ${ampm}`;
        };

        updateClock();
        setInterval(updateClock, 1000);
    },

    checkAppUpdate: async function() {
        try {
            const res = await fetch(`https://consultime.me/version.json?t=${Date.now()}`);
            if (!res.ok) return;
            const remote = await res.json();
            
            if (remote && remote.version && remote.version !== this.version) {
                const isMobile = window.Capacitor || window.location.href.startsWith('file:') || (window.location.hostname === 'localhost' && !window.location.port); 
                const bannerId = 'app-update-banner';
                if (document.getElementById(bannerId)) return;
                
                if (!document.getElementById('update-banner-styles')) {
                    document.head.insertAdjacentHTML('beforeend', `
                        <style id="update-banner-styles">
                            .update-banner {
                                position: fixed;
                                bottom: 24px;
                                right: 24px;
                                z-index: 999999;
                                background: #1e293b;
                                color: #fff;
                                border: 1px solid rgba(255,255,255,0.15);
                                border-radius: 16px;
                                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.4), 0 10px 10px -5px rgba(0, 0, 0, 0.4);
                                padding: 18px;
                                max-width: 350px;
                                font-family: 'Outfit', sans-serif;
                                display: flex;
                                flex-direction: column;
                                gap: 8px;
                                animation: slideUpUpdate 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                            }
                            @keyframes slideUpUpdate {
                                from { opacity: 0; transform: translateY(30px); }
                                to { opacity: 1; transform: translateY(0); }
                            }
                            .update-banner-title {
                                font-size: 14px;
                                font-weight: 700;
                                display: flex;
                                align-items: center;
                                gap: 8px;
                                color: #3b82f6;
                            }
                            .update-banner-msg {
                                font-size: 12px;
                                color: #94a3b8;
                                line-height: 1.4;
                                margin: 0;
                            }
                            .update-banner-actions {
                                display: flex;
                                align-items: center;
                                gap: 10px;
                                margin-top: 6px;
                            }
                        </style>
                    `);
                }
                
                const titleText = isMobile ? 'New Mobile Update Available' : 'New Website Update Available';
                const actionButton = isMobile 
                    ? `<a href="https://consultime.me" target="_blank" class="btn btn-primary btn-sm rounded-pill px-3 py-1 fw-bold" style="font-size: 11px;">Go to Website</a>`
                    : `<button onclick="window.location.reload(true)" class="btn btn-danger btn-sm rounded-pill px-3 py-1 fw-bold" style="font-size: 11px;"><i class="fa-solid fa-rotate me-1"></i>Reload Page</button>`;

                document.body.insertAdjacentHTML('beforeend', `
                    <div id="${bannerId}" class="update-banner">
                        <div class="update-banner-title">
                            <i class="fa-solid fa-cloud-arrow-down fs-5 text-primary"></i>
                            <strong>${titleText} (v${remote.version})</strong>
                        </div>
                        <p class="update-banner-msg">${remote.message || 'A new update is available with performance fixes and stability enhancements.'}</p>
                        <div class="update-banner-actions">
                            ${actionButton}
                            <button onclick="document.getElementById('${bannerId}').remove()" class="btn btn-light btn-sm rounded-pill px-3 py-1 border fw-semibold" style="font-size: 11px;">Dismiss</button>
                        </div>
                    </div>
                `);
            }
        } catch (e) {
            console.warn('Update check failed:', e);
        }
    },

    showAboutModal: function() {
        let modalEl = document.getElementById('aboutModal');
        if (!modalEl) {
            const isDarkMode = document.body.classList.contains('dark-mode');
            const themeClass = isDarkMode ? 'bg-dark text-white border-secondary' : 'bg-white text-dark';
            const closeBtnClass = isDarkMode ? 'btn-close-white' : '';
            
            document.body.insertAdjacentHTML('beforeend', `
                <div class="modal fade" id="aboutModal" tabindex="-1" aria-hidden="true" style="font-family: 'Outfit', sans-serif;">
                    <div class="modal-dialog modal-dialog-centered">
                        <div class="modal-content ${themeClass}" style="border-radius: 20px; overflow: hidden; border: 1px solid rgba(0,0,0,0.1);">
                            <div class="modal-header border-0 pb-0">
                                <button type="button" class="btn-close ${closeBtnClass}" data-bs-dismiss="modal" aria-label="Close" style="font-size: 12px;"></button>
                            </div>
                            <div class="modal-body text-center px-4 pb-4 pt-0">
                                <div class="d-inline-flex align-items-center justify-content-center bg-primary text-white rounded-circle shadow-sm mb-3" style="width: 70px; height: 70px;">
                                    <i class="fa-solid fa-clock fs-2"></i>
                                </div>
                                <h4 class="fw-bold mb-1">ConsulTime</h4>
                                <span class="badge bg-primary-soft text-primary rounded-pill px-3 py-1 fw-bold mb-3" style="font-size: 11px;">Version ${this.version}</span>
                                
                                <p class="text-muted small mb-4" style="line-height: 1.6; font-size: 13px;">
                                    ConsulTime is a premium academic consultation scheduling system designed to bridge students and faculty members. It provides real-time updates, calendar notifications, and live presence verification.
                                </p>
                                
                                <div class="card border-0 bg-light p-3 mb-4 rounded-4 text-start">
                                    <div class="d-flex justify-content-between mb-2">
                                        <span class="text-muted small fw-medium">Developers</span>
                                        <span class="text-dark small fw-bold">ConsulTime Team</span>
                                    </div>
                                    <div class="d-flex justify-content-between mb-2">
                                        <span class="text-muted small fw-medium">Platform</span>
                                        <span class="text-dark small fw-bold">${window.Capacitor ? 'Mobile (Android)' : 'Web Portal'}</span>
                                    </div>
                                    <div class="d-flex justify-content-between">
                                        <span class="text-muted small fw-medium">Database Status</span>
                                        <span class="text-success small fw-bold"><i class="fa-solid fa-circle-check me-1"></i> Connected</span>
                                    </div>
                                </div>
                                
                                <div class="d-flex flex-column gap-2">
                                    <button onclick="App.checkAppUpdateManual()" class="btn btn-primary w-100 py-2 rounded-pill fw-bold shadow-sm" style="font-size: 13px;">
                                        <i class="fa-solid fa-arrows-rotate me-1"></i> Check for Updates
                                    </button>
                                    <button type="button" class="btn btn-light w-100 py-2 rounded-pill border fw-semibold text-muted" data-bs-dismiss="modal" style="font-size: 13px;">
                                        Close
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `);
            modalEl = document.getElementById('aboutModal');
        }
        
        const bsModal = new bootstrap.Modal(modalEl);
        bsModal.show();
    },

    checkAppUpdateManual: async function() {
        const btn = document.querySelector('#aboutModal .btn-primary');
        const oldText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin me-1"></i> Checking...';
        btn.disabled = true;
        
        try {
            const res = await fetch(`https://consultime.me/version.json?t=${Date.now()}`);
            if (!res.ok) throw new Error("Could not reach update server.");
            const remote = await res.json();
            
            const modalEl = document.getElementById('aboutModal');
            if (modalEl) {
                const bsModal = bootstrap.Modal.getInstance(modalEl);
                if (bsModal) bsModal.hide();
            }
            
            if (remote && remote.version && remote.version !== this.version) {
                this.checkAppUpdate();
            } else {
                alert(`You are up to date! ConsulTime is running the latest version (v${this.version}).`);
            }
        } catch (e) {
            alert("Failed to check for updates: " + e.message);
        } finally {
            btn.innerHTML = oldText;
            btn.disabled = false;
        }
    },

    listenersAttached: false,
    attachEventListeners: function () {
        if (this.listenersAttached) return;
        this.listenersAttached = true;

        const loginForm = document.getElementById('loginForm');
        if (loginForm) loginForm.addEventListener('submit', (e) => this.handleLogin(e));

        const regForm = document.getElementById('registerForm');
        if (regForm) regForm.addEventListener('submit', (e) => this.handleRegister(e));

        const forgotForm = document.getElementById('forgotForm');
        if (forgotForm) forgotForm.addEventListener('submit', (e) => this.handleForgotPassword(e));

        const recoveryForm = document.getElementById('recoveryForm');
        if (recoveryForm) recoveryForm.addEventListener('submit', (e) => this.handlePasswordRecovery(e));

        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) logoutBtn.addEventListener('click', () => this.handleLogout());

        const bookForm = document.getElementById('bookForm');
        if (bookForm) {
            bookForm.addEventListener('submit', (e) => this.handleBooking(e));
            
            const purposeSelect = document.getElementById('purposeSelect');
            const purposeCustom = document.getElementById('purposeCustom');
            const purposeHidden = document.getElementById('purpose');
            
            if (purposeSelect && purposeCustom && purposeHidden) {
                purposeSelect.addEventListener('change', function() {
                    const val = purposeSelect.value;
                    if (val === 'Others concern') {
                        purposeCustom.classList.remove('d-none');
                        purposeCustom.setAttribute('required', 'required');
                        purposeHidden.value = purposeCustom.value.trim();
                        purposeCustom.focus();
                    } else {
                        purposeCustom.classList.add('d-none');
                        purposeCustom.removeAttribute('required');
                        purposeCustom.value = '';
                        purposeHidden.value = val;
                    }
                });
                
                purposeCustom.addEventListener('input', function() {
                    if (purposeSelect.value === 'Others concern') {
                        purposeHidden.value = purposeCustom.value.trim();
                    }
                });
            }

            bookForm.addEventListener('reset', () => {
                if (purposeCustom) {
                    purposeCustom.classList.add('d-none');
                    purposeCustom.removeAttribute('required');
                    purposeCustom.value = '';
                }
                if (purposeHidden) {
                    purposeHidden.value = '';
                }
                // Clear grid card highlights and select input
                document.querySelectorAll('#facultyGridContainer .faculty-card').forEach(c => c.classList.remove('active'));
                const selectEl = document.getElementById('facultySelect');
                if (selectEl) selectEl.value = '';
            });
        }

        const availForm = document.getElementById('availabilityForm');
        if (availForm) {
            availForm.addEventListener('submit', (e) => this.handleAddAvailability(e));
            
            // Quick Time Slots listeners
            const quickTimeSlots = document.getElementById('quickTimeSlots');
            if (quickTimeSlots) {
                const startInput = document.getElementById('availStartTime');
                const endInput = document.getElementById('availEndTime');
                
                quickTimeSlots.querySelectorAll('.quick-time-btn').forEach(btn => {
                    btn.addEventListener('click', function() {
                        const startVal = this.getAttribute('data-start');
                        const endVal = this.getAttribute('data-end');
                        if (startInput) startInput.value = startVal;
                        if (endInput) endInput.value = endVal;
                        
                        // Toggle active classes
                        quickTimeSlots.querySelectorAll('.quick-time-btn').forEach(b => b.classList.remove('active'));
                        this.classList.add('active');
                    });
                });

                // Clear active highlight if user changes time manually
                if (startInput) {
                    startInput.addEventListener('input', () => {
                        quickTimeSlots.querySelectorAll('.quick-time-btn').forEach(b => b.classList.remove('active'));
                    });
                }
                if (endInput) {
                    endInput.addEventListener('input', () => {
                        quickTimeSlots.querySelectorAll('.quick-time-btn').forEach(b => b.classList.remove('active'));
                    });
                }
            }
        }

        const editAvailForm = document.getElementById('editAvailabilityForm');
        if (editAvailForm) editAvailForm.addEventListener('submit', (e) => this.handleUpdateAvailability(e));

        // Weekly Report Search listener
        const weeklyReportSearch = document.getElementById('weeklyReportSearch');
        if (weeklyReportSearch) {
            weeklyReportSearch.addEventListener('input', () => this.filterWeeklyAppointmentsTable());
        }

        // Sidebar Navigation
        document.querySelectorAll('.sidebar-link').forEach(link => {
            link.addEventListener('click', (e) => {
                const href = link.getAttribute('href');
                if (href && href !== '#' && !href.startsWith('javascript:')) {
                    return; // Let standard page navigation run!
                }
                e.preventDefault();
                const viewId = link.id.replace('nav-', '');
                
                if (viewId === 'profile') {
                    if (this.settingsVerified) {
                        this.switchView('profile');
                    } else {
                        this.promptSettingsPassword(() => {
                            this.switchView('profile');
                        });
                    }
                } else {
                    this.switchView(viewId);
                }
            });
        });

        // Intercept standalone profile.html links
        document.querySelectorAll('a[href*="profile.html"]').forEach(link => {
            link.addEventListener('click', (e) => {
                if (!this.settingsVerified) {
                    e.preventDefault();
                    this.promptSettingsPassword(() => {
                        window.location.href = link.href;
                    });
                }
            });
        });

        // Profile Events
        const profileForm = document.getElementById('profileForm');
        if (profileForm) profileForm.addEventListener('submit', (e) => this.handleProfileSubmit(e));

        const passwordForm = document.getElementById('passwordForm');
        if (passwordForm) passwordForm.addEventListener('submit', (e) => this.handlePasswordSubmit(e));

        const avatarUpload = document.getElementById('avatarUpload');
        if (avatarUpload) avatarUpload.addEventListener('change', (e) => this.handleAvatarUpload(e));

        const facultySelect = document.getElementById('facultySelect');
        if (facultySelect) {
            facultySelect.addEventListener('change', () => this.handleFacultySelectChange());
        }

        // Hide notification badge when dropdown is opened
        const notifBtn = document.querySelector('[data-bs-toggle="dropdown"]');
        if (notifBtn && document.getElementById('notificationList')) {
            notifBtn.addEventListener('click', () => {
                const badge = document.getElementById('notifBadge');
                if (badge && badge.style.display === 'block') {
                    badge.style.display = 'none';
                    sessionStorage.setItem('notifsViewed', 'true');
                }
            });
        }
        // Mobile Sidebar Drawer Toggle
        const toggleBtn = document.getElementById('sidebarToggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                const sidebar = document.querySelector('.sidebar');
                if (sidebar) {
                    sidebar.classList.toggle('show-sidebar');
                    this.toggleSidebarOverlay();
                }
            });
        }
    },

    toggleSidebarOverlay: function() {
        let overlay = document.getElementById('sidebarOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'sidebarOverlay';
            overlay.style.position = 'fixed';
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.width = '100vw';
            overlay.style.height = '100vh';
            overlay.style.background = 'rgba(0,0,0,0.4)';
            overlay.style.zIndex = '999';
            overlay.style.display = 'none';
            overlay.addEventListener('click', () => {
                const sidebar = document.querySelector('.sidebar');
                if (sidebar) sidebar.classList.remove('show-sidebar');
                overlay.style.display = 'none';
            });
            document.body.appendChild(overlay);
        }

        const sidebar = document.querySelector('.sidebar');
        if (sidebar && sidebar.classList.contains('show-sidebar')) {
            overlay.style.display = 'block';
        } else {
            overlay.style.display = 'none';
        }
    },

    checkAuthStatus: async function () {
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();

        if (session) {
            this.user = session.user;
            let { data: profile } = await supabaseClient
                .from('profiles')
                .select('*')
                .eq('id', this.user.id)
                .single();

            // If profile is missing from database, fall back to user_metadata to prevent crash and loss of session
            if (!profile) {
                const meta = this.user.user_metadata || {};
                profile = {
                    id: this.user.id,
                    full_name: meta.full_name || 'User',
                    role: meta.role || 'student',
                    department: meta.department || '',
                    id_number: meta.id_number || '',
                    address: meta.address || '',
                    age: meta.age || null,
                    email: this.user.email,
                    is_approved: meta.role !== 'faculty'
                };
            }

            // If account is pending administrator approval
            if (profile && profile.is_approved === false) {
                const fastLoader = document.getElementById('auth-fast-loader');
                if (fastLoader) fastLoader.remove();

                await supabaseClient.auth.signOut();
                this.user = null;
                this.profile = null;
                
                const loginAlert = document.getElementById('loginAlert');
                if (loginAlert) {
                    loginAlert.innerHTML = `<i class="fa-solid fa-triangle-exclamation me-2"></i><strong>Account Not Approved:</strong> Your account is not approved yet. Please contact the administrator.`;
                    loginAlert.classList.remove('d-none');
                }
                
                alert("Your account is not approved. Please contact the administrator.");
                
                const path = window.location.pathname;
                if (path.includes('dashboard.html') || path.includes('profile.html')) {
                    window.location.replace('login.html?pending=true');
                }
                return;
            }

            this.profile = profile;

            // Setup User Menu if on index
            const userMenu = document.getElementById('userMenu');
            if (userMenu) {
                const dashboardLink = this.profile.role === 'admin' ? 'admin-dashboard.html' : (this.profile.role === 'faculty' ? 'faculty-dashboard.html' : 'student-dashboard.html');
                userMenu.innerHTML = `
                    <a href="${dashboardLink}" class="btn btn-outline-light me-2 rounded-pill px-4">Dashboard</a>
                    <button onclick="App.handleLogout()" class="btn btn-accent rounded-pill px-4 fw-bold shadow-sm">Logout</button>
                `;
            }

            // Populate Sidebar Profile
            if (document.getElementById('sidebarUserName') || document.getElementById('userName')) {
                const oldUserName = document.getElementById('userName');
                if (oldUserName) oldUserName.textContent = this.profile.full_name;
                const oldUserDept = document.getElementById('userDept');
                if (oldUserDept) oldUserDept.textContent = this.profile.department || this.profile.role;
                const initials = this.profile.full_name ? this.profile.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'US';
                
                // Populate the new beautiful Sidebar Profile Card
                const sidebarName = document.getElementById('sidebarUserName');
                if (sidebarName) sidebarName.textContent = this.profile.full_name;
                const sidebarEmail = document.getElementById('sidebarUserEmail');
                if (sidebarEmail) sidebarEmail.textContent = this.profile.email || '';
                const sidebarRole = document.getElementById('sidebarUserRole');
                if (sidebarRole) sidebarRole.textContent = this.profile.role.toUpperCase();
                
                const sidebarInitialsEl = document.getElementById('sidebarUserInitials');
                if (sidebarInitialsEl) {
                    if (this.profile.avatar) {
                        sidebarInitialsEl.innerHTML = `<img src="${this.profile.avatar}" class="w-100 h-100 rounded-circle object-fit-cover border border-3 border-white">`;
                        sidebarInitialsEl.classList.remove('bg-primary', 'text-white', 'd-flex', 'align-items-center', 'justify-content-center', 'border-3');
                    } else {
                        sidebarInitialsEl.textContent = initials;
                    }
                }

                // Populate detail rows
                const sidebarIdNumber = document.getElementById('sidebarIdNumber');
                if (sidebarIdNumber) sidebarIdNumber.textContent = this.profile.id_number || '—';
                const sidebarDept = document.getElementById('sidebarDept');
                if (sidebarDept) sidebarDept.textContent = this.profile.department || '—';
                const sidebarAge = document.getElementById('sidebarAge');
                if (sidebarAge) sidebarAge.textContent = this.profile.age || '—';
                const sidebarAddress = document.getElementById('sidebarAddress');
                if (sidebarAddress) sidebarAddress.textContent = this.profile.address || '—';

                // Populate profile view if on dashboard
                this.populateProfileView();
            }

            // Always try to populate dedicated profile page (profile.html)
        } else {
            this.user = null;
            this.profile = null;
        }
    } catch (error) {
        console.error("Authentication check error:", error);
    } finally {
        // Remove fast loader if session is null and staying on guest page
        const fastLoader = document.getElementById('auth-fast-loader');
        if (fastLoader) {
            const path = window.location.pathname;
            const isAuthPage = path.includes('login.html') || path.includes('register.html') || path === '/' || path.endsWith('/');
            if (isAuthPage && !this.user) {
                fastLoader.remove();
            }
        }
    }
},

    routePage: async function () {
        const path = window.location.pathname;
        const isAuthPage = path.includes('login.html') || path.includes('register.html');
        const isDashboard = path.includes('dashboard.html');
        const isProfilePage = path.includes('profile.html');

        if (this.user) {
            // Safe role detection fallback
            const userRole = (this.profile && this.profile.role) || (this.user.user_metadata && this.user.user_metadata.role) || 'student';
            const dash = userRole === 'admin' ? 'admin-dashboard.html' : (userRole === 'faculty' ? 'faculty-dashboard.html' : 'student-dashboard.html');

            if (userRole === 'student') {
                const hasValidSchoolYear = await this.checkSchoolYearExpiration();
                if (!hasValidSchoolYear) {
                    return; // Block access to dashboard/profile load
                }
            }

            // Detect browser back/forward button clicks
            const navEntries = window.performance && window.performance.getEntriesByType && window.performance.getEntriesByType('navigation');
            const isBackForward = navEntries && navEntries.length > 0 && navEntries[0].type === 'back_forward';

            if (isAuthPage) {
                // Always redirect logged-in users to their dashboard — no matter where they came from
                window.location.replace(dash);
            } else if (isProfilePage) {
                // If they landed on profile.html via browser back button from dashboard, lock them back to the dashboard
                if (isBackForward) {
                    window.location.replace(dash);
                } else if (!this.settingsVerified) {
                    // Show a fullscreen blur block to protect the profile details
                    document.body.insertAdjacentHTML('afterbegin', `
                        <div id="profile-blur-lock" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(15, 23, 42, 0.95); backdrop-filter: blur(10px); z-index: 99999; display: flex; align-items: center; justify-content: center;">
                        </div>
                    `);
                    
                    // Show the password prompt modal
                    this.promptSettingsPassword(
                        () => {
                            // On success, remove the blur lock
                            const lock = document.getElementById('profile-blur-lock');
                            if (lock) lock.remove();
                            
                            // Initialize page details
                            const backBtn = document.getElementById('backToDashboard');
                            if (backBtn) {
                                backBtn.href = dash;
                                backBtn.onclick = (e) => {
                                    if (document.referrer && document.referrer.includes('dashboard.html')) {
                                        e.preventDefault();
                                        window.history.back();
                                    }
                                };
                            }
                            this.populateProfilePage();
                            this.loadProfilePageStatsAndTimeline();
                        },
                        () => {
                            // On cancel/close, redirect back to dashboard
                            window.location.replace(dash);
                        }
                    );
                } else {
                    // Set back button destination
                    const backBtn = document.getElementById('backToDashboard');
                    if (backBtn) {
                        backBtn.href = dash;
                        backBtn.onclick = (e) => {
                            if (document.referrer && document.referrer.includes('dashboard.html')) {
                                e.preventDefault();
                                window.history.back();
                            }
                        };
                    }
                    this.populateProfilePage();
                    this.loadProfilePageStatsAndTimeline();
                }
            } else if (isDashboard) {
                if (path.includes('admin-dashboard.html') && userRole !== 'admin') {
                    window.location.replace(userRole === 'faculty' ? 'faculty-dashboard.html' : 'student-dashboard.html');
                }
                if (path.includes('faculty-dashboard.html') && userRole !== 'faculty') {
                    window.location.replace(userRole === 'admin' ? 'admin-dashboard.html' : 'student-dashboard.html');
                }
                if (path.includes('student-dashboard.html') && userRole !== 'student') {
                    window.location.replace(userRole === 'admin' ? 'admin-dashboard.html' : 'faculty-dashboard.html');
                }

                // Prevent leaving the dashboard via browser Back button (locks them in dashboard UX)
                if (window.history && window.history.pushState) {
                    if (!window.history.state || window.history.state.locked !== true) {
                        window.history.pushState({ locked: true }, null, window.location.href);
                    }
                    window.onpopstate = () => {
                        window.history.pushState({ locked: true }, null, window.location.href);
                        this.switchView('dashboard');
                    };
                }

                // Track user presence to prevent duplicate concurrent logins
                this.trackPresence(this.user.id);

                if (userRole === 'student') this.loadStudentDashboard();
                if (userRole === 'faculty') this.loadFacultyDashboard();
                if (userRole === 'admin') this.loadAdminDashboard();
            }
        } else {
            if (isDashboard) {
                window.location.replace('login.html');
            }
        }
    },

    handleLogin: async function (e) {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const alertBox = document.getElementById('loginAlert');
        const btn = document.getElementById('loginBtn');
        const originalText = btn.innerHTML;

        try {
            btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Checking Credentials...';
            btn.disabled = true;

            const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

            if (error) throw error;
            
            // Save login state locally
            localStorage.setItem('consultime_session', data.session.access_token);
            
            // Allow the user to proceed to the dashboard without checking for active sessions
            const userRole = (data.user.user_metadata && data.user.user_metadata.role) || 'student';
            const dash = userRole === 'admin' ? 'admin-dashboard.html' : (userRole === 'faculty' ? 'faculty-dashboard.html' : 'student-dashboard.html');
            window.location.replace(dash);
        } catch (error) {
            alertBox.textContent = error.message;
            alertBox.classList.remove('d-none');
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    },

    handleForgotPassword: async function (e) {
        e.preventDefault();
        const email = document.getElementById('forgotEmail').value;
        const alertBox = document.getElementById('forgotAlert');
        const successBox = document.getElementById('forgotSuccess');
        const btn = document.getElementById('forgotSubmitBtn');
        const originalText = btn.innerHTML;

        alertBox.classList.add('d-none');
        successBox.classList.add('d-none');

        try {
            btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Sending Link...';
            btn.disabled = true;

            const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + window.location.pathname
            });

            if (error) throw error;

            successBox.innerHTML = '<i class="fa-solid fa-circle-check me-2"></i>A secure password reset link has been successfully sent to your email!';
            successBox.classList.remove('d-none');
            document.getElementById('forgotForm').reset();
        } catch (error) {
            alertBox.textContent = error.message;
            alertBox.classList.remove('d-none');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    },

    handlePasswordRecovery: async function (e) {
        e.preventDefault();
        const password = document.getElementById('recoveryPassword').value;
        const confirm = document.getElementById('recoveryConfirmPassword').value;
        const alertBox = document.getElementById('recoveryAlert');
        const successBox = document.getElementById('recoverySuccess');
        const btn = document.getElementById('recoverySubmitBtn');
        const originalText = btn.innerHTML;

        alertBox.classList.add('d-none');
        successBox.classList.add('d-none');

        if (password !== confirm) {
            alertBox.textContent = "Passwords do not match.";
            alertBox.classList.remove('d-none');
            return;
        }

        try {
            btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Updating Password...';
            btn.disabled = true;

            const { error } = await supabaseClient.auth.updateUser({ password });

            if (error) throw error;

            successBox.innerHTML = '<i class="fa-solid fa-circle-check me-2"></i>Password successfully updated! Redirecting to dashboard...';
            successBox.classList.remove('d-none');
            
            // Clear URL Hash
            window.history.replaceState(null, null, window.location.pathname);

            setTimeout(() => {
                window.location.reload();
            }, 1500);
        } catch (error) {
            alertBox.textContent = error.message;
            alertBox.classList.remove('d-none');
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    },

    handleRegister: async function (e) {
        e.preventDefault();
        const fullName = document.getElementById('fullName').value;
        const role = document.getElementById('role').value;
        const idNumber = document.getElementById('idNumber').value;
        let department = document.getElementById('department').value;
        if (department === 'Others_Student' || department === 'Others_Faculty') {
            department = 'Others';
        }
        
        const address = this.getAddressFromUI('address');
        
        const age = document.getElementById('age') ? document.getElementById('age').value : '';
        const schoolYear = document.getElementById('schoolYear') ? document.getElementById('schoolYear').value : '';
        const section = document.getElementById('section') ? document.getElementById('section').value : '';
        const email = document.getElementById('regEmail').value;
        const password = document.getElementById('regPassword').value;
        const confirm = document.getElementById('confirmPassword').value;
        const alertBox = document.getElementById('registerAlert');
        const btn = document.getElementById('registerBtn');

        if (password !== confirm) {
            alertBox.textContent = "Passwords do not match.";
            alertBox.classList.remove('d-none');
            return;
        }

        try {
            btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
            btn.disabled = true;

            // Check if email already exists in profiles table
            const { data: emailExists, error: emailError } = await supabaseClient
                .from('profiles')
                .select('id')
                .eq('email', email)
                .single();

            if (emailExists) {
                throw new Error('Email address is already registered. Please use a different email or sign in.');
            }

            // Check if ID number already exists
            if (idNumber) {
                const { data: idExists, error: idError } = await supabaseClient
                    .from('profiles')
                    .select('id')
                    .eq('id_number', idNumber)
                    .single();

                if (idExists) {
                    throw new Error('ID Number is already registered. Please use a different ID or sign in.');
                }
            }

            const { data, error } = await supabaseClient.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        full_name: fullName,
                        role: role,
                        id_number: idNumber,
                        department: department,
                        address: address,
                        age: age,
                        school_year: role === 'student' ? schoolYear : null,
                        section: role === 'student' ? section : null
                    }
                }
            });

            if (error) throw error;

            if (role === 'faculty') {
                alert("Registration successful! Your faculty account has been created and is currently pending administrator approval. You will be able to log in once an admin activates your account.");
                window.location.replace('login.html?pending=true');
            } else {
                alert("Registration successful! Redirecting to login...");
                window.location.replace('login.html');
            }
        } catch (error) {
            let msg = error.message || '';
            if (msg.includes('rate limit') || msg.includes('Failed to send confirmation email') || msg.includes('magiclink')) {
                alertBox.innerHTML = `
                    <div class="text-start p-1">
                        <h6 class="fw-bold text-danger mb-1">
                            <i class="fa-solid fa-triangle-exclamation me-2"></i>Email Verification Rate Limit Exceeded
                        </h6>
                        <p class="small mb-2 text-white-50">Supabase restricts free projects to sending only 3 verification emails per hour.</p>
                        <span class="small fw-bold d-block mb-1 text-white">How to fix this immediately:</span>
                        <ol class="small ps-3 mb-0 text-white-50">
                            <li>Open your <strong>Supabase Dashboard</strong>.</li>
                            <li>Go to <strong>Authentication</strong> &gt; <strong>Providers</strong> &gt; <strong>Email</strong>.</li>
                            <li>Toggle <strong>"Confirm email"</strong> to <strong>OFF</strong>.</li>
                            <li>Click <strong>Save</strong> at the bottom.</li>
                        </ol>
                    </div>
                `;
            } else {
                alertBox.textContent = msg;
            }
            alertBox.classList.remove('d-none');
            btn.innerHTML = 'Register Account <i class="fa-solid fa-user-plus"></i>';
            btn.disabled = false;
        }
    },

    handleLogout: async function () {
        await supabaseClient.auth.signOut();
        window.location.replace('login.html');
    },

    promptSettingsPassword: function(onSuccessCallback, onCancelCallback) {
        let modal = document.getElementById('settingsAuthModal');
        if (!modal) {
            const modalHtml = `
                <div class="modal fade" id="settingsAuthModal" tabindex="-1" aria-hidden="true" data-bs-backdrop="static">
                    <div class="modal-dialog modal-dialog-centered">
                        <div class="modal-content border-0 rounded-4 shadow-lg overflow-hidden" style="background: #fff; color: #000;">
                            <div class="modal-header border-bottom-0 pb-0 justify-content-between p-4" style="background: linear-gradient(135deg, #1a3b5c 0%, #1e3a8a 100%); color: #fff;">
                                <div class="d-flex align-items-center gap-2">
                                    <i class="fa-solid fa-shield-halved fs-4 text-warning"></i>
                                    <h5 class="modal-title fw-bold mb-0">Security Verification</h5>
                                </div>
                                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close" id="settingsAuthCloseBtn"></button>
                            </div>
                            <div class="modal-body p-4 text-center">
                                <div class="avatar-circle mx-auto mb-3 d-flex align-items-center justify-content-center" style="width: 60px; height: 60px; border-radius: 50%; background: #e0f2fe;">
                                    <i class="fa-solid fa-lock text-primary fs-3"></i>
                                </div>
                                <h6 class="fw-bold text-dark mb-2" style="font-size: 16px;">Password Required</h6>
                                <p class="text-muted small mb-4" style="font-size: 13px;">Please verify your password to access your account settings and personal details.</p>
                                
                                <form id="settingsAuthForm">
                                    <div class="mb-3 text-start">
                                        <label class="form-label small fw-semibold text-muted mb-1" style="font-size: 11px;">Account Password</label>
                                        <div class="input-group">
                                            <span class="input-group-text bg-light border-0"><i class="fa-solid fa-key text-muted"></i></span>
                                            <input type="password" id="settingsAuthPassword" class="form-control bg-light border-0 py-2" placeholder="Enter your password" required style="font-size: 13px;">
                                        </div>
                                    </div>
                                    <div id="settingsAuthAlert" class="alert alert-danger d-none py-2 px-3 small border-0 text-start" role="alert" style="font-size: 12px;">
                                        <i class="fa-solid fa-circle-exclamation me-1"></i> Incorrect password. Please try again.
                                    </div>
                                    <button type="submit" id="settingsAuthConfirmBtn" class="btn btn-primary w-100 py-2 rounded-pill fw-bold mt-2 shadow-sm" style="font-size: 14px;">
                                        Verify & Continue
                                    </button>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            modal = document.getElementById('settingsAuthModal');
        }

        // Initialize Bootstrap Modal
        const bsModal = new bootstrap.Modal(modal);
        
        // Reset state
        document.getElementById('settingsAuthPassword').value = '';
        document.getElementById('settingsAuthAlert').classList.add('d-none');
        const confirmBtn = document.getElementById('settingsAuthConfirmBtn');
        confirmBtn.innerHTML = 'Verify & Continue';
        confirmBtn.disabled = false;

        // Submit listener
        const form = document.getElementById('settingsAuthForm');
        form.onsubmit = async (e) => {
            e.preventDefault();
            const password = document.getElementById('settingsAuthPassword').value;
            const alertBox = document.getElementById('settingsAuthAlert');
            
            try {
                confirmBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin me-2"></i>Verifying...';
                confirmBtn.disabled = true;
                alertBox.classList.add('d-none');

                // Verify password by signing in with the user's email
                const email = this.user.email;
                const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

                if (error) throw error;

                // Success! Set verification flag, hide modal, and show settings view!
                this.settingsVerified = true;
                bsModal.hide();
                
                if (onSuccessCallback) onSuccessCallback();

            } catch (err) {
                console.error("Verification error:", err);
                confirmBtn.innerHTML = 'Verify & Continue';
                confirmBtn.disabled = false;
                alertBox.classList.remove('d-none');
                alertBox.innerHTML = `<i class="fa-solid fa-circle-exclamation me-1"></i> ${err.message || 'Incorrect password. Please try again.'}`;
            }
        };

        // Cancel button / close listener
        const closeBtn = document.getElementById('settingsAuthCloseBtn');
        let cancelTriggered = false;
        
        const triggerCancel = () => {
            if (cancelTriggered) return;
            cancelTriggered = true;
            bsModal.hide();
            if (onCancelCallback) onCancelCallback();
        };

        closeBtn.onclick = triggerCancel;

        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                triggerCancel();
            }
        });

        bsModal.show();
    },

    switchView: function (viewId) {
        document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active', 'text-primary', 'bg-light', 'border-primary'));
        const activeLink = document.getElementById(`nav-${viewId}`);
        if (activeLink) activeLink.classList.add('active', 'text-primary', 'bg-light', 'border-primary');

        const views = ['view-dashboard', 'view-book', 'view-history', 'view-requests', 'view-availability', 'view-weekly-reports', 'view-profile'];
        views.forEach(v => {
            const el = document.getElementById(v);
            if (el) el.classList.add('d-none');
        });

        const targetView = document.getElementById(`view-${viewId}`);
        if (targetView) targetView.classList.remove('d-none');

        if (viewId === 'weekly-reports') {
            this.loadFacultyWeeklyReport();
        }
    },

    // --- PROFILE LOGIC ---
    // --- CASCADING ADDRESS SELECTOR HELPERS ---
    fetchPSGC: async function(endpoint) {
        try {
            const res = await fetch(`https://psgc.cloud/api/${endpoint}`);
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            return await res.json();
        } catch (e) {
            console.error(`PSGC API Error for ${endpoint}:`, e);
            throw e;
        }
    },

    regionsPromise: null,
    fetchRegionsCached: function() {
        if (this.regionsPromise) return this.regionsPromise;
        this.regionsPromise = this.fetchPSGC('regions').then(regions => {
            regions.sort((a, b) => a.name.localeCompare(b.name));
            return regions;
        }).catch(err => {
            this.regionsPromise = null; // Reset on failure so it can retry
            throw err;
        });
        return this.regionsPromise;
    },

    profileAddressInitDone: false,
    addressAddressInitDone: false,

    updateAddressVisibility: function(prefix) {
        const isProfile = (prefix === 'profile');
        const regionEl = document.getElementById(isProfile ? 'profileRegion' : 'addressRegion');
        const provinceEl = document.getElementById(isProfile ? 'profileProvince' : 'addressProvince');
        const provinceWrapper = document.getElementById(isProfile ? 'profileProvinceWrapper' : 'addressProvinceWrapper');
        const cityEl = document.getElementById(isProfile ? 'profileCity' : 'addressCity');
        const barangayEl = document.getElementById(isProfile ? 'profileBarangay' : 'addressBarangay');
        const streetEl = document.getElementById(isProfile ? 'profileStreet' : 'addressStreet');
        
        const manualContainer = document.getElementById(isProfile ? 'profileAddressManualContainer' : 'addressManualContainer');
        const isManualActive = manualContainer && !manualContainer.classList.contains('d-none');

        if (!regionEl) return;

        const toggleField = (el, show, required = false) => {
            if (!el) return;
            const col = el.closest('.col-md-6, .col-md-12, .mb-3');
            if (col) {
                if (show) {
                    col.classList.remove('d-none');
                } else {
                    col.classList.add('d-none');
                }
            }
            if (show && required) {
                el.setAttribute('required', 'required');
            } else {
                el.removeAttribute('required');
            }
        };

        if (isManualActive) {
            if (provinceWrapper) provinceWrapper.classList.add('d-none');
            if (provinceEl) provinceEl.removeAttribute('required');
            toggleField(cityEl, false);
            toggleField(barangayEl, false);
            toggleField(streetEl, false);
            return;
        }

        const regionVal = regionEl.value;
        const hasRegion = !!regionVal;

        const regionHasProvinces = provinceWrapper ? !provinceWrapper.classList.contains('d-none') : true;

        const provinceVal = provinceEl ? provinceEl.value : '';
        const cityVal = cityEl ? cityEl.value : '';
        const barangayVal = barangayEl ? barangayEl.value : '';

        // 1. Region is always shown.

        // 2. Province is shown if a region is selected AND that region has provinces.
        const showProvince = hasRegion && regionHasProvinces;
        if (provinceWrapper) {
            if (showProvince) {
                provinceWrapper.classList.remove('d-none');
                if (provinceEl) provinceEl.setAttribute('required', 'required');
            } else {
                provinceWrapper.classList.add('d-none');
                if (provinceEl) provinceEl.removeAttribute('required');
            }
        }

        // 3. City is shown if a region is selected AND (either region has no provinces OR a province is selected)
        const showCity = hasRegion && (!regionHasProvinces || !!provinceVal);
        toggleField(cityEl, showCity, true);

        // 4. Barangay is shown if City is shown AND selected
        const showBarangay = showCity && !!cityVal;
        toggleField(barangayEl, showBarangay, true);

        // 5. Street is shown if Barangay is shown AND selected
        const showStreet = showBarangay && !!barangayVal;
        toggleField(streetEl, showStreet, false);
    },

    initAddressSelectors: async function(prefix) {
        const isProfile = (prefix === 'profile');

        const regionEl = document.getElementById(isProfile ? 'profileRegion' : 'addressRegion');
        const provinceEl = document.getElementById(isProfile ? 'profileProvince' : 'addressProvince');
        const provinceWrapper = document.getElementById(isProfile ? 'profileProvinceWrapper' : 'addressProvinceWrapper');
        const cityEl = document.getElementById(isProfile ? 'profileCity' : 'addressCity');
        const barangayEl = document.getElementById(isProfile ? 'profileBarangay' : 'addressBarangay');
        const streetEl = document.getElementById(isProfile ? 'profileStreet' : 'addressStreet');
        const manualEl = document.getElementById(isProfile ? 'profileManual' : 'addressManual');
        const selectContainer = document.getElementById(isProfile ? 'profileAddressSelectContainer' : 'addressSelectContainer');
        const manualContainer = document.getElementById(isProfile ? 'profileAddressManualContainer' : 'addressManualContainer');
        const toggleManualBtn = document.getElementById(isProfile ? 'toggleProfileManualAddress' : 'toggleManualAddress');
        const toggleSelectBtn = document.getElementById(isProfile ? 'toggleProfileSelectAddress' : 'toggleSelectAddress');

        if (!regionEl) return;

        const showManualMode = (show) => {
            if (show) {
                if (selectContainer) selectContainer.classList.add('d-none');
                if (manualContainer) manualContainer.classList.remove('d-none');
                regionEl.removeAttribute('required');
                if (manualEl) manualEl.setAttribute('required', 'required');
                this.updateAddressVisibility(prefix);
            } else {
                if (manualContainer) manualContainer.classList.add('d-none');
                if (selectContainer) selectContainer.classList.remove('d-none');
                regionEl.setAttribute('required', 'required');
                if (manualEl) manualEl.removeAttribute('required');
                this.updateAddressVisibility(prefix);
            }
        };

        if (toggleManualBtn) {
            toggleManualBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                showManualMode(true);
                return false;
            });
        }
        if (toggleSelectBtn) {
            toggleSelectBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                showManualMode(false);
                return false;
            });
        }

        // Handle Region Change
        regionEl.onchange = async () => {
            const regionCode = regionEl.value;
            if (provinceEl) {
                provinceEl.innerHTML = '<option value="" disabled selected>Select Region first</option>';
                provinceEl.disabled = true;
            }
            if (cityEl) {
                cityEl.innerHTML = '<option value="" disabled selected>Select Province first</option>';
                cityEl.disabled = true;
            }
            if (barangayEl) {
                barangayEl.innerHTML = '<option value="" disabled selected>Select City first</option>';
                barangayEl.disabled = true;
            }
            if (streetEl) {
                streetEl.value = '';
            }

            if (provinceWrapper) {
                provinceWrapper.classList.add('d-none');
            }

            this.updateAddressVisibility(prefix);

            if (!regionCode) return;

            try {
                if (provinceEl) provinceEl.innerHTML = '<option value="" disabled selected>Loading Provinces...</option>';
                const provinces = await this.fetchPSGC(`regions/${regionCode}/provinces`);

                if (provinces && provinces.length > 0 && provinceEl) {
                    if (provinceWrapper) provinceWrapper.classList.remove('d-none');
                    provinceEl.disabled = false;

                    provinces.sort((a, b) => a.name.localeCompare(b.name));
                    provinceEl.innerHTML = '<option value="" disabled selected>Select Province</option>';
                    provinces.forEach(p => {
                        const opt = document.createElement('option');
                        opt.value = p.code;
                        opt.textContent = p.name;
                        provinceEl.appendChild(opt);
                    });
                } else {
                    if (provinceWrapper) provinceWrapper.classList.add('d-none');
                    if (provinceEl) {
                        provinceEl.innerHTML = '';
                        provinceEl.disabled = true;
                    }

                    // Direct cities fetch for NCR / regions without provinces
                    if (cityEl) {
                        cityEl.innerHTML = '<option value="" disabled selected>Loading Cities...</option>';
                        cityEl.disabled = false;
                    }
                    const cities = await this.fetchPSGC(`regions/${regionCode}/cities-municipalities`);
                    cities.sort((a, b) => a.name.localeCompare(b.name));
                    if (cityEl) {
                        cityEl.innerHTML = '<option value="" disabled selected>Select City / Municipality</option>';
                        cities.forEach(c => {
                            const opt = document.createElement('option');
                            opt.value = c.code;
                            opt.textContent = c.name;
                            cityEl.appendChild(opt);
                        });
                    }
                }
                this.updateAddressVisibility(prefix);
            } catch (err) {
                showManualMode(true);
            }
        };

        // Handle Province Change
        if (provinceEl) {
            provinceEl.onchange = async () => {
                const provinceCode = provinceEl.value;
                if (cityEl) {
                    cityEl.innerHTML = '<option value="" disabled selected>Select Province first</option>';
                    cityEl.disabled = true;
                }
                if (barangayEl) {
                    barangayEl.innerHTML = '<option value="" disabled selected>Select City first</option>';
                    barangayEl.disabled = true;
                }
                if (streetEl) {
                    streetEl.value = '';
                }

                this.updateAddressVisibility(prefix);

                if (!provinceCode) return;

                try {
                    if (cityEl) {
                        cityEl.innerHTML = '<option value="" disabled selected>Loading Cities...</option>';
                        cityEl.disabled = false;
                    }
                    const cities = await this.fetchPSGC(`provinces/${provinceCode}/cities-municipalities`);
                    cities.sort((a, b) => a.name.localeCompare(b.name));
                    if (cityEl) {
                        cityEl.innerHTML = '<option value="" disabled selected>Select City / Municipality</option>';
                        cities.forEach(c => {
                            const opt = document.createElement('option');
                            opt.value = c.code;
                            opt.textContent = c.name;
                            cityEl.appendChild(opt);
                        });
                    }
                    this.updateAddressVisibility(prefix);
                } catch (err) {
                    showManualMode(true);
                }
            };
        }

        // Handle City Change
        if (cityEl) {
            cityEl.onchange = async () => {
                const cityCode = cityEl.value;
                if (barangayEl) {
                    barangayEl.innerHTML = '<option value="" disabled selected>Select City first</option>';
                    barangayEl.disabled = true;
                }
                if (streetEl) {
                    streetEl.value = '';
                }

                this.updateAddressVisibility(prefix);

                if (!cityCode) return;

                try {
                    if (barangayEl) {
                        barangayEl.innerHTML = '<option value="" disabled selected>Loading Barangays...</option>';
                        barangayEl.disabled = false;
                    }
                    const barangays = await this.fetchPSGC(`cities-municipalities/${cityCode}/barangays`);
                    barangays.sort((a, b) => a.name.localeCompare(b.name));
                    if (barangayEl) {
                        barangayEl.innerHTML = '<option value="" disabled selected>Select Barangay</option>';
                        barangays.forEach(b => {
                            const opt = document.createElement('option');
                            opt.value = b.code;
                            opt.textContent = b.name;
                            barangayEl.appendChild(opt);
                        });
                    }
                    this.updateAddressVisibility(prefix);
                } catch (err) {
                    showManualMode(true);
                }
            };
        }

        // Handle Barangay Change
        if (barangayEl) {
            barangayEl.onchange = () => {
                this.updateAddressVisibility(prefix);
            };
        }

        // Load Initial Regions
        try {
            regionEl.innerHTML = '<option value="" disabled selected>Loading Regions...</option>';
            const regions = await this.fetchRegionsCached();
            regionEl.innerHTML = '<option value="" disabled selected>Select Region</option>';
            regions.forEach(r => {
                const opt = document.createElement('option');
                opt.value = r.code;
                opt.textContent = r.name;
                regionEl.appendChild(opt);
            });
            this.updateAddressVisibility(prefix);
        } catch (err) {
            showManualMode(true);
            if (manualEl) {
                manualEl.placeholder = "API offline. Please type your full address here.";
            }
        }
    },

    setAddressFromParsed: async function(prefix, fullAddress) {
        const isProfile = (prefix === 'profile');
        const regionEl = document.getElementById(isProfile ? 'profileRegion' : 'addressRegion');
        const provinceEl = document.getElementById(isProfile ? 'profileProvince' : 'addressProvince');
        const provinceWrapper = document.getElementById(isProfile ? 'profileProvinceWrapper' : 'addressProvinceWrapper');
        const cityEl = document.getElementById(isProfile ? 'profileCity' : 'addressCity');
        const barangayEl = document.getElementById(isProfile ? 'profileBarangay' : 'addressBarangay');
        const streetEl = document.getElementById(isProfile ? 'profileStreet' : 'addressStreet');
        const manualEl = document.getElementById(isProfile ? 'profileManual' : 'addressManual');
        const selectContainer = document.getElementById(isProfile ? 'profileAddressSelectContainer' : 'addressSelectContainer');
        const manualContainer = document.getElementById(isProfile ? 'profileAddressManualContainer' : 'addressManualContainer');

        if (!regionEl) return;

        const showManualMode = (show) => {
            if (show) {
                if (selectContainer) selectContainer.classList.add('d-none');
                if (manualContainer) manualContainer.classList.remove('d-none');
                regionEl.removeAttribute('required');
                if (manualEl) manualEl.setAttribute('required', 'required');
                this.updateAddressVisibility(prefix);
            } else {
                if (manualContainer) manualContainer.classList.add('d-none');
                if (selectContainer) selectContainer.classList.remove('d-none');
                regionEl.setAttribute('required', 'required');
                if (manualEl) manualEl.removeAttribute('required');
                this.updateAddressVisibility(prefix);
            }
        };

        if (!fullAddress) {
            showManualMode(false);
            return;
        }

        const parts = fullAddress.split(',').map(s => s.trim());
        // Standard cascading address expects 4 or 5 segments
        if (parts.length < 4) {
            showManualMode(true);
            if (manualEl) manualEl.value = fullAddress;
            return;
        }

        try {
            let regionPart, provincePart, cityPart, barangayPart, streetPart;
            if (parts.length === 5) {
                streetPart = parts[0];
                barangayPart = parts[1];
                cityPart = parts[2];
                provincePart = parts[3];
                regionPart = parts[4];
            } else {
                // 4 parts: Street, Barangay, City, Region (no province, like NCR)
                streetPart = parts[0];
                barangayPart = parts[1];
                cityPart = parts[2];
                regionPart = parts[3];
                provincePart = null;
            }

            // Ensure regions are loaded
            let regions = Array.from(regionEl.options).filter(o => o.value);
            if (regions.length === 0) {
                const rawRegions = await this.fetchRegionsCached();
                regionEl.innerHTML = '<option value="" disabled selected>Select Region</option>';
                rawRegions.forEach(r => {
                    const opt = document.createElement('option');
                    opt.value = r.code;
                    opt.textContent = r.name;
                    regionEl.appendChild(opt);
                });
                regions = Array.from(regionEl.options).filter(o => o.value);
            }

            // Find matching region
            const matchedRegion = regions.find(o => o.textContent.toLowerCase() === regionPart.toLowerCase());
            if (!matchedRegion) throw new Error(`Region matching "${regionPart}" not found`);
            regionEl.value = matchedRegion.value;

            // Load provinces or cities directly
            const regionCode = regionEl.value;
            const provinces = await this.fetchPSGC(`regions/${regionCode}/provinces`);

            if (provinces && provinces.length > 0 && provinceEl) {
                if (provinceWrapper) provinceWrapper.classList.remove('d-none');
                provinceEl.disabled = false;
                provinceEl.setAttribute('required', 'required');

                provinces.sort((a, b) => a.name.localeCompare(b.name));
                provinceEl.innerHTML = '<option value="" disabled selected>Select Province</option>';
                provinces.forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = p.code;
                    opt.textContent = p.name;
                    provinceEl.appendChild(opt);
                });

                if (!provincePart) throw new Error("Province segment expected but not found in address");
                const matchedProvince = Array.from(provinceEl.options).find(o => o.textContent.toLowerCase() === provincePart.toLowerCase());
                if (!matchedProvince) throw new Error(`Province matching "${provincePart}" not found`);
                provinceEl.value = matchedProvince.value;

                // Load cities for province
                if (cityEl) {
                    cityEl.disabled = false;
                    const cities = await this.fetchPSGC(`provinces/${provinceEl.value}/cities-municipalities`);
                    cities.sort((a, b) => a.name.localeCompare(b.name));
                    cityEl.innerHTML = '<option value="" disabled selected>Select City / Municipality</option>';
                    cities.forEach(c => {
                        const opt = document.createElement('option');
                        opt.value = c.code;
                        opt.textContent = c.name;
                        cityEl.appendChild(opt);
                    });
                }
            } else {
                if (provinceWrapper) provinceWrapper.classList.add('d-none');
                if (provinceEl) {
                    provinceEl.innerHTML = '';
                    provinceEl.removeAttribute('required');
                    provinceEl.disabled = true;
                }

                // Direct load cities for NCR
                if (cityEl) {
                    cityEl.disabled = false;
                    const cities = await this.fetchPSGC(`regions/${regionCode}/cities-municipalities`);
                    cities.sort((a, b) => a.name.localeCompare(b.name));
                    cityEl.innerHTML = '<option value="" disabled selected>Select City / Municipality</option>';
                    cities.forEach(c => {
                        const opt = document.createElement('option');
                        opt.value = c.code;
                        opt.textContent = c.name;
                        cityEl.appendChild(opt);
                    });
                }
            }

            // Find matching city
            if (cityEl) {
                const matchedCity = Array.from(cityEl.options).find(o => o.textContent.toLowerCase() === cityPart.toLowerCase());
                if (!matchedCity) throw new Error(`City matching "${cityPart}" not found`);
                cityEl.value = matchedCity.value;

                // Load barangays
                if (barangayEl) {
                    barangayEl.disabled = false;
                    const barangays = await this.fetchPSGC(`cities-municipalities/${cityEl.value}/barangays`);
                    barangays.sort((a, b) => a.name.localeCompare(b.name));
                    barangayEl.innerHTML = '<option value="" disabled selected>Select Barangay</option>';
                    barangays.forEach(b => {
                        const opt = document.createElement('option');
                        opt.value = b.code;
                        opt.textContent = b.name;
                        barangayEl.appendChild(opt);
                    });
                }
            }

            // Find matching barangay
            if (barangayEl) {
                const matchedBarangay = Array.from(barangayEl.options).find(o => o.textContent.toLowerCase() === barangayPart.toLowerCase());
                if (!matchedBarangay) throw new Error(`Barangay matching "${barangayPart}" not found`);
                barangayEl.value = matchedBarangay.value;
            }

            // Set street
            if (streetEl) streetEl.value = streetPart;

            showManualMode(false);
        } catch (err) {
            console.warn("Failed to parse address into dropdowns, falling back to manual entry:", err);
            showManualMode(true);
            if (manualEl) manualEl.value = fullAddress;
        }
    },

    getAddressFromUI: function(prefix) {
        const isProfile = (prefix === 'profile');
        const manualContainer = document.getElementById(isProfile ? 'profileAddressManualContainer' : 'addressManualContainer');
        const manualEl = document.getElementById(isProfile ? 'profileManual' : 'addressManual');
        
        if (manualContainer && !manualContainer.classList.contains('d-none')) {
            return manualEl ? manualEl.value.trim() : '';
        }
        
        const regionEl = document.getElementById(isProfile ? 'profileRegion' : 'addressRegion');
        const provinceEl = document.getElementById(isProfile ? 'profileProvince' : 'addressProvince');
        const provinceWrapper = document.getElementById(isProfile ? 'profileProvinceWrapper' : 'addressProvinceWrapper');
        const cityEl = document.getElementById(isProfile ? 'profileCity' : 'addressCity');
        const barangayEl = document.getElementById(isProfile ? 'profileBarangay' : 'addressBarangay');
        const streetEl = document.getElementById(isProfile ? 'profileStreet' : 'addressStreet');
        
        const street = streetEl ? streetEl.value.trim() : '';
        const barangay = (barangayEl && barangayEl.selectedIndex > 0) ? barangayEl.options[barangayEl.selectedIndex].text : '';
        const city = (cityEl && cityEl.selectedIndex > 0) ? cityEl.options[cityEl.selectedIndex].text : '';
        const province = (provinceWrapper && !provinceWrapper.classList.contains('d-none') && provinceEl && provinceEl.selectedIndex > 0) ? provinceEl.options[provinceEl.selectedIndex].text : '';
        const region = (regionEl && regionEl.selectedIndex > 0) ? regionEl.options[regionEl.selectedIndex].text : '';
        
        const parts = [];
        if (street) parts.push(street);
        if (barangay) parts.push(barangay);
        if (city) parts.push(city);
        if (province) parts.push(province);
        if (region) parts.push(region);
        
        return parts.join(', ');
    },


    populateProfileView: function() {
        if (!document.getElementById('profileName')) return;
        
        if (document.getElementById('profileRegion')) {
            this.initAddressSelectors('profile');
        }
        
        document.getElementById('profileName').value = this.profile.full_name;
        const profileDeptEl = document.getElementById('profileDept');
        if (profileDeptEl) {
            const deptVal = this.profile.department || '';
            if (deptVal && !Array.from(profileDeptEl.options).some(o => o.value === deptVal)) {
                const opt = document.createElement('option');
                opt.value = deptVal;
                opt.textContent = deptVal;
                profileDeptEl.appendChild(opt);
            }
            profileDeptEl.value = deptVal;
        }
        if (document.getElementById('profileIdNumber')) {
            document.getElementById('profileIdNumber').value = this.profile.id_number || '';
        }
        const profileBarangayEl = document.getElementById('profileBarangay');
        const profileStreetEl = document.getElementById('profileStreet');
        if (profileBarangayEl && profileStreetEl) {
            this.setAddressFromParsed('profile', this.profile.address || '');
        } else if (document.getElementById('profileAddress')) {
            document.getElementById('profileAddress').value = this.profile.address || '';
        }
        if (document.getElementById('profileAge')) {
            document.getElementById('profileAge').value = this.profile.age || '';
        }
        if (this.profile.role === 'student') {
            const syEl = document.getElementById('profileSchoolYear');
            const secEl = document.getElementById('profileSection');
            if (syEl) {
                syEl.value = this.profile.school_year || this.getExpectedSchoolYear();
                syEl.setAttribute('readonly', 'readonly');
                syEl.setAttribute('required', 'required');
            }
            if (secEl) {
                secEl.value = this.profile.section || '';
                secEl.setAttribute('required', 'required');
            }
        }
        document.getElementById('profileEmail').value = this.profile.email;
        
        document.getElementById('profileNameDisplay').textContent = this.profile.full_name;
        const emailDisp = document.getElementById('profileEmailDisplay');
        if (emailDisp) emailDisp.textContent = this.profile.email;
        const roleBadge = document.getElementById('profileRoleBadge');
        if (roleBadge) roleBadge.textContent = this.profile.role.toUpperCase();

        const preview = document.getElementById('profileAvatarPreview');
        const initials = document.getElementById('profileAvatarInitials');
        if (preview && initials) {
            const isNested = initials.contains(preview);
            if (this.profile.avatar) {
                preview.src = this.profile.avatar;
                preview.style.display = 'block';
                preview.classList.remove('d-none');
                
                if (isNested) {
                    const textSpan = document.getElementById('profileInitialsText');
                    if (textSpan) textSpan.style.display = 'none';
                } else {
                    initials.classList.add('d-none');
                    initials.classList.remove('d-flex');
                    initials.style.setProperty('display', 'none', 'important');
                }
            } else {
                const initialsEl = document.getElementById('sidebarUserInitials') || document.getElementById('userInitials');
                const text = initialsEl ? initialsEl.textContent.trim() : 'ST';
                
                preview.style.display = 'none';
                preview.classList.add('d-none');

                if (isNested) {
                    const textSpan = document.getElementById('profileInitialsText');
                    if (textSpan) {
                        textSpan.textContent = text;
                        textSpan.style.display = 'inline';
                    }
                } else {
                    initials.textContent = text;
                    initials.classList.remove('d-none');
                    initials.classList.add('d-flex');
                    initials.style.setProperty('display', 'flex', 'important');
                }
            }
        }
    },

    populateProfilePage: function() {
        if (!document.getElementById('heroName')) return;
        if (!this.profile) return;
        const p = this.profile;
        const initials = p.full_name ? p.full_name.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase() : 'US';

        // Hero section
        document.getElementById('heroName').textContent = p.full_name;
        document.getElementById('heroEmail').textContent = p.email;
        const heroBadge = document.getElementById('heroBadge');
        if (heroBadge) {
            heroBadge.textContent = p.role.toUpperCase();
            if (p.role === 'student') {
                heroBadge.style.backgroundColor = '#3b82f6';
            } else if (p.role === 'faculty') {
                heroBadge.style.backgroundColor = '#10b981';
            } else {
                heroBadge.style.backgroundColor = '#ef4444';
            }
        }
        
        const textSpan = document.getElementById('profileInitialsText');
        if (textSpan) textSpan.textContent = initials;

        const preview = document.getElementById('profileAvatarPreview');

        if (preview) {
            if (p.avatar) {
                preview.src = p.avatar;
                preview.style.display = 'block';
                preview.classList.remove('d-none');
                if (textSpan) textSpan.style.display = 'none';
            } else {
                preview.style.display = 'none';
                preview.classList.add('d-none');
                if (textSpan) textSpan.style.display = 'block';
            }
        }

        // Info card
        document.getElementById('infoIdNumber').textContent = p.id_number || '—';
        document.getElementById('infoDept').textContent = p.department || '—';
        document.getElementById('infoEmail').textContent = p.email;
        document.getElementById('infoAge').textContent = p.age || '—';
        document.getElementById('infoAddress').textContent = p.address || '—';
        
        if (p.role === 'student') {
            if (document.getElementById('rowSchoolYear')) document.getElementById('rowSchoolYear').classList.remove('d-none');
            if (document.getElementById('rowSection')) document.getElementById('rowSection').classList.remove('d-none');
            if (document.getElementById('infoSchoolYear')) document.getElementById('infoSchoolYear').textContent = p.school_year || '—';
            if (document.getElementById('infoSection')) document.getElementById('infoSection').textContent = p.section || '—';
        } else {
            if (document.getElementById('rowSchoolYear')) document.getElementById('rowSchoolYear').classList.add('d-none');
            if (document.getElementById('rowSection')) document.getElementById('rowSection').classList.add('d-none');
        }

        // Edit form
        const profileNameInput = document.getElementById('profileName');
        if (profileNameInput) {
            if (document.getElementById('profileRegion')) {
                this.initAddressSelectors('profile');
            }
            profileNameInput.value = p.full_name;
            if (document.getElementById('profileEmail')) document.getElementById('profileEmail').value = p.email;
            if (document.getElementById('profileIdNumber')) document.getElementById('profileIdNumber').value = p.id_number || '';
            const profileDeptSelect = document.getElementById('profileDept');
            if (profileDeptSelect) {
                const currentVal = p.department || '';
                if (currentVal && !Array.from(profileDeptSelect.options).some(opt => opt.value === currentVal)) {
                    const opt = document.createElement('option');
                    opt.value = currentVal;
                    opt.textContent = currentVal;
                    profileDeptSelect.appendChild(opt);
                }
                profileDeptSelect.value = currentVal;
            }
            const profileBarangayEl = document.getElementById('profileBarangay');
            const profileStreetEl = document.getElementById('profileStreet');
            if (profileBarangayEl && profileStreetEl) {
                this.setAddressFromParsed('profile', p.address || '');
            } else if (document.getElementById('profileAddress')) {
                document.getElementById('profileAddress').value = p.address || '';
            }
            if (document.getElementById('profileAge')) document.getElementById('profileAge').value = p.age || '';
            if (p.role === 'student') {
                if (document.getElementById('profileSchoolYear')) document.getElementById('profileSchoolYear').value = p.school_year || '';
                if (document.getElementById('profileSection')) document.getElementById('profileSection').value = p.section || '';
            }
        }

        // Avatar upload handler
        const avatarInput = document.getElementById('avatarUpload');
        if (avatarInput) {
            avatarInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    this.tempAvatar = ev.target.result;
                    document.getElementById('profileAvatarPreview').src = ev.target.result;
                    document.getElementById('profileAvatarPreview').style.display = 'block';
                    document.getElementById('profileInitialsText').style.display = 'none';
                };
                reader.readAsDataURL(file);
            });
        }

        // Profile form
        const profileForm = document.getElementById('profileForm');
        if (profileForm) {
            profileForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const btn = document.getElementById('saveProfileBtn');
                btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin me-2"></i>Saving...';
                btn.disabled = true;

                const addressVal = this.getAddressFromUI('profile');

                const updates = {
                    full_name: document.getElementById('profileName').value,
                    department: document.getElementById('profileDept').value,
                    id_number: document.getElementById('profileIdNumber').value,
                    address: addressVal,
                    age: parseInt(document.getElementById('profileAge').value) || null
                };
                if (this.profile.role === 'student') {
                    const syVal = document.getElementById('profileSchoolYear') ? document.getElementById('profileSchoolYear').value : '';
                    const secVal = document.getElementById('profileSection') ? document.getElementById('profileSection').value.trim() : '';
                    if (!secVal) {
                        this.showProfileToast('Class section is required for student profiles.', 'danger');
                        btn.innerHTML = '<i class="fa-solid fa-floppy-disk me-2"></i>Save Changes';
                        btn.disabled = false;
                        return;
                    }
                    updates.school_year = syVal;
                    updates.section = secVal;
                }
                if (this.tempAvatar) updates.avatar = this.tempAvatar;

                const { error } = await supabaseClient.from('profiles').update(updates).eq('id', this.user.id);

                btn.innerHTML = '<i class="fa-solid fa-floppy-disk me-2"></i>Save Changes';
                btn.disabled = false;

                if (error) {
                    this.showProfileToast('Error: ' + error.message, 'danger');
                } else {
                    Object.assign(this.profile, updates);
                    // Refresh info card
                    document.getElementById('heroName').textContent = updates.full_name;
                    document.getElementById('infoIdNumber').textContent = updates.id_number || '—';
                    document.getElementById('infoDept').textContent = updates.department || '—';
                    document.getElementById('infoAge').textContent = updates.age || '—';
                    document.getElementById('infoAddress').textContent = updates.address || '—';
                    if (this.profile.role === 'student') {
                        if (document.getElementById('infoSchoolYear')) document.getElementById('infoSchoolYear').textContent = updates.school_year || '—';
                        if (document.getElementById('infoSection')) document.getElementById('infoSection').textContent = updates.section || '—';
                    }
                    this.showProfileToast('Profile updated successfully!', 'success');
                }
            });
        }

        // Action Buttons (Share & Export)
        const btnShare = document.getElementById('btnShareProfile');
        if (btnShare) {
            btnShare.addEventListener('click', () => {
                const infoText = `ConsulTime Profile\nName: ${p.full_name}\nRole: ${p.role.toUpperCase()}\nID Number: ${p.id_number || '—'}\nDepartment: ${p.department || '—'}\nEmail: ${p.email}`;
                navigator.clipboard.writeText(infoText).then(() => {
                    this.showProfileToast('📋 Profile details copied to clipboard!', 'success');
                }).catch(() => {
                    this.showProfileToast('Unable to copy details.', 'danger');
                });
            });
        }

        const btnPrint = document.getElementById('btnPrintProfile');
        if (btnPrint) {
            btnPrint.addEventListener('click', () => {
                window.print();
            });
        }
    },

    showProfileToast: function(message, type) {
        const box = document.getElementById('toastBox');
        const body = document.getElementById('toastBody');
        if (!box || !body) return;
        const icons = { success: 'fa-circle-check text-success', danger: 'fa-circle-xmark text-danger', info: 'fa-circle-info text-info' };
        body.innerHTML = `<i class="fa-solid ${icons[type] || icons.info} fs-5"></i> ${message}`;
        box.style.display = 'block';
        setTimeout(() => { box.style.display = 'none'; }, 3500);
    },

    handleAvatarUpload: function(e) {

        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const base64Str = event.target.result;
            // Update UI immediately
            document.getElementById('profileAvatarPreview').src = base64Str;
            document.getElementById('profileAvatarPreview').style.display = 'block';
            document.getElementById('profileAvatarInitials').style.display = 'none';
            // Save to object so handleProfileSubmit can access it
            this.tempAvatar = base64Str;
        };
        reader.readAsDataURL(file);
    },

    handleProfileSubmit: async function(e) {
        e.preventDefault();
        const btn = document.getElementById('saveProfileBtn');
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Saving...';
        btn.disabled = true;

        const name = document.getElementById('profileName').value;
        const dept = document.getElementById('profileDept').value;
        const idNumber = document.getElementById('profileIdNumber') ? document.getElementById('profileIdNumber').value : '';
        
        const address = this.getAddressFromUI('profile');
        
        const age = document.getElementById('profileAge') ? document.getElementById('profileAge').value : '';
        
        const updates = {
            full_name: name,
            department: dept
        };
        if (idNumber) updates.id_number = idNumber;
        if (address) updates.address = address;
        if (age) updates.age = parseInt(age);
        if (this.profile.role === 'student') {
            const syVal = document.getElementById('profileSchoolYear') ? document.getElementById('profileSchoolYear').value : '';
            const secVal = document.getElementById('profileSection') ? document.getElementById('profileSection').value.trim() : '';
            if (!secVal) {
                this.showToast('Validation Error', 'Class section is required for student profiles.', 'danger');
                btn.innerHTML = '<i class="fa-solid fa-floppy-disk me-1"></i> Save Changes';
                btn.disabled = false;
                return;
            }
            updates.school_year = syVal;
            updates.section = secVal;
        }

        if (this.tempAvatar) {
            updates.avatar = this.tempAvatar;
        }

        const { error } = await supabaseClient.from('profiles').update(updates).eq('id', this.user.id);
        
        btn.innerHTML = '<i class="fa-solid fa-floppy-disk me-1"></i> Save Changes';
        btn.disabled = false;

        if (error) {
            this.showToast('Error', error.message, 'danger');
        } else {
            this.showToast('Success', 'Profile updated successfully!', 'success');
            // Update local state
            this.profile.full_name = name;
            this.profile.department = dept;
            if (idNumber) this.profile.id_number = idNumber;
            if (address) this.profile.address = address;
            if (age) this.profile.age = parseInt(age);
            if (this.profile.role === 'student') {
                this.profile.school_year = updates.school_year;
                this.profile.section = updates.section;
            }
            if (this.tempAvatar) this.profile.avatar = this.tempAvatar;
            this.checkAuthStatus(); // Refresh UI headers
        }
    },

    handlePasswordSubmit: async function(e) {
        e.preventDefault();
        const newPw = document.getElementById('newPassword').value;
        const confirmPw = document.getElementById('confirmNewPassword').value;
        const btn = document.getElementById('changePasswordBtn');

        if (newPw !== confirmPw) {
            if (document.getElementById('toastBox')) {
                this.showProfileToast('Passwords do not match!', 'danger');
            } else {
                this.showToast('Error', 'Passwords do not match!', 'danger');
            }
            return;
        }

        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin me-2"></i>Updating...';
        btn.disabled = true;

        const { error } = await supabaseClient.auth.updateUser({ password: newPw });

        btn.innerHTML = '<i class="fa-solid fa-key me-2"></i>Update Password';
        btn.disabled = false;

        if (error) {
            if (document.getElementById('toastBox')) {
                this.showProfileToast('Error: ' + error.message, 'danger');
            } else {
                this.showToast('Error', error.message, 'danger');
            }
        } else {
            document.getElementById('newPassword').value = '';
            document.getElementById('confirmNewPassword').value = '';
            if (document.getElementById('toastBox')) {
                this.showProfileToast('Password updated successfully!', 'success');
            } else {
                this.showToast('Success', 'Password updated successfully!', 'success');
            }
        }
    },

    loadProfilePageStatsAndTimeline: async function() {
        if (!document.getElementById('profileStatTotal')) return;
        if (!this.profile) return;

        try {
            const role = this.profile.role;
            const joinQuery = role === 'faculty' 
                ? '*, profiles!appointments_student_id_fkey(full_name)' 
                : '*, profiles!appointments_faculty_id_fkey(full_name)';
            
            const { data, error } = await supabaseClient
                .from('appointments')
                .select(joinQuery)
                .or(`student_id.eq.${this.user.id},faculty_id.eq.${this.user.id}`)
                .order('appointment_date', { ascending: false });

            if (error) throw error;

            let total = data.length;
            let completed = data.filter(a => a.status === 'completed').length;
            let pending = data.filter(a => a.status === 'pending' || a.status === 'approved').length;

            document.getElementById('profileStatTotal').textContent = total;
            document.getElementById('profileStatCompleted').textContent = completed;
            document.getElementById('profileStatPending').textContent = pending;

            // Render Timeline
            const timeline = document.getElementById('profileTimeline');
            timeline.innerHTML = '';

            if (data.length === 0) {
                timeline.innerHTML = '<div class="text-center py-4 text-muted small"><i class="fa-solid fa-circle-info mb-2 fs-5 text-muted d-block"></i>No recent consultations activity recorded yet.</div>';
                return;
            }

            // Take the last 4 appointments for the timeline
            data.slice(0, 4).forEach(appt => {
                const dateObj = new Date(appt.appointment_date);
                const dateStr = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
                const formatTime = (time) => new Date(`1970-01-01T${time}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                
                let title = '';
                let desc = '';
                let icon = '';
                
                if (role === 'student') {
                    // Student timeline
                    const partnerName = sanitizeHTML(appt.profiles ? appt.profiles.full_name : 'Faculty');
                    icon = appt.status === 'completed' ? 'fa-check' : (appt.status === 'approved' ? 'fa-calendar' : (appt.status === 'pending' ? 'fa-clock' : 'fa-xmark'));
                    
                    if (appt.status === 'completed') {
                        title = `Completed consultation with ${partnerName}`;
                        desc = `Topic: "${sanitizeHTML(appt.purpose)}" successfully resolved.`;
                    } else if (appt.status === 'approved') {
                        title = `Consultation scheduled with ${partnerName}`;
                        desc = `Confirmed for ${formatTime(appt.start_time)} - ${formatTime(appt.end_time)}.`;
                    } else if (appt.status === 'pending') {
                        title = `Requested consultation with ${partnerName}`;
                        desc = `Awaiting approval for the purpose: "${sanitizeHTML(appt.purpose)}".`;
                    } else {
                        title = `Consultation with ${partnerName} rejected`;
                        desc = appt.notes ? `Reason: "${sanitizeHTML(appt.notes)}"` : `The request was rejected or cancelled.`;
                    }
                } else {
                    // Faculty timeline
                    const partnerName = sanitizeHTML(appt.profiles ? appt.profiles.full_name : 'Student');
                    icon = appt.status === 'completed' ? 'fa-check' : (appt.status === 'approved' ? 'fa-calendar' : (appt.status === 'pending' ? 'fa-clock' : 'fa-xmark'));
                    
                    if (appt.status === 'completed') {
                        title = `Completed consultation with ${partnerName}`;
                        desc = `Resolved purpose: "${sanitizeHTML(appt.purpose)}".`;
                    } else if (appt.status === 'approved') {
                        title = `Scheduled consultation with ${partnerName}`;
                        desc = `Time: ${formatTime(appt.start_time)} - ${formatTime(appt.end_time)}.`;
                    } else if (appt.status === 'pending') {
                        title = `New consultation request from ${partnerName}`;
                        desc = `Requested a session for: "${sanitizeHTML(appt.purpose)}".`;
                    } else {
                        title = `Consultation request with ${partnerName} rejected`;
                        desc = appt.notes ? `Feedback provided: "${sanitizeHTML(appt.notes)}"` : `Request was declined.`;
                    }
                }

                timeline.innerHTML += `
                    <div class="timeline-item ${appt.status}">
                        <div class="timeline-icon">
                            <i class="fa-solid ${icon}"></i>
                        </div>
                        <div class="timeline-content text-start">
                            <div class="d-flex justify-content-between align-items-center mb-1">
                                <span class="fw-bold text-dark" style="font-size: 13px;">${title}</span>
                                <span class="timeline-time">${dateStr}</span>
                            </div>
                            <p class="mb-0 text-muted small" style="font-size: 12px; line-height: 1.4;">${desc}</p>
                        </div>
                    </div>
                `;
            });

        } catch (error) {
            console.error("Timeline error:", error);
            document.getElementById('profileTimeline').innerHTML = '<div class="text-center py-4 text-danger small"><i class="fa-solid fa-triangle-exclamation mb-1 fs-5 d-block"></i>Unable to load consultation history.</div>';
        }
    },

    getExpectedSchoolYear: function () {
        const manila = this.getManilaTime();
        const month = manila.month;
        const date = manila.day;
        const currentYear = manila.year;

        if (month > 4 || (month === 4 && date >= 15)) {
            return `${currentYear}-${currentYear + 1}`;
        } else {
            return `${currentYear - 1}-${currentYear}`;
        }
    },

    checkSchoolYearExpiration: async function () {
        if (!this.profile || this.profile.role !== 'student') return true;

        const expectedSchoolYear = this.getExpectedSchoolYear();
        
        // Check if the student's registered school_year does not match the upcoming school year
        if (this.profile.school_year !== expectedSchoolYear) {
            console.log(`School Year Expiration: Student registered in '${this.profile.school_year || 'None'}', expected '${expectedSchoolYear}'. Deactivating section and prompting update.`);
            
            // Set the section and school_year to empty in the database to officially deactivate/expire the active section
            try {
                const { error } = await supabaseClient
                    .from('profiles')
                    .update({ section: '', school_year: '' })
                    .eq('id', this.user.id);
                    
                if (error) {
                    console.error('Failed to deactivate old section in database:', error.message);
                } else {
                    this.profile.section = '';
                    this.profile.school_year = '';
                }
            } catch (e) {
                console.warn('Database error during section deactivation:', e);
            }

            // Show the non-dismissible school year update modal
            this.showSchoolYearUpdateModal(expectedSchoolYear);
            return false;
        }
        return true;
    },

    showSchoolYearUpdateModal: function (expectedSchoolYear) {
        // Remove any existing instance of the modal
        const existingModal = document.getElementById('schoolYearUpdateModal');
        if (existingModal) existingModal.remove();

        const modalHTML = `
            <div class="modal fade" id="schoolYearUpdateModal" data-bs-backdrop="static" data-bs-keyboard="false" tabindex="-1" aria-labelledby="schoolYearUpdateModalLabel" aria-hidden="true" style="font-family: 'Outfit', sans-serif;">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content shadow-lg border-0" style="border-radius: 24px; overflow: hidden; background: #ffffff;">
                        <div class="modal-header border-0 bg-primary-custom text-white py-4 px-4 position-relative">
                            <div class="position-absolute top-0 end-0 p-3 opacity-25">
                                <i class="fa-solid fa-clock" style="font-size: 6rem; transform: translate(30px, -20px); color: #ffffff;"></i>
                            </div>
                            <div class="z-index-1">
                                <h4 class="modal-title fw-bold" id="schoolYearUpdateModalLabel">
                                    <i class="fa-solid fa-calendar-check text-accent me-2"></i>School Year Update Required
                                </h4>
                                <p class="text-white-75 mb-0 small">Enrollment Transition & Account Update</p>
                            </div>
                        </div>
                        <div class="modal-body p-4 text-start">
                            <div class="alert alert-warning border-0 rounded-4 px-3 py-3 mb-4 d-flex align-items-start gap-2" style="background: rgba(245, 158, 11, 0.1); color: #b45309;">
                                <i class="fa-solid fa-triangle-exclamation mt-1 fs-5"></i>
                                <div>
                                    <strong style="font-size: 13px;">Section Deactivated:</strong>
                                    <p class="mb-0 small mt-1" style="line-height: 1.4; color: #78350f;">
                                        Every school year, students are required to update their registered School Year and Section to continue using ConsulTime. Your active section has been expired for the new school year.
                                    </p>
                                </div>
                            </div>
                            
                            <form id="schoolYearUpdateForm">
                                <div class="mb-3">
                                    <label class="form-label fw-bold text-dark small" style="letter-spacing: 0.03em;">UPCOMING SCHOOL YEAR</label>
                                    <div class="input-group">
                                        <span class="input-group-text bg-light text-muted border-0 rounded-start-3"><i class="fa-solid fa-calendar-days"></i></span>
                                        <input type="text" class="form-control bg-light border-0 rounded-end-3 fw-bold text-dark px-3 py-2.5" id="updateSchoolYearInput" value="${expectedSchoolYear}" readonly style="font-size: 14px;">
                                    </div>
                                    <div class="form-text text-muted mt-1" style="font-size: 11px;">Automatically calculated upcoming school year.</div>
                                </div>
                                
                                <div class="mb-4">
                                    <label for="updateSectionInput" class="form-label fw-bold text-dark small" style="letter-spacing: 0.03em;">NEW CLASS SECTION <span class="text-danger">*</span></label>
                                    <div class="input-group">
                                        <span class="input-group-text bg-light text-muted border-0 rounded-start-3"><i class="fa-solid fa-users"></i></span>
                                        <input type="text" class="form-control bg-light border-0 rounded-end-3 px-3 py-2.5" id="updateSectionInput" required placeholder="e.g. Grade 11 - STEM A" style="font-size: 14px;">
                                    </div>
                                    <div class="form-text text-muted mt-1" style="font-size: 11px;">Enter your new grade level and section.</div>
                                </div>
                                
                                <div id="updateModalAlert" class="alert alert-danger d-none rounded-3 py-2 px-3 small mb-3"></div>

                                <button type="submit" class="btn btn-primary w-100 py-3 rounded-pill fw-bold shadow-sm d-flex align-items-center justify-content-center gap-2" id="submitSchoolYearUpdate" style="font-size: 14px; transition: all 0.2s ease;">
                                    <i class="fa-solid fa-user-check"></i> Register for School Year
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        const modalEl = document.getElementById('schoolYearUpdateModal');
        const bsModal = new bootstrap.Modal(modalEl, {
            backdrop: 'static',
            keyboard: false
        });
        bsModal.show();

        const form = document.getElementById('schoolYearUpdateForm');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const submitBtn = document.getElementById('submitSchoolYearUpdate');
            const alertEl = document.getElementById('updateModalAlert');
            const sectionVal = document.getElementById('updateSectionInput').value.trim();
            
            if (!sectionVal) {
                alertEl.textContent = "Please enter your class section.";
                alertEl.classList.remove('d-none');
                return;
            }

            submitBtn.disabled = true;
            submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Saving details...`;
            alertEl.classList.add('d-none');

            try {
                const { error } = await supabaseClient
                    .from('profiles')
                    .update({
                        school_year: expectedSchoolYear,
                        section: sectionVal
                    })
                    .eq('id', this.user.id);

                if (error) throw error;

                // Update local profile state
                this.profile.school_year = expectedSchoolYear;
                this.profile.section = sectionVal;

                // Sync sidebar profile and profile views
                if (typeof this.populateProfileView === 'function') {
                    this.populateProfileView();
                }
                const profileSchoolYear = document.getElementById('profileSchoolYear');
                const profileSection = document.getElementById('profileSection');
                if (profileSchoolYear) profileSchoolYear.value = expectedSchoolYear;
                if (profileSection) profileSection.value = sectionVal;

                bsModal.hide();
                modalEl.remove();

                // Show dynamic success toast/notification
                const notifyEl = document.createElement("div");
                notifyEl.style.position = "fixed";
                notifyEl.style.bottom = "24px";
                notifyEl.style.right = "24px";
                notifyEl.style.background = "#22c55e";
                notifyEl.style.color = "#ffffff";
                notifyEl.style.padding = "16px 24px";
                notifyEl.style.borderRadius = "12px";
                notifyEl.style.boxShadow = "0 10px 15px -3px rgba(0, 0, 0, 0.1)";
                notifyEl.style.zIndex = "999999";
                notifyEl.innerHTML = `<i class="fa-solid fa-circle-check me-2"></i>Account successfully updated to School Year ${expectedSchoolYear}!`;
                document.body.appendChild(notifyEl);
                
                setTimeout(() => {
                    notifyEl.remove();
                    window.location.reload();
                }, 2000);

            } catch (error) {
                console.error("Error updating school year:", error);
                alertEl.textContent = "Failed to update profile: " + (error.message || error);
                alertEl.classList.remove('d-none');
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<i class="fa-solid fa-user-check"></i> Register for School Year`;
            }
        });
    },

    // --- STUDENT DASHBOARD LOGIC ---
    loadStudentDashboard: async function () {
        const hasValidSchoolYear = await this.checkSchoolYearExpiration();
        if (!hasValidSchoolYear) return;

        await this.autoExpireAppointments();
        this.fetchFacultyList();
        this.fetchStudentAppointments();
    },

    // Auto-cancel expired pending requests and mark no-shows for approved appointments
    autoExpireAppointments: async function () {
        try {
            // Use Philippines time (UTC+8)
            const manila = this.getManilaTime();
            const todayStr = manila.dateStr;
            const currentTime = manila.timeStr;

            // 1. Auto-cancel: pending appointments whose date has already passed entirely
            const { error: cancelErr } = await supabaseClient
                .from('appointments')
                .update({ status: 'cancelled', faculty_notes: 'Auto-cancelled: appointment date passed without a faculty response.' })
                .eq('status', 'pending')
                .lt('appointment_date', todayStr);

            if (cancelErr) console.warn('Auto-cancel pending error:', cancelErr.message);

            // 2. Auto-cancel: pending appointments on today whose time window has already closed
            const { error: cancelTodayErr } = await supabaseClient
                .from('appointments')
                .update({ status: 'cancelled', faculty_notes: 'Auto-cancelled: appointment time passed without a faculty response.' })
                .eq('status', 'pending')
                .eq('appointment_date', todayStr)
                .lt('end_time', currentTime);

            if (cancelTodayErr) console.warn('Auto-cancel today pending error:', cancelTodayErr.message);

            // 3. Auto no-show: approved appointments whose end_time + 15min grace period has passed
            // Calculate time minus 15 minutes (grace period)
            const graceManila = this.getManilaTime(new Date(Date.now() - 15 * 60 * 1000));
            const graceDateStr = graceManila.dateStr;
            const graceTimeStr = graceManila.timeStr;

            // Past days: any approved appointment from a previous date → no_show
            const { error: noShowPastErr } = await supabaseClient
                .from('appointments')
                .update({ status: 'no_show', faculty_notes: 'Marked as no-show: student did not attend the scheduled consultation.' })
                .eq('status', 'approved')
                .lt('appointment_date', graceDateStr);

            if (noShowPastErr) console.warn('Auto no-show past error:', noShowPastErr.message);

            // Today: approved appointments on today where end_time + 15min grace has passed
            const { error: noShowTodayErr } = await supabaseClient
                .from('appointments')
                .update({ status: 'no_show', faculty_notes: 'Marked as no-show: student did not attend the scheduled consultation.' })
                .eq('status', 'approved')
                .eq('appointment_date', graceDateStr)
                .lt('end_time', graceTimeStr);

            if (noShowTodayErr) console.warn('Auto no-show today error:', noShowTodayErr.message);

            console.log('Auto-expire check completed.');
        } catch (e) {
            console.warn('autoExpireAppointments error:', e);
        }
    },

    fetchFacultyList: async function () {
        const select = document.getElementById('facultySelect');
        const gridContainer = document.getElementById('facultyGridContainer');
        if (!select) return;

        const { data, error } = await supabaseClient
            .from('profiles')
            .select('id, full_name, department')
            .eq('role', 'faculty');

        if (error) {
            console.error(error);
            if (gridContainer) gridContainer.innerHTML = '<div class="text-danger small">Failed to load faculty list.</div>';
            return;
        }

        // 1. Populate the hidden/visible select element for compatibility
        select.innerHTML = '<option value="" disabled selected>Select a faculty...</option>';
        data.forEach(fac => {
            select.innerHTML += `<option value="${fac.id}">${sanitizeHTML(fac.full_name)}</option>`;
        });

        // 2. Group faculty by department
        const groupedFaculty = data.reduce((acc, fac) => {
            const dept = fac.department || 'General Department';
            if (!acc[dept]) acc[dept] = [];
            acc[dept].push(fac);
            return acc;
        }, {});

        // 3. Render dynamic department filter pills
        const filterContainer = document.getElementById('facultyDeptFilters');
        if (filterContainer) {
            if (data.length === 0) {
                filterContainer.innerHTML = '';
            } else {
                const depts = Object.keys(groupedFaculty).sort();
                let filterHtml = '';
                depts.forEach((dept, idx) => {
                    const activeClass = idx === 0 ? 'active' : '';
                    filterHtml += `<button type="button" class="btn btn-sm btn-outline-primary ${activeClass} rounded-pill px-3 dept-filter-btn text-truncate" data-dept="${dept}" style="max-width: 180px;"><i class="fa-solid fa-tag me-1"></i> ${sanitizeHTML(dept.replace(' Department', ''))}</button>`;
                });
                filterContainer.innerHTML = filterHtml;

                // Attach click event listeners to filter buttons
                filterContainer.querySelectorAll('.dept-filter-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        filterContainer.querySelectorAll('.dept-filter-btn').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');

                        const selectedDept = btn.getAttribute('data-dept');
                        const deptBlocks = gridContainer.querySelectorAll('.dept-block');
                        deptBlocks.forEach(block => {
                            if (block.getAttribute('data-dept') === selectedDept) {
                                block.style.display = 'block';
                            } else {
                                block.style.display = 'none';
                            }
                        });
                    });
                });
            }
        }

        // 4. Render grid of departments and cards
        if (gridContainer) {
            if (data.length === 0) {
                gridContainer.innerHTML = '<div class="text-muted small">No faculty members found.</div>';
                return;
            }

            let html = '';
            Object.keys(groupedFaculty).sort().forEach((dept, idx) => {
                const displayStyle = idx === 0 ? '' : 'display: none;';
                html += `
                    <div class="dept-block mb-4" data-dept="${dept}" style="${displayStyle}">
                        <h6 class="fw-bold mb-3">
                            <span class="badge bg-primary-soft text-primary px-3 py-2 rounded-3" style="font-size: 12px; font-weight: 600; letter-spacing: 0.5px;">
                                <i class="fa-solid fa-graduation-cap me-1"></i> ${sanitizeHTML(dept)}
                            </span>
                        </h6>
                        <div class="row g-2">
                `;
                
                groupedFaculty[dept].forEach(fac => {
                    const initials = fac.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
                    html += `
                            <div class="col-lg-3 col-md-4 col-sm-6 col-6">
                                <div class="card faculty-card border p-2 shadow-sm" data-id="${fac.id}" style="cursor: pointer; border-radius: 12px; transition: all 0.2s ease; max-width: 220px; width: fit-content; min-width: 150px;">
                                    <div class="d-flex align-items-center gap-2">
                                        <div class="bg-primary text-white rounded-circle d-flex align-items-center justify-content-center fw-bold shadow-sm" style="width: 38px; height: 38px; font-size: 14px; flex-shrink: 0;">
                                            ${initials}
                                        </div>
                                        <div class="overflow-hidden" style="line-height: 1.15;">
                                            <h6 class="fw-bold mb-0 text-dark text-truncate" style="font-size: 13.5px; letter-spacing: -0.1px;">${sanitizeHTML(fac.full_name)}</h6>
                                            <small class="text-muted text-truncate d-block" style="font-size: 11px;">${sanitizeHTML(dept.replace(' Department', ''))}</small>
                                        </div>
                                    </div>
                                </div>
                            </div>
                    `;
                });

                html += `
                        </div>
                    </div>
                `;
            });

            gridContainer.innerHTML = html;

            // 5. Attach click event listeners to the cards
            gridContainer.querySelectorAll('.faculty-card').forEach(card => {
                card.addEventListener('click', () => {
                    // Toggle active classes in grid
                    gridContainer.querySelectorAll('.faculty-card').forEach(c => c.classList.remove('active'));
                    card.classList.add('active');

                    // Set select value and trigger change
                    select.value = card.getAttribute('data-id');
                    this.handleFacultySelectChange();
                });
            });
        }
    },

    handleFacultySelectChange: async function() {
        const facId = document.getElementById('facultySelect').value;
        const dateInput = document.getElementById('appointmentDate');
        const container = document.getElementById('availabilityContainer');
        const slotsDiv = document.getElementById('timeSlotsContainer');
        const summaryDiv = document.getElementById('facultyAvailabilitySummary');

        if (summaryDiv) {
            summaryDiv.style.display = 'none';
            summaryDiv.innerHTML = '';
        }

        if (!facId) return;

        // Reset fields
        dateInput.value = '';
        dateInput.disabled = true;
        dateInput.placeholder = 'Loading calendar...';
        container.style.display = 'none';
        slotsDiv.innerHTML = '';
        document.getElementById('selectedStartTime').value = '';
        document.getElementById('selectedEndTime').value = '';

        // Fetch faculty's available days (both day of week and specific dates)
        const { data: availability, error } = await supabaseClient
            .from('faculty_availability')
            .select('day_of_week, specific_date, start_time, end_time')
            .eq('faculty_id', facId);

        if (error || !availability || availability.length === 0) {
            dateInput.placeholder = 'No availability set by faculty';
            return;
        }

        const availableDays = [...new Set(availability.filter(a => a.day_of_week !== null && a.day_of_week !== undefined).map(a => a.day_of_week))];
        const availableDates = [...new Set(availability.filter(a => a.specific_date !== null).map(a => a.specific_date))];

        if (availableDays.length === 0 && availableDates.length === 0) {
            dateInput.placeholder = 'No availability set by faculty';
            return;
        }

        // Helper to format time to 12h AM/PM
        function formatTime12h(timeStr) {
            if (!timeStr) return '';
            const parts = timeStr.split(':');
            let hours = parseInt(parts[0], 10);
            const minutes = parts[1] || '00';
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12;
            hours = hours ? hours : 12;
            return `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
        }

        const daysOfWeekNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

        // Group weekly days and specific dates
        const weeklyGroups = {};
        const dateGroups = {};

        availability.forEach(item => {
            const timeRange = `${formatTime12h(item.start_time)} - ${formatTime12h(item.end_time)}`;
            if (item.day_of_week !== null && item.day_of_week !== undefined) {
                const dayName = daysOfWeekNames[item.day_of_week];
                if (!weeklyGroups[dayName]) weeklyGroups[dayName] = [];
                weeklyGroups[dayName].push(timeRange);
            } else if (item.specific_date) {
                let formattedDate = item.specific_date;
                try {
                    const dateParts = item.specific_date.split('-');
                    const dObj = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
                    formattedDate = dObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                } catch (e) {
                    console.error(e);
                }
                if (!dateGroups[formattedDate]) dateGroups[formattedDate] = [];
                dateGroups[formattedDate].push(timeRange);
            }
        });

        // Sort time ranges inside groups for cleaner display
        const sortTimes = (a, b) => {
            const getVal = (str) => {
                const time = str.split(' - ')[0];
                const parts = time.split(' ');
                let [h, m] = parts[0].split(':').map(Number);
                if (parts[1] === 'PM' && h !== 12) h += 12;
                if (parts[1] === 'AM' && h === 12) h = 0;
                return h * 60 + m;
            };
            return getVal(a) - getVal(b);
        };

        Object.keys(weeklyGroups).forEach(k => weeklyGroups[k].sort(sortTimes));
        Object.keys(dateGroups).forEach(k => dateGroups[k].sort(sortTimes));

        // Build HTML for summary
        if (summaryDiv) {
            let summaryHTML = `
                <div class="mt-3 p-3 rounded-3 shadow-sm border-start border-4 border-primary bg-primary-soft">
                    <div class="fw-bold mb-2 text-primary" style="font-size: 0.9rem;">
                        <i class="fa-regular fa-clock me-1"></i> Faculty Availability Schedule:
                    </div>
            `;

            let hasWeekly = false;
            let weeklyHTML = '<ul class="list-unstyled mb-0 ps-0" style="font-size: 0.85rem;">';
            const sortedDays = Object.keys(weeklyGroups).sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));
            
            sortedDays.forEach(day => {
                hasWeekly = true;
                weeklyHTML += `
                    <li class="d-flex align-items-center mb-1">
                        <span class="badge bg-primary text-white me-2 px-2 py-1" style="min-width: 90px; text-align: center; font-size: 0.75rem;">${day}</span>
                        <span class="text-dark">${weeklyGroups[day].join(', ')}</span>
                    </li>
                `;
            });
            weeklyHTML += '</ul>';

            let hasSpecific = false;
            let specificHTML = '<ul class="list-unstyled mb-0 ps-0" style="font-size: 0.85rem;">';
            const sortedDates = Object.keys(dateGroups).sort((a, b) => new Date(a) - new Date(b));

            sortedDates.forEach(date => {
                hasSpecific = true;
                specificHTML += `
                    <li class="d-flex align-items-center mb-1">
                        <span class="badge bg-success text-white me-2 px-2 py-1" style="min-width: 90px; text-align: center; font-size: 0.75rem;">${date}</span>
                        <span class="text-dark">${dateGroups[date].join(', ')}</span>
                    </li>
                `;
            });
            specificHTML += '</ul>';

            if (hasWeekly) {
                summaryHTML += weeklyHTML;
            }
            if (hasSpecific) {
                if (hasWeekly) {
                    summaryHTML += `<div class="border-top my-2 pt-2 fw-bold text-primary" style="font-size: 0.85rem;"><i class="fa-regular fa-calendar-check me-1"></i> Specific Available Dates:</div>`;
                } else {
                    summaryHTML += `<div class="fw-bold mb-2 text-primary" style="font-size: 0.85rem;"><i class="fa-regular fa-calendar-check me-1"></i> Specific Available Dates:</div>`;
                }
                summaryHTML += specificHTML;
            }

            summaryHTML += `
                </div>
            `;

            summaryDiv.innerHTML = summaryHTML;
            summaryDiv.style.display = 'block';
        }

        dateInput.disabled = false;
        dateInput.placeholder = 'Select a date...';

        // Destroy previous flatpickr instance if exists
        if (dateInput._flatpickr) {
            dateInput._flatpickr.destroy();
        }

        // Compute maxDate: 5 calendar days from today (Manila time)
        // This prevents students from booking on next week's recurring days
        // (e.g., today is Friday May 22, so max = May 27 — next Friday May 29 is excluded)
        const manilaToday = this.getManilaTime();
        const maxDateObj = new Date();
        maxDateObj.setDate(maxDateObj.getDate() + 5);

        // Initialize Flatpickr to enable days matching day of week OR specific dates, max 5 days ahead
        flatpickr(dateInput, {
            minDate: "today",
            maxDate: maxDateObj,
            enable: [
                function(date) {
                    // Check if day of week matches
                    const dayMatch = availableDays.includes(date.getDay());
                    
                    // Check if specific date matches (formatted as YYYY-MM-DD in local time)
                    const y = date.getFullYear();
                    const m = String(date.getMonth() + 1).padStart(2, '0');
                    const d = String(date.getDate()).padStart(2, '0');
                    const dateStr = `${y}-${m}-${d}`;
                    const dateMatch = availableDates.includes(dateStr);
                    
                    return dayMatch || dateMatch;
                }
            ],
            onChange: (selectedDates, dateStr, instance) => {
                this.checkAvailability();
            }
        });
    },

    checkAvailability: async function () {
        const facId = document.getElementById('facultySelect').value;
        const dateVal = document.getElementById('appointmentDate').value;
        const container = document.getElementById('availabilityContainer');
        const slotsDiv = document.getElementById('timeSlotsContainer');

        if (!facId || !dateVal) return;

        container.style.display = 'block';
        slotsDiv.innerHTML = '<div class="col-12 text-center text-muted"><i class="fa-solid fa-spinner fa-spin"></i> Loading availability...</div>';

        // Parse dateVal string manually to avoid timezone shift
        const parts = dateVal.split('-');
        const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
        const dayOfWeekVal = dateObj.getDay();

        // Fetch Faculty Availability for this DAY OF WEEK or SPECIFIC DATE
        const { data: availability, error } = await supabaseClient
            .from('faculty_availability')
            .select('*')
            .eq('faculty_id', facId)
            .or(`day_of_week.eq.${dayOfWeekVal},specific_date.eq.${dateVal}`);

        // Fetch existing approved/pending appointments for that day
        const { data: existingAppts } = await supabaseClient
            .from('appointments')
            .select('start_time, end_time, status')
            .eq('faculty_id', facId)
            .eq('appointment_date', dateVal)
            .in('status', ['pending', 'approved']);

        if (error || !availability || availability.length === 0) {
            slotsDiv.innerHTML = '<div class="col-12"><div class="alert alert-warning mb-0">Faculty is not available on this day.</div></div>';
            return;
        }

        slotsDiv.innerHTML = '';

        // Generate 30-min slots based on availability
        const manila = this.getManilaTime();
        const todayStr = manila.dateStr;

        const isToday = (dateVal === todayStr);
        const currentH = manila.hour;
        const currentM = manila.minute;

        availability.forEach(avail => {
            let start = new Date(`1970-01-01T${avail.start_time}`);
            const end = new Date(`1970-01-01T${avail.end_time}`);

            while (start < end) {
                let slotStart = start.toTimeString().substring(0, 5);
                start.setMinutes(start.getMinutes() + 30);
                let slotEnd = start.toTimeString().substring(0, 5);

                // Implement 30-minute advance booking rule.
                // A slot is hidden if it starts less than 30 minutes from the current time.
                if (isToday) {
                    const [slotH, slotM] = slotStart.split(':').map(Number);
                    const slotStartTotalMinutes = slotH * 60 + slotM;
                    const currentTotalMinutes = currentH * 60 + currentM;
                    
                    // If the slot starts less than 30 minutes from now, hide it
                    if (slotStartTotalMinutes < currentTotalMinutes + 30) {
                        continue;
                    }
                }

                // Check if slot is taken
                let isTaken = false;
                if (existingAppts) {
                    isTaken = existingAppts.some(appt => {
                        if (!appt.start_time) return false;
                        const [apptH, apptM] = appt.start_time.split(':').map(Number);
                        const [slotH, slotM] = slotStart.split(':').map(Number);
                        return apptH === slotH && apptM === slotM;
                    });
                }

                if (!isTaken && start <= end) {
                    const formatTime = (time) => new Date(`1970-01-01T${time}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                    slotsDiv.innerHTML += `
                        <div class="col-md-4 col-6">
                            <div class="time-slot" onclick="App.selectTimeSlot('${slotStart}', '${slotEnd}', this)">
                                ${formatTime(slotStart)} - ${formatTime(slotEnd)}
                            </div>
                        </div>
                    `;
                }
            }
        });

        if (slotsDiv.innerHTML === '') {
            if (isToday) {
                slotsDiv.innerHTML = '<div class="col-12"><div class="alert alert-warning mb-0"><i class="fa-solid fa-circle-exclamation me-2"></i>No more available consultation hours left for today. Please select another date from the calendar.</div></div>';
            } else {
                slotsDiv.innerHTML = '<div class="col-12"><div class="alert alert-info mb-0">All slots are booked or unavailable for this day.</div></div>';
            }
        }
    },

    selectTimeSlot: function (start, end, element) {
        document.querySelectorAll('.time-slot').forEach(el => el.classList.remove('selected'));
        element.classList.add('selected');
        document.getElementById('selectedStartTime').value = start;
        document.getElementById('selectedEndTime').value = end;
    },

    handleBooking: async function (e) {
        e.preventDefault();
        const facId = document.getElementById('facultySelect').value;
        const apptDate = document.getElementById('appointmentDate').value;
        const startTime = document.getElementById('selectedStartTime').value;
        const endTime = document.getElementById('selectedEndTime').value;
        const purpose = document.getElementById('purpose').value;
        const btn = document.getElementById('submitBookBtn');

        if (!startTime || !endTime) {
            alert("Please select an available time slot.");
            return;
        }

        btn.innerHTML = 'Booking...';
        btn.disabled = true;

        // Check if the slot is already taken right before booking to prevent double bookings
        const { data: duplicateCheck, error: checkError } = await supabaseClient
            .from('appointments')
            .select('id')
            .eq('faculty_id', facId)
            .eq('appointment_date', apptDate)
            .eq('start_time', startTime + ':00')
            .in('status', ['pending', 'approved']);

        if (checkError) {
            alert("Error checking availability: " + checkError.message);
            btn.innerHTML = 'Submit Request';
            btn.disabled = false;
            return;
        }

        if (duplicateCheck && duplicateCheck.length > 0) {
            alert("This time slot has already been requested or approved by another student. Please select another slot.");
            btn.innerHTML = 'Submit Request';
            btn.disabled = false;
            this.checkAvailability();
            return;
        }

        const { error } = await supabaseClient.from('appointments').insert([
            {
                student_id: this.user.id,
                faculty_id: facId,
                appointment_date: apptDate,
                start_time: startTime + ':00',
                end_time: endTime + ':00',
                purpose: purpose,
                status: 'pending'
            }
        ]);

        btn.innerHTML = 'Submit Request';
        btn.disabled = false;

        if (error) {
            alert("Failed to book: " + error.message);
        } else {
            alert("Appointment request submitted successfully!");
            document.getElementById('bookForm').reset();
            const summaryDiv = document.getElementById('facultyAvailabilitySummary');
            if (summaryDiv) {
                summaryDiv.style.display = 'none';
                summaryDiv.innerHTML = '';
            }
            document.getElementById('availabilityContainer').style.display = 'none';
            this.switchView('dashboard');
            this.fetchStudentAppointments();
        }
    },

    fetchStudentAppointments: async function () {
        const { data, error } = await supabaseClient
            .from('appointments')
            .select('*, profiles!appointments_faculty_id_fkey(full_name)')
            .eq('student_id', this.user.id)
            .order('appointment_date', { ascending: false })
            .order('start_time', { ascending: false });

        if (error) return;
        
        await this._processAutoRejects(data);

        let upcoming = 0;
        let pending = 0;
        let completed = 0;

        const tbody = document.getElementById('upcomingTableBody');
        tbody.innerHTML = '';

        data.forEach(appt => {
            if (appt.status === 'approved') upcoming++;
            if (appt.status === 'pending') pending++;
            if (appt.status === 'completed') completed++;

            const badgeClass = `status-${appt.status}`;
            const dateObj = new Date(appt.appointment_date);
            const dateStr = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

            const formatTime = (time) => new Date(`1970-01-01T${time}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            // Label for no_show
            const statusLabel = appt.status === 'no_show' ? 'NO SHOW' : appt.status.toUpperCase();

            // Sanction warning row (only shown if faculty wrote a sanction note)
            const sanctionRow = (appt.status === 'no_show' && appt.sanction_note)
                ? `<tr><td colspan="5" class="px-4 pb-2 pt-0">
                    <div class="d-flex align-items-start gap-2 p-2 rounded-3" style="background:#fff7ed;border:1px solid #fed7aa;">
                        <i class="fa-solid fa-triangle-exclamation text-warning mt-1" style="font-size:13px;"></i>
                        <div>
                            <span class="fw-bold" style="font-size:12px;color:#c2410c;">Sanction from Faculty:</span>
                            <span class="text-dark" style="font-size:12px;"> ${sanitizeHTML(appt.sanction_note)}</span>
                        </div>
                    </div>
                  </td></tr>`
                : (appt.status === 'no_show'
                    ? `<tr><td colspan="5" class="px-4 pb-2 pt-0">
                        <div class="d-flex align-items-center gap-2 p-2 rounded-3" style="background:#fff7ed;border:1px solid #fed7aa;">
                            <i class="fa-solid fa-triangle-exclamation text-warning" style="font-size:13px;"></i>
                            <span style="font-size:12px;color:#c2410c;">You did not attend this consultation. Please contact your faculty for further instructions.</span>
                        </div>
                      </td></tr>`
                    : '');

            tbody.innerHTML += `
                <tr>
                    <td class="px-4">
                        <div class="d-flex align-items-center">
                            <div class="bg-primary-soft text-primary rounded-circle d-flex align-items-center justify-content-center me-3" style="width: 36px; height: 36px;">
                                <i class="fa-solid fa-user-tie"></i>
                            </div>
                            <span class="fw-medium">${sanitizeHTML(appt.profiles.full_name)}</span>
                        </div>
                    </td>
                    <td>
                        <div class="fw-medium">${dateStr}</div>
                        <small class="text-muted">${formatTime(appt.start_time)} - ${formatTime(appt.end_time)}</small>
                    </td>
                    <td class="text-wrap" style="max-width: 200px;">${sanitizeHTML(appt.purpose)}</td>
                    <td><span class="badge status-badge ${badgeClass} text-uppercase">${statusLabel}</span></td>
                    <td class="text-end px-4">
                        ${appt.status === 'pending' ? `<button class="btn btn-sm btn-outline-danger rounded-pill px-3" onclick="App.cancelAppointment('${appt.id}')">Cancel</button>` : ''}
                        ${appt.status === 'approved' ? `<a href="https://meet.jit.si/ConsulTime_${appt.id}" target="_blank" class="btn btn-sm btn-primary rounded-pill px-3 shadow-sm"><i class="fa-solid fa-video me-1"></i> Join Call</a>` : ''}
                    </td>
                </tr>
                ${sanctionRow}
            `;
        });

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">No appointments found.</td></tr>';
        }

        document.getElementById('stat-upcoming').textContent = upcoming;
        document.getElementById('stat-pending').textContent = pending;
        document.getElementById('stat-completed').textContent = completed;

        const notifList = document.getElementById('notificationList');
        const notifBadge = document.getElementById('notifBadge');
        if (notifList && notifBadge) {
            const recentUpdates = data.filter(a => a.status !== 'pending');
            if (recentUpdates.length > 0) {
                if (sessionStorage.getItem('notifsViewed') !== 'true') {
                    notifBadge.style.display = 'block';
                    notifBadge.textContent = recentUpdates.length;
                }
                let html = '<li><h6 class="dropdown-header fw-bold">Recent Notifications</h6></li><li><hr class="dropdown-divider"></li>';
                recentUpdates.slice(0, 5).forEach(a => {
                    html += `<li><a class="dropdown-item py-2 border-bottom" href="#" onclick="document.getElementById('nav-dashboard').click()">
                        <div class="fw-bold small text-dark text-capitalize">Appointment ${sanitizeHTML(a.status)}</div>
                        <div class="text-muted" style="font-size: 12px;">With ${sanitizeHTML(a.profiles.full_name)}</div>
                    </a></li>`;
                });
                notifList.innerHTML = html;
            } else {
                notifBadge.style.display = 'none';
                notifList.innerHTML = '<li><h6 class="dropdown-header fw-bold">Notifications</h6></li><li><hr class="dropdown-divider"></li><li><span class="dropdown-item text-center text-muted small">No new notifications</span></li>';
            }
        }
    },

    cancelAppointment: async function (id) {
        if (confirm("Cancel this appointment request?")) {
            const { error } = await supabaseClient.from('appointments').update({ status: 'cancelled' }).eq('id', id);
            if (error) {
                alert("Failed to cancel appointment: " + error.message);
            } else {
                this.fetchStudentAppointments();
            }
        }
    },

    // --- FACULTY DASHBOARD LOGIC ---
    loadFacultyDashboard: async function () {
        await this.autoExpireAppointments();
        this.fetchFacultyRequests();
        this.fetchFacultyAvailability();
    },

    fetchFacultyRequests: async function () {
        const { data, error } = await supabaseClient
            .from('appointments')
            .select('*, profiles!appointments_student_id_fkey(full_name, department, school_year, section)')
            .eq('faculty_id', this.user.id)
            .order('appointment_date', { ascending: true });

        if (error) return;
        
        await this._processAutoRejects(data);
        
        this.facultyRequests = data; // Cache the data globally for printing/exporting

        let pending = 0;
        let today = 0;
        let total = data.length;

        const tbody = document.getElementById('requestsTableBody');
        tbody.innerHTML = '';

        const todayStr = new Date().toISOString().split('T')[0];

        data.forEach(appt => {
            if (appt.status === 'pending') pending++;
            if (appt.appointment_date === todayStr && appt.status === 'approved') today++;

            const badgeClass = `status-${appt.status}`;
            const dateObj = new Date(appt.appointment_date);
            const dateStr = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

            const formatTime = (time) => new Date(`1970-01-01T${time}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            let actions = '';
            if (appt.status === 'pending') {
                actions = `
                    <button class="btn btn-sm btn-success rounded-pill px-3 me-1 shadow-sm" onclick="App.openActionModal('${appt.id}', 'approved')"><i class="fa-solid fa-check"></i></button>
                    <button class="btn btn-sm btn-danger rounded-pill px-3 shadow-sm" onclick="App.openActionModal('${appt.id}', 'rejected')"><i class="fa-solid fa-xmark"></i></button>
                `;
            } else if (appt.status === 'approved') {
                actions = `
                    <button class="btn btn-sm btn-outline-primary rounded-pill px-3" onclick="App.openActionModal('${appt.id}', 'completed', \`${sanitizeHTML(appt.purpose)}\`)">Mark Done</button>
                    <a href="https://meet.jit.si/ConsulTime_${appt.id}" target="_blank" class="btn btn-sm btn-primary rounded-pill px-3 shadow-sm ms-1"><i class="fa-solid fa-video"></i></a>
                `;
            } else if (appt.status === 'no_show') {
                actions = `
                    <button class="btn btn-sm btn-warning rounded-pill px-3 shadow-sm" style="font-size:12px;" onclick="App.openActionModal('${appt.id}', 'no_show_sanction')">
                        <i class="fa-solid fa-triangle-exclamation me-1"></i>Add Sanction
                    </button>
                `;
            } else if (appt.status === 'completed') {
                actions = `
                    <button class="btn btn-sm btn-outline-primary rounded-pill px-3" style="font-size:12px;" onclick="App.openActionModal('${appt.id}', 'edit_completed', \`${sanitizeHTML(appt.purpose)}\`)">
                        <i class="fa-solid fa-pen me-1"></i>Edit Record
                    </button>
                `;
            }

            // Show existing sanction note if present
            const sanctionRow = appt.sanction_note
                ? `<tr><td colspan="5" class="px-4 pb-2 pt-0">
                    <div class="d-flex align-items-start gap-2 p-2 rounded-3" style="background:#fff7ed;border:1px solid #fed7aa;">
                        <i class="fa-solid fa-triangle-exclamation text-warning mt-1" style="font-size:13px;"></i>
                        <div>
                            <span class="fw-bold text-warning-emphasis" style="font-size:12px;">Sanction Note:</span>
                            <span class="text-dark" style="font-size:12px;"> ${sanitizeHTML(appt.sanction_note)}</span>
                        </div>
                    </div>
                  </td></tr>`
                : '';

            // Display label for no_show
            const statusLabel = appt.status === 'no_show' ? 'NO SHOW' : appt.status.toUpperCase();

            tbody.innerHTML += `
                <tr>
                    <td class="px-4">
                        <div class="d-flex align-items-center">
                            <div class="bg-accent-soft text-accent rounded-circle d-flex align-items-center justify-content-center me-3" style="width: 36px; height: 36px;">
                                ${sanitizeHTML(appt.profiles.full_name.charAt(0))}
                            </div>
                            <div>
                                <div class="fw-medium text-dark">${sanitizeHTML(appt.profiles.full_name)}</div>
                                <div class="small text-muted" style="font-size: 11px;">
                                    ${sanitizeHTML(appt.profiles.department || 'Student')}
                                    ${appt.profiles.school_year || appt.profiles.section ? ` | S.Y. ${sanitizeHTML(appt.profiles.school_year || '—')} - ${sanitizeHTML(appt.profiles.section || '—')}` : ''}
                                </div>
                            </div>
                        </div>
                    </td>
                    <td>
                        <div class="fw-medium">${dateStr}</div>
                        <small class="text-muted">${formatTime(appt.start_time)} - ${formatTime(appt.end_time)}</small>
                    </td>
                    <td class="text-wrap text-muted small" style="max-width: 200px;">${sanitizeHTML(appt.purpose)}</td>
                    <td><span class="badge status-badge ${badgeClass} text-uppercase">${statusLabel}</span></td>
                    <td class="text-end px-4">
                        ${actions}
                    </td>
                </tr>
                ${sanctionRow}
            `;
        });

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-5 text-muted">No consultation requests yet.</td></tr>';
        }

        document.getElementById('stat-pending').textContent = pending;
        document.getElementById('stat-today').textContent = today;
        document.getElementById('stat-total').textContent = total;

        if (typeof this.renderCharts === 'function') {
            this.renderCharts(data);
        }

        const notifList = document.getElementById('notificationList');
        const notifBadge = document.getElementById('notifBadge');
        if (notifList && notifBadge) {
            const pendingAppts = data.filter(a => a.status === 'pending');
            if (pendingAppts.length > 0) {
                if (sessionStorage.getItem('notifsViewed') !== 'true') {
                    notifBadge.style.display = 'block';
                    notifBadge.textContent = pendingAppts.length;
                }
                let html = '<li><h6 class="dropdown-header fw-bold">Recent Notifications</h6></li><li><hr class="dropdown-divider"></li>';
                pendingAppts.slice(0, 5).forEach(a => {
                    html += `<li><a class="dropdown-item py-2 border-bottom" href="#" onclick="document.getElementById('nav-dashboard').click()">
                        <div class="fw-bold small text-dark">${sanitizeHTML(a.profiles.full_name)}</div>
                        <div class="text-muted" style="font-size: 12px;">Requested a consultation</div>
                    </a></li>`;
                });
                notifList.innerHTML = html;
            } else {
                notifBadge.style.display = 'none';
                notifList.innerHTML = '<li><h6 class="dropdown-header fw-bold">Notifications</h6></li><li><hr class="dropdown-divider"></li><li><span class="dropdown-item text-center text-muted small">No new notifications</span></li>';
            }
        }
    },

    getCurrentWeekRange: function() {
        const today = new Date();
        const mondayOffset = (today.getDay() + 6) % 7; // Monday = 0, Sunday = 6
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - mondayOffset);
        weekStart.setHours(0, 0, 0, 0);

        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);

        return { weekStart, weekEnd };
    },

    formatDateString: function(date) {
        return date.toISOString().split('T')[0];
    },

    loadFacultyWeeklyReport: async function() {
        if (!this.user || !this.profile || this.profile.role !== 'faculty') return;

        const { weekStart, weekEnd } = this.getCurrentWeekRange();
        const weekStartStr = this.formatDateString(weekStart);
        const weekEndStr = this.formatDateString(weekEnd);

        const weekReportStatus = document.getElementById('weeklyReportStatus');
        if (weekReportStatus) {
            weekReportStatus.classList.add('d-none');
            weekReportStatus.textContent = '';
        }

        document.getElementById('weekReportPeriod').textContent = `${weekStartStr} — ${weekEndStr}`;

        const { data, error } = await supabaseClient
            .from('appointments')
            .select('*, profiles!appointments_student_id_fkey(full_name, department)')
            .eq('faculty_id', this.user.id)
            .gte('appointment_date', weekStartStr)
            .lte('appointment_date', weekEndStr)
            .order('appointment_date', { ascending: true })
            .order('start_time', { ascending: true });

        if (error) {
            console.error('Error loading weekly appointments:', error);
            const tbody = document.getElementById('weeklyReportTableBody');
            if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-danger">Unable to load weekly appointments.</td></tr>';
            return;
        }

        const pending = data.filter(a => a.status === 'pending').length;
        const approved = data.filter(a => a.status === 'approved').length;
        const completed = data.filter(a => a.status === 'completed').length;
        const total = data.length;

        const departmentCounts = {};
        const dayCounts = { Sunday: 0, Monday: 0, Tuesday: 0, Wednesday: 0, Thursday: 0, Friday: 0, Saturday: 0 };
        let totalMinutes = 0;

        data.forEach(appt => {
            const dept = appt.profiles?.department || 'Unknown';
            departmentCounts[dept] = (departmentCounts[dept] || 0) + 1;

            const dayName = new Date(appt.appointment_date).toLocaleDateString('en-US', { weekday: 'long' });
            if (dayCounts[dayName] !== undefined) dayCounts[dayName] += 1;

            const start = new Date(`1970-01-01T${appt.start_time}`);
            const end = new Date(`1970-01-01T${appt.end_time}`);
            const duration = (end - start) / 60000;
            if (duration > 0) totalMinutes += duration;
        });

        const busiestDay = Object.keys(dayCounts).reduce((best, day) => dayCounts[day] > (dayCounts[best] || 0) ? day : best, 'Sunday');
        const avgDuration = total > 0 ? Math.round(totalMinutes / total) : 0;
        const topDept = Object.entries(departmentCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'None';

        document.getElementById('weekReportTotal').textContent = total;
        document.getElementById('weekReportPending').textContent = pending;
        document.getElementById('weekReportApproved').textContent = approved;
        document.getElementById('weekReportCompleted').textContent = completed;
        document.getElementById('weekReportBusiestDay').textContent = total > 0 ? busiestDay : 'No bookings';
        document.getElementById('weekReportAverageDuration').textContent = `${avgDuration} min`;
        document.getElementById('weekReportTopDept').textContent = topDept;

        // Cache weekly appointments in memory for searching and filtering
        this.weeklyAppointments = data || [];
        this.filterWeeklyAppointmentsTable();
        this.renderWeeklyReportCharts(data);

        await this.loadSavedWeeklyReports();
        await this.loadFacultyPeerBenchmarks(weekStartStr, weekEndStr);
    },

    filterWeeklyAppointmentsTable: function() {
        const query = (document.getElementById('weeklyReportSearch')?.value || '').toLowerCase().trim();
        const tbody = document.getElementById('weeklyReportTableBody');
        if (!tbody) return;

        const filtered = (this.weeklyAppointments || []).filter(appt => {
            const studentName = (appt.profiles?.full_name || '').toLowerCase();
            const studentDept = (appt.profiles?.department || '').toLowerCase();
            const purpose = (appt.purpose || '').toLowerCase();
            const status = (appt.status || '').toLowerCase();
            const notes = (appt.faculty_notes || '').toLowerCase();
            
            return studentName.includes(query) || 
                   studentDept.includes(query) || 
                   purpose.includes(query) || 
                   status.includes(query) || 
                   notes.includes(query);
        });

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-muted">No matching appointments found.</td></tr>`;
        } else {
            tbody.innerHTML = '';
            filtered.forEach(appt => {
                const dateObj = new Date(appt.appointment_date);
                const dateStr = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
                const formatTime = time => new Date(`1970-01-01T${time}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const timeRange = `${formatTime(appt.start_time)} - ${formatTime(appt.end_time)}`;
                
                const statusLabel = appt.status === 'no_show' ? 'NO SHOW' : appt.status.toUpperCase();
                const statusClass = appt.status === 'approved' ? 'badge bg-success' : appt.status === 'completed' ? 'badge bg-primary' : appt.status === 'pending' ? 'badge bg-warning text-dark' : 'badge bg-secondary';
                
                tbody.innerHTML += `
                    <tr>
                        <td>
                            <div class="fw-semibold text-dark">${dateStr}</div>
                            <small class="text-muted">${timeRange}</small>
                        </td>
                        <td>
                            <div class="fw-semibold text-dark">${sanitizeHTML(appt.profiles.full_name)}</div>
                            <small class="text-muted">${sanitizeHTML(appt.profiles.department || 'Student')}</small>
                        </td>
                        <td class="text-wrap" style="max-width: 250px;">
                            <div class="small text-dark">${sanitizeHTML(appt.purpose || '—')}</div>
                        </td>
                        <td>
                            <span class="${statusClass}">${statusLabel}</span>
                        </td>
                        <td class="text-wrap" style="max-width: 250px;">
                            <div class="small text-muted mb-2">${sanitizeHTML(appt.faculty_notes || '—')}</div>
                            ${['completed', 'approved'].includes(appt.status) ? `<button class="btn btn-sm btn-outline-primary" style="font-size: 11px; padding: 2px 8px;" onclick="App.openActionModal('${appt.id}', 'edit_completed', \`${sanitizeHTML(appt.purpose)}\`)"><i class="fa-solid fa-pen"></i> Edit Record</button>` : ''}
                        </td>
                    </tr>
                `;
            });
        }
    },

    loadSavedWeeklyReports: async function() {
        const reportsBlock = document.getElementById('savedWeeklyReportsList');
        if (!reportsBlock) return;

        const { data, error } = await supabaseClient
            .from('faculty_reports')
            .select('*')
            .eq('faculty_id', this.user.id)
            .order('generated_at', { ascending: false })
            .limit(10);

        if (error) {
            reportsBlock.innerHTML = '<div class="text-muted small">No saved weekly report history found. If this is a new setup, create the <code>faculty_reports</code> table in Supabase.</div>';
            return;
        }

        if (!data || data.length === 0) {
            reportsBlock.innerHTML = '<div class="text-muted small">No saved weekly reports yet. Click Save Weekly Report to store the current week.</div>';
            return;
        }

        reportsBlock.innerHTML = data.map(report => {
            const generatedAt = new Date(report.generated_at).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            return `
                <div class="border-bottom py-3">
                    <div class="d-flex justify-content-between align-items-start gap-3">
                        <div>
                            <div class="fw-semibold text-dark">${sanitizeHTML(report.week_start)} — ${sanitizeHTML(report.week_end)}</div>
                            <div class="small text-muted">Saved on ${generatedAt}</div>
                        </div>
                        <span class="badge bg-primary rounded-pill">${sanitizeHTML(report.total_requests || 0)} items</span>
                    </div>
                    <div class="mt-2 small text-muted">
                        Pending: ${sanitizeHTML(report.pending_requests || 0)} · Approved: ${sanitizeHTML(report.approved_requests || 0)} · Completed: ${sanitizeHTML(report.completed_requests || 0)}
                    </div>
                </div>
            `;
        }).join('');
    },

    loadFacultyPeerBenchmarks: async function(weekStartStr, weekEndStr) {
        const peerContainer = document.getElementById('peerBenchmarksContainer');
        const deptBadge = document.getElementById('peerReportDeptName');
        if (!peerContainer) return;

        const dept = this.profile?.department || '';
        if (deptBadge) {
            deptBadge.textContent = dept || 'General / No Department';
        }

        // 1. Fetch all faculty members in the same department
        let query = supabaseClient
            .from('profiles')
            .select('id, full_name, department, avatar')
            .eq('role', 'faculty');
        
        if (dept) {
            query = query.eq('department', dept);
        }

        const { data: peers, error: peersError } = await query;

        if (peersError) {
            console.error('Error loading peer benchmarks profiles:', peersError);
            peerContainer.innerHTML = `<div class="text-center py-4 text-danger"><i class="fa-solid fa-triangle-exclamation me-2"></i>Unable to load departmental benchmarks profiles.</div>`;
            return;
        }

        if (!peers || peers.length === 0) {
            peerContainer.innerHTML = `<div class="text-center py-4 text-muted">No departmental peer data available.</div>`;
            return;
        }

        // 2. Fetch all appointments this week for all department peers
        const peerIds = peers.map(p => p.id);
        const { data: appts, error: apptsError } = await supabaseClient
            .from('appointments')
            .select('id, faculty_id, status')
            .in('faculty_id', peerIds)
            .gte('appointment_date', weekStartStr)
            .lte('appointment_date', weekEndStr);

        if (apptsError) {
            console.error('Error loading peer benchmarks appointments:', apptsError);
            peerContainer.innerHTML = `<div class="text-center py-4 text-danger"><i class="fa-solid fa-triangle-exclamation me-2"></i>Unable to load departmental benchmarks appointments.</div>`;
            return;
        }

        // 3. Aggregate consultations per peer
        const peerStats = {};
        peers.forEach(p => {
            peerStats[p.id] = {
                id: p.id,
                full_name: p.full_name,
                avatar: p.avatar,
                total: 0,
                pending: 0,
                approved: 0,
                completed: 0
            };
        });

        if (appts && appts.length > 0) {
            appts.forEach(appt => {
                if (peerStats[appt.faculty_id]) {
                    peerStats[appt.faculty_id].total++;
                    if (appt.status === 'pending') {
                        peerStats[appt.faculty_id].pending++;
                    } else if (appt.status === 'approved') {
                        peerStats[appt.faculty_id].approved++;
                    } else if (appt.status === 'completed') {
                        peerStats[appt.faculty_id].completed++;
                    }
                }
            });
        }

        const sortedPeers = Object.values(peerStats).sort((a, b) => b.total - a.total);
        const currentUserId = this.user.id;
        const rankIndex = sortedPeers.findIndex(p => p.id === currentUserId);
        const rank = rankIndex !== -1 ? rankIndex + 1 : sortedPeers.length;
        const totalPeers = sortedPeers.length;

        let percentileText = '';
        if (totalPeers <= 1) {
            percentileText = 'Sole faculty in this department';
        } else {
            const percentile = Math.round(((totalPeers - rank) / (totalPeers - 1)) * 100);
            percentileText = `Rank #${rank} of ${totalPeers} in department (${percentile}% percentile)`;
        }

        const totalDeptConsultations = sortedPeers.reduce((sum, p) => sum + p.total, 0);
        const peerAverage = totalPeers > 0 ? (totalDeptConsultations / totalPeers) : 0;
        const currentUserTotal = peerStats[currentUserId] ? peerStats[currentUserId].total : 0;

        let comparisonText = '';
        const diff = currentUserTotal - peerAverage;
        if (diff > 0) {
            comparisonText = `<span class="text-success fw-bold"><i class="fa-solid fa-arrow-trend-up"></i> +${diff.toFixed(1)} above average</span>`;
        } else if (diff < 0) {
            comparisonText = `<span class="text-warning fw-bold"><i class="fa-solid fa-arrow-trend-down"></i> ${Math.abs(diff).toFixed(1)} below average</span>`;
        } else {
            comparisonText = `<span class="text-muted fw-bold"><i class="fa-solid fa-check"></i> Equal to average</span>`;
        }

        const maxConsultations = Math.max(...sortedPeers.map(p => p.total), 1);

        peerContainer.innerHTML = `
            <!-- KPI Summary Cards -->
            <div class="col-md-4">
                <div class="card border-0 bg-light p-3 rounded-4 h-100 shadow-none hover-lift">
                    <div class="d-flex align-items-center gap-3">
                        <div class="bg-primary-soft text-primary rounded-circle p-3 d-flex align-items-center justify-content-center animate-float" style="width: 50px; height: 50px; background-color: rgba(30, 58, 138, 0.1);">
                            <i class="fa-solid fa-trophy fa-lg" style="color: var(--primary-color);"></i>
                        </div>
                        <div>
                            <span class="text-muted small fw-medium">Your Ranking</span>
                            <h4 class="fw-bold text-dark mb-0">Rank #${rank} <span class="fs-6 fw-normal text-muted">of ${totalPeers}</span></h4>
                        </div>
                    </div>
                    <div class="mt-2 text-muted small" style="font-size: 0.8rem;">${percentileText}</div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="card border-0 bg-light p-3 rounded-4 h-100 shadow-none hover-lift">
                    <div class="d-flex align-items-center gap-3">
                        <div class="bg-accent-soft text-accent rounded-circle p-3 d-flex align-items-center justify-content-center" style="width: 50px; height: 50px; background-color: rgba(16, 185, 129, 0.1);">
                            <i class="fa-solid fa-chart-line fa-lg" style="color: var(--accent-color);"></i>
                        </div>
                        <div>
                            <span class="text-muted small fw-medium">Department Avg</span>
                            <h4 class="fw-bold text-dark mb-0">${peerAverage.toFixed(1)} <span class="fs-6 fw-normal text-muted">consults</span></h4>
                        </div>
                    </div>
                    <div class="mt-2 text-muted small" style="font-size: 0.8rem;">${comparisonText}</div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="card border-0 bg-light p-3 rounded-4 h-100 shadow-none hover-lift">
                    <div class="d-flex align-items-center gap-3">
                        <div class="bg-info-soft text-info rounded-circle p-3 d-flex align-items-center justify-content-center" style="width: 50px; height: 50px; background-color: rgba(13, 202, 240, 0.1);">
                            <i class="fa-solid fa-users fa-lg" style="color: #0dcaf0;"></i>
                        </div>
                        <div>
                            <span class="text-muted small fw-medium">Department Total</span>
                            <h4 class="fw-bold text-dark mb-0">${totalDeptConsultations} <span class="fs-6 fw-normal text-muted">consults</span></h4>
                        </div>
                    </div>
                    <div class="mt-2 text-muted small" style="font-size: 0.8rem;">Total activity across all faculty</div>
                </div>
            </div>

            <!-- Leaderboard Table/List -->
            <div class="col-12 mt-3">
                <div class="card border-0 p-3 bg-light rounded-4 shadow-none">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <h6 class="fw-bold text-dark mb-0"><i class="fa-solid fa-list-ol text-primary me-2"></i>Department Weekly Leaderboard</h6>
                        <span class="text-muted small">${weekStartStr} to ${weekEndStr}</span>
                    </div>
                    <div class="d-flex flex-column gap-2">
                        ${sortedPeers.map((peer, idx) => {
                            const percent = Math.round((peer.total / maxConsultations) * 100);
                            const isSelf = peer.id === currentUserId;
                            const placeBadge = idx === 0 ? '🏆 1st' : idx === 1 ? '🥈 2nd' : idx === 2 ? '🥉 3rd' : `#${idx + 1}`;
                            const placeColor = idx === 0 ? 'bg-warning text-dark' : idx === 1 ? 'bg-secondary text-white' : idx === 2 ? 'bg-danger text-white' : 'bg-light text-muted border';
                            
                            const initials = peer.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
                            const avatarHtml = peer.avatar 
                                ? `<img src="${peer.avatar}" class="rounded-circle" style="width: 40px; height: 40px; object-fit: cover;" alt="Avatar">`
                                : `<div class="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center fw-bold" style="width: 40px; height: 40px; font-size: 0.9rem;">${initials}</div>`;
                            
                            return `
                                <div class="d-flex align-items-center justify-content-between p-3 rounded-4 bg-white border ${isSelf ? 'border-primary border-2 shadow-sm' : 'border-light'}" style="${isSelf ? 'background-color: rgba(30, 58, 138, 0.03) !important;' : ''}">
                                    <div class="d-flex align-items-center gap-3 flex-grow-1">
                                        <div class="d-flex align-items-center justify-content-center rounded-pill px-3 py-1 fw-bold text-nowrap ${placeColor}" style="min-width: 65px; font-size: 0.8rem;">
                                            ${placeBadge}
                                        </div>
                                        ${avatarHtml}
                                        <div class="flex-grow-1" style="max-width: 60%;">
                                            <div class="fw-semibold text-dark d-flex align-items-center gap-2">
                                                ${sanitizeHTML(peer.full_name)}
                                                ${isSelf ? '<span class="badge bg-primary text-white rounded-pill text-xs">You</span>' : ''}
                                            </div>
                                            <div class="progress mt-2" style="height: 6px; border-radius: 3px;">
                                                <div class="progress-bar ${isSelf ? 'bg-primary' : 'bg-info'}" role="progressbar" style="width: ${percent}%;" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100"></div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="text-end ms-3">
                                        <span class="fw-bold text-dark fs-5">${peer.total}</span> <span class="text-muted small">consults</span>
                                        <div class="text-muted small mt-1" style="font-size: 0.75rem;">
                                            ${peer.completed} completed · ${peer.approved} approved · ${peer.pending} pending
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            </div>
        `;
    },

    renderWeeklyReportCharts: function(data) {
        if (!window.Chart) return;

        const statusData = [
            data.filter(a => a.status === 'pending').length,
            data.filter(a => a.status === 'approved').length,
            data.filter(a => a.status === 'completed').length
        ];

        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const dayCounts = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
        data.forEach(appt => {
            const day = new Date(appt.appointment_date).toLocaleDateString('en-US', { weekday: 'short' });
            if (dayCounts[day] !== undefined) dayCounts[day] += 1;
        });

        const dailyData = days.map(d => dayCounts[d]);

        const isEmpty = data.length === 0;
        let statusLabels = ['Pending', 'Approved', 'Completed'];
        let statusDatasetData = statusData;
        let statusColors = ['#f59e0b', '#10b981', '#3b82f6'];
        if (isEmpty) {
            statusLabels = ['No Data'];
            statusDatasetData = [1];
            statusColors = ['#cbd5e1']; // slate grey for empty state
        }

        const ctxStatus = document.getElementById('weeklyStatusChart');
        if (ctxStatus) {
            if (this.charts.weeklyStatus) this.charts.weeklyStatus.destroy();
            this.charts.weeklyStatus = new Chart(ctxStatus, {
                type: 'doughnut',
                data: {
                    labels: statusLabels,
                    datasets: [{
                        data: statusDatasetData,
                        backgroundColor: statusColors,
                        borderWidth: 0
                    }]
                },
                options: { plugins: { legend: { position: 'bottom', labels: { color: document.body.classList.contains('dark-mode') ? '#f8fafc' : '#1f2937' } } }, cutout: '70%' }
            });
        }

        const ctxDaily = document.getElementById('weeklyDailyChart');
        if (ctxDaily) {
            if (this.charts.weeklyDaily) this.charts.weeklyDaily.destroy();
            this.charts.weeklyDaily = new Chart(ctxDaily, {
                type: 'bar',
                data: {
                    labels: days,
                    datasets: [{
                        label: 'Appointments',
                        data: dailyData,
                        backgroundColor: isEmpty ? '#cbd5e1' : '#2563eb',
                        borderRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { beginAtZero: true, ticks: { color: document.body.classList.contains('dark-mode') ? '#94a3b8' : '#6b7280' }, grid: { color: document.body.classList.contains('dark-mode') ? '#334155' : '#e5e7eb' } },
                        x: { ticks: { color: document.body.classList.contains('dark-mode') ? '#94a3b8' : '#6b7280' }, grid: { color: 'transparent' } }
                    },
                    plugins: { legend: { display: false } }
                }
            });
        }
    },

    saveFacultyWeeklyReport: async function() {
        if (!this.user || !this.profile || this.profile.role !== 'faculty') return;

        const { weekStart, weekEnd } = this.getCurrentWeekRange();
        const weekStartStr = this.formatDateString(weekStart);
        const weekEndStr = this.formatDateString(weekEnd);

        const { data, error } = await supabaseClient
            .from('appointments')
            .select('*, profiles!appointments_student_id_fkey(full_name, department)')
            .eq('faculty_id', this.user.id)
            .gte('appointment_date', weekStartStr)
            .lte('appointment_date', weekEndStr)
            .order('appointment_date', { ascending: true });

        if (error) {
            alert('Unable to gather appointment details: ' + error.message);
            return;
        }

        const pending = data.filter(a => a.status === 'pending').length;
        const approved = data.filter(a => a.status === 'approved').length;
        const completed = data.filter(a => a.status === 'completed').length;
        const total = data.length;

        const snapshot = data.map(appt => ({
            date: appt.appointment_date,
            start_time: appt.start_time,
            end_time: appt.end_time,
            status: appt.status,
            student_name: appt.profiles?.full_name || null,
            department: appt.profiles?.department || null,
            purpose: appt.purpose
        }));

        const { error: saveError } = await supabaseClient.from('faculty_reports').insert([{
            faculty_id: this.user.id,
            week_start: weekStartStr,
            week_end: weekEndStr,
            total_requests: total,
            pending_requests: pending,
            approved_requests: approved,
            completed_requests: completed,
            report_notes: null,
            raw_snapshot: JSON.stringify(snapshot)
        }]);

        if (saveError) {
            alert('Unable to save weekly report. Please verify the faculty_reports table exists in Supabase and your permissions.\n' + saveError.message);
            return;
        }

        this.showToast('Weekly Report Saved', 'The current weekly report was stored in Supabase.', 'success');
        await this.loadSavedWeeklyReports();
    },

    exportFacultyReport: function() {
        if (!this.facultyRequests || this.facultyRequests.length === 0) {
            alert("No appointment requests found to export.");
            return;
        }

        const facultyName = this.profile.full_name;
        const facultyEmail = this.user.email;
        const facultyDept = this.profile.department || 'ICT Department';
        const dateGenerated = new Date().toLocaleString();

        let pendingCount = 0;
        let approvedCount = 0;
        let completedCount = 0;
        let totalCount = this.facultyRequests.length;

        let tableRows = '';
        this.facultyRequests.forEach((appt, index) => {
            if (appt.status === 'pending') pendingCount++;
            if (appt.status === 'approved') approvedCount++;
            if (appt.status === 'completed') completedCount++;

            const dateObj = new Date(appt.appointment_date);
            const dateStr = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
            const formatTime = (time) => new Date(`1970-01-01T${time}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            tableRows += `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 12px; font-weight: 500; color: #1e293b;">${index + 1}</td>
                    <td style="padding: 12px; font-weight: 600; color: #0f172a;">${appt.profiles.full_name}<br><small style="color: #64748b; font-weight: 400; font-size: 11px;">${appt.profiles.department || 'Student'}</small></td>
                    <td style="padding: 12px; color: #334155; font-size: 13px;"><strong>${dateStr}</strong><br><small style="color: #64748b; font-size: 11px;">${formatTime(appt.start_time)} - ${formatTime(appt.end_time)}</small></td>
                    <td style="padding: 12px; color: #475569; font-size: 12px; max-width: 250px; word-wrap: break-word;">${appt.purpose}</td>
                    <td style="padding: 12px;"><span style="display: inline-block; padding: 4px 10px; font-size: 10px; font-weight: 700; border-radius: 9999px; text-transform: uppercase; ${
                        appt.status === 'approved' ? 'background: #d1fae5; color: #065f46;' :
                        appt.status === 'completed' ? 'background: #dbeafe; color: #1e40af;' :
                        appt.status === 'pending' ? 'background: #fef3c7; color: #92400e;' :
                        'background: #fee2e2; color: #991b1b;'
                    }">${appt.status}</span></td>
                </tr>
            `;
        });

        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <title>Consultation Report - ConsulTime</title>
                <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
                <style>
                    body {
                        font-family: 'Outfit', sans-serif;
                        color: #1e293b;
                        background: #fff;
                        margin: 0;
                        padding: 40px;
                    }
                    .header-container {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        border-bottom: 3px solid #1e3a8a;
                        padding-bottom: 20px;
                        margin-bottom: 30px;
                    }
                    .brand {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                    }
                    .brand-title {
                        color: #1e3a8a;
                        font-weight: 800;
                        font-size: 28px;
                        margin: 0;
                        letter-spacing: 0.5px;
                    }
                    .report-tag {
                        background: #eff6ff;
                        color: #1e40af;
                        font-weight: 700;
                        padding: 6px 12px;
                        border-radius: 6px;
                        font-size: 12px;
                        letter-spacing: 1px;
                        text-transform: uppercase;
                    }
                    .meta-grid {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 20px;
                        background: #f8fafc;
                        border: 1px solid #e2e8f0;
                        padding: 20px;
                        border-radius: 12px;
                        margin-bottom: 30px;
                    }
                    .meta-item {
                        font-size: 14px;
                    }
                    .meta-label {
                        color: #64748b;
                        font-weight: 500;
                        margin-bottom: 4px;
                        text-transform: uppercase;
                        font-size: 11px;
                        letter-spacing: 0.5px;
                    }
                    .meta-value {
                        color: #0f172a;
                        font-weight: 600;
                        font-size: 15px;
                    }
                    .stats-container {
                        display: grid;
                        grid-template-columns: repeat(4, 1fr);
                        gap: 15px;
                        margin-bottom: 40px;
                    }
                    .stat-card {
                        background: #fff;
                        border: 1px solid #e2e8f0;
                        border-radius: 12px;
                        padding: 15px;
                        text-align: center;
                        box-shadow: 0 1px 3px rgba(0,0,0,0.02);
                    }
                    .stat-card.total { border-left: 4px solid #1e3a8a; }
                    .stat-card.pending { border-left: 4px solid #d97706; }
                    .stat-card.approved { border-left: 4px solid #10b981; }
                    .stat-card.completed { border-left: 4px solid #3b82f6; }
                    .stat-label {
                        color: #64748b;
                        font-size: 12px;
                        font-weight: 500;
                        margin-bottom: 5px;
                    }
                    .stat-value {
                        color: #0f172a;
                        font-size: 24px;
                        font-weight: 700;
                    }
                    .table-title {
                        font-size: 18px;
                        font-weight: 700;
                        color: #0f172a;
                        margin-bottom: 15px;
                    }
                    .report-table {
                        width: 100%;
                        border-collapse: collapse;
                        text-align: left;
                    }
                    .report-table th {
                        background: #f1f5f9;
                        color: #475569;
                        font-weight: 700;
                        padding: 12px;
                        font-size: 12px;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                        border-bottom: 2px solid #cbd5e1;
                    }
                    .footer {
                        margin-top: 60px;
                        border-top: 1px solid #e2e8f0;
                        padding-top: 20px;
                        text-align: center;
                        font-size: 12px;
                        color: #94a3b8;
                    }
                    @media print {
                        body { padding: 0; }
                    }
                </style>
            </head>
            <body>
                <div class="header-container">
                    <div class="brand">
                        <span style="font-size: 28px;">⏰</span>
                        <h1 class="brand-title">ConsulTime</h1>
                    </div>
                    <span class="report-tag">Consultation Services Report</span>
                </div>

                <div class="meta-grid">
                    <div class="meta-item">
                        <div class="meta-label">Faculty Member</div>
                        <div class="meta-value">${facultyName}</div>
                    </div>
                    <div class="meta-item">
                        <div class="meta-label">Date Generated</div>
                        <div class="meta-value">${dateGenerated}</div>
                    </div>
                    <div class="meta-item">
                        <div class="meta-label">Department</div>
                        <div class="meta-value">${facultyDept}</div>
                    </div>
                    <div class="meta-item">
                        <div class="meta-label">Faculty Contact</div>
                        <div class="meta-value">${facultyEmail}</div>
                    </div>
                </div>

                <div class="stats-container">
                    <div class="stat-card total">
                        <div class="stat-label">Total Requests</div>
                        <div class="stat-value">${totalCount}</div>
                    </div>
                    <div class="stat-card pending">
                        <div class="stat-label">Pending Approval</div>
                        <div class="stat-value">${pendingCount}</div>
                    </div>
                    <div class="stat-card approved">
                        <div class="stat-label">Approved & Active</div>
                        <div class="stat-value">${approvedCount}</div>
                    </div>
                    <div class="stat-card completed">
                        <div class="stat-label">Completed</div>
                        <div class="stat-value">${completedCount}</div>
                    </div>
                </div>

                <h2 class="table-title">Detailed Consultation Logs</h2>
                <table class="report-table">
                    <thead>
                        <tr>
                            <th style="width: 50px;">No.</th>
                            <th>Student Details</th>
                            <th>Schedule Date & Time</th>
                            <th>Consultation Purpose</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>

                <div class="footer">
                    This is an officially compiled academic report generated by the ConsulTime Consultation Scheduler System. All session records are protected by academic policy.
                </div>

                <script>
                    window.onload = function() {
                        window.print();
                    };
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
    },

    // Purpose-based dropdown configurations for the "Complete Consultation" modal
    _processAutoRejects: async function(appointments) {
        if (!appointments || appointments.length === 0) return;

        const manila = this.getManilaTime();
        const currentDate = manila.dateStr;
        const currentTotalMins = manila.hour * 60 + manila.minute;

        const expiredAppts = appointments.filter(appt => {
            if (appt.status !== 'pending' && appt.status !== 'approved') return false;
            
            if (appt.appointment_date < currentDate) return true; // Past day
            
            if (appt.appointment_date === currentDate && appt.end_time) {
                const [endH, endM] = appt.end_time.split(':').map(Number);
                const endTotalMins = endH * 60 + endM;
                if (currentTotalMins >= endTotalMins) return true; // Time has passed today
            }
            return false;
        });

        if (expiredAppts.length > 0) {
            for (let appt of expiredAppts) {
                // Update locally so UI renders it correctly immediately
                appt.status = 'rejected';
                appt.faculty_notes = 'System Auto-Rejected: Consultation time expired without attendance.';
                
                // Update in DB asynchronously
                await supabaseClient.from('appointments').update({
                    status: 'rejected',
                    faculty_notes: 'System Auto-Rejected: Consultation time expired without attendance.'
                }).eq('id', appt.id);
            }
        }
    },

    startAppointmentMonitor: function() {
        if (this.monitorInterval) clearInterval(this.monitorInterval);
        
        // Check immediately, then every 1 minute
        this._checkUpcomingAppointments();
        this.monitorInterval = setInterval(() => {
            this._checkUpcomingAppointments();
        }, 60000);
    },

    _checkUpcomingAppointments: async function() {
        if (!this.user || !this.profile) return;
        
        const manila = this.getManilaTime();
        const currentDate = manila.dateStr;
        const currentTotalMins = manila.hour * 60 + manila.minute;
        
        // Fetch approved appointments for today
        let query = supabaseClient.from('appointments').select('*')
            .eq('appointment_date', currentDate)
            .eq('status', 'approved');
            
        if (this.profile.role === 'student') {
            query = query.eq('student_id', this.user.id);
        } else if (this.profile.role === 'faculty') {
            query = query.eq('faculty_id', this.user.id);
        }
        
        const { data, error } = await query;
        if (error || !data) return;
        
        // We track notified alerts in sessionStorage to prevent spamming
        let notifiedAlerts = JSON.parse(sessionStorage.getItem('ct_alerts') || '{}');
        let needsDbRefresh = false;

        for (let appt of data) {
            if (!appt.start_time || !appt.end_time) continue;

            const [startH, startM] = appt.start_time.split(':').map(Number);
            const startTotalMins = startH * 60 + startM;
            const diffMins = startTotalMins - currentTotalMins;
            
            const [endH, endM] = appt.end_time.split(':').map(Number);
            const endTotalMins = endH * 60 + endM;
            
            // 1. Check Auto-Reject in real-time (time expired)
            if (currentTotalMins >= endTotalMins) {
                await supabaseClient.from('appointments').update({
                    status: 'rejected',
                    faculty_notes: 'System Auto-Rejected: Consultation time expired without attendance.'
                }).eq('id', appt.id);
                
                this.sendNativeNotification('⏳ Consultation Expired', 'An appointment was auto-rejected because it was not attended.');
                needsDbRefresh = true;
                continue; 
            }

            // 2. Alert Checks
            if (diffMins === 10 && !notifiedAlerts[`${appt.id}_10`]) {
                this.sendNativeNotification('⏰ Upcoming Consultation', `Your consultation starts in exactly 10 minutes!`);
                this.showToast('Upcoming Consultation', `Starts in 10 minutes!`, 'warning');
                notifiedAlerts[`${appt.id}_10`] = true;
            }
            else if (diffMins === 5 && !notifiedAlerts[`${appt.id}_5`]) {
                this.sendNativeNotification('🚨 Consultation Starting Soon', `Your consultation starts in 5 minutes. Get ready!`);
                this.showToast('Starting Soon', `Starts in 5 minutes!`, 'warning');
                notifiedAlerts[`${appt.id}_5`] = true;
            }
            else if (diffMins === 0 && !notifiedAlerts[`${appt.id}_0`]) {
                this.sendNativeNotification('▶️ Consultation Started', `Your consultation is starting right now!`);
                this.showToast('Consultation Started', `It is time for your consultation!`, 'success');
                notifiedAlerts[`${appt.id}_0`] = true;
            }
        }
        
        sessionStorage.setItem('ct_alerts', JSON.stringify(notifiedAlerts));
        
        if (needsDbRefresh) {
            if (this.profile.role === 'student') this.fetchStudentAppointments();
            if (this.profile.role === 'faculty') this.fetchFacultyRequests();
        }
    },

    checkAppVersion: async function() {
        if (typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform()) {
            try {
                const info = await Capacitor.Plugins.App.getInfo();
                const currentVersion = info.version;
                
                // Compare semantic versions (e.g. "1.0.0" vs "1.0.1")
                if (this._compareVersions(currentVersion, REQUIRED_APK_VERSION) < 0) {
                    this._showUpdateModal(currentVersion);
                }
            } catch (error) {
                console.error("Could not fetch app version:", error);
            }
        }
    },

    _compareVersions: function(v1, v2) {
        const parts1 = v1.split('.').map(Number);
        const parts2 = v2.split('.').map(Number);
        for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
            const p1 = parts1[i] || 0;
            const p2 = parts2[i] || 0;
            if (p1 < p2) return -1;
            if (p1 > p2) return 1;
        }
        return 0;
    },

    _showUpdateModal: function(currentVersion) {
        // Prevent multiple modals
        if (document.getElementById('updateAppModal')) return;

        const modalHtml = `
            <div class="modal fade" id="updateAppModal" data-bs-backdrop="static" data-bs-keyboard="false" tabindex="-1" aria-labelledby="updateAppModalLabel" aria-hidden="true">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content border-0 shadow-lg" style="border-radius: 1rem;">
                        <div class="modal-header bg-danger text-white border-0" style="border-top-left-radius: 1rem; border-top-right-radius: 1rem;">
                            <h5 class="modal-title w-100 text-center" id="updateAppModalLabel">
                                <i class="fas fa-exclamation-triangle me-2"></i>Update Required
                            </h5>
                        </div>
                        <div class="modal-body text-center p-4">
                            <div class="mb-4">
                                <i class="fas fa-cloud-download-alt text-danger" style="font-size: 4rem;"></i>
                            </div>
                            <h4 class="mb-3">New Version Available!</h4>
                            <p class="text-muted mb-4">
                                You are using an outdated version of ConsulTime (v${currentVersion}). 
                                To continue using the app and access new features, please download and install the latest update (v${REQUIRED_APK_VERSION}).
                            </p>
                            <div class="d-flex flex-column gap-3">
                                <a href="${MEDIAFIRE_LINK}" target="_blank" class="btn btn-primary btn-lg rounded-pill">
                                    <i class="fas fa-fire me-2"></i>Download from MediaFire
                                </a>
                                <a href="${GOOGLE_DRIVE_LINK}" target="_blank" class="btn btn-outline-primary btn-lg rounded-pill">
                                    <i class="fab fa-google-drive me-2"></i>Download from Google Drive
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modalElement = document.getElementById('updateAppModal');
        const bsModal = new bootstrap.Modal(modalElement);
        bsModal.show();
    },

    _purposeConfig: {
        grades: {
            alert: null,
            outcomes: [
                { group: '✅ Resolved', items: [
                    ['Grade concern addressed and explained', 'Grade concern addressed and explained'],
                    ['Grade correction / appeal submitted', 'Grade correction / appeal submitted'],
                    ['Student accepted grade outcome', 'Student accepted grade outcome'],
                ]},
                { group: '🔄 Needs Follow-up', items: [
                    ['Needs Follow-up Session', 'Needs follow-up — awaiting grade update'],
                    ['Ongoing Monitoring Required', 'Ongoing monitoring of academic standing required'],
                ]},
                { group: '⚠️ Escalated', items: [
                    ['Referred to Registrar / Admin', 'Referred to Registrar / Administration'],
                    ['Referred to Department Head', 'Referred to Department Head for review'],
                ]},
            ],
            actions: [
                { group: '📊 Grade Review', items: [
                    ['Reviewed and explained grading rubric and computation', 'Reviewed and explained grading rubric and computation'],
                    ['Verified and corrected grade entry error', 'Verified and corrected grade entry error'],
                    ['Provided re-assessment / reconsideration opportunity', 'Provided re-assessment / reconsideration opportunity'],
                ]},
                { group: '📋 Academic Advising', items: [
                    ['Advised student on how to improve academic performance', 'Advised student on how to improve academic performance'],
                    ['Created academic recovery and intervention plan', 'Created academic recovery and intervention plan'],
                    ['Coordinated with subject teacher / department', 'Coordinated with subject teacher / department'],
                ]},
                { group: '📝 Other', items: [
                    ['Other intervention (specify in details/remarks)', 'Other intervention (specify in remarks below)'],
                ]},
            ],
            followups: [
                'Schedule grade re-check after corrections',
                'Monitor student grades for the next quarter',
                'Conduct academic performance follow-up session',
                'Coordinate with subject teacher for updates',
            ],
            notesPlaceholder: 'Describe the grade concern, steps taken, and resolution...',
        },
        projects: {
            alert: null,
            outcomes: [
                { group: '✅ Resolved', items: [
                    ['Project concern resolved / clarified', 'Project concern resolved and clarified'],
                    ['Project plan approved and finalized', 'Project plan approved and finalized'],
                ]},
                { group: '🔄 Needs Follow-up', items: [
                    ['Needs Follow-up Session', 'Needs follow-up — project still in progress'],
                    ['Extension granted — monitoring required', 'Extension granted — monitoring required'],
                ]},
                { group: '⚠️ Escalated', items: [
                    ['Referred to Department Head', 'Referred to Department Head / Coordinator'],
                ]},
            ],
            actions: [
                { group: '📁 Project Guidance', items: [
                    ['Reviewed and provided feedback on project plan', 'Reviewed and provided feedback on project plan'],
                    ['Clarified project requirements and rubric', 'Clarified project requirements and rubric'],
                    ['Approved project topic / proposal', 'Approved project topic / proposal'],
                    ['Granted project deadline extension', 'Granted project deadline extension'],
                ]},
                { group: '🤝 Collaboration', items: [
                    ['Arranged peer collaboration or group adjustments', 'Arranged peer collaboration or group adjustments'],
                    ['Provided additional resources / references', 'Provided additional resources / references'],
                ]},
                { group: '📝 Other', items: [
                    ['Other intervention (specify in details/remarks)', 'Other intervention (specify in remarks below)'],
                ]},
            ],
            followups: [
                'Review project progress in the next session',
                'Check project submission before deadline',
                'Coordinate with group members for updates',
            ],
            notesPlaceholder: 'Describe the project concern, feedback given, and next steps...',
        },
        assignments: {
            alert: null,
            outcomes: [
                { group: '✅ Resolved', items: [
                    ['Assignment concern clarified and resolved', 'Assignment concern clarified and resolved'],
                    ['Late submission accepted / waived', 'Late submission accepted / waived'],
                ]},
                { group: '🔄 Needs Follow-up', items: [
                    ['Needs Follow-up Session', 'Needs follow-up — assignment still pending'],
                ]},
            ],
            actions: [
                { group: '📄 Assignment Help', items: [
                    ['Explained assignment instructions and expectations', 'Explained assignment instructions and expectations'],
                    ['Granted assignment extension or alternative submission', 'Granted assignment extension or alternative submission'],
                    ['Provided tutoring / academic assistance', 'Provided tutoring / academic assistance'],
                    ['Accepted and acknowledged late submission', 'Accepted and acknowledged late submission'],
                ]},
                { group: '📝 Other', items: [
                    ['Other intervention (specify in details/remarks)', 'Other intervention (specify in remarks below)'],
                ]},
            ],
            followups: [
                'Confirm submission before the next class',
                'Follow up on assignment completion',
                'Schedule tutoring if needed',
            ],
            notesPlaceholder: 'Describe the assignment concern, instructions clarified, or agreement made...',
        },
        task: {
            alert: null,
            outcomes: [
                { group: '✅ Resolved', items: [
                    ['Task concern clarified and resolved', 'Task concern clarified and resolved'],
                    ['Task completion plan agreed upon', 'Task completion plan agreed upon'],
                ]},
                { group: '🔄 Needs Follow-up', items: [
                    ['Needs Follow-up Session', 'Needs follow-up — task still ongoing'],
                ]},
            ],
            actions: [
                { group: '✅ Task Guidance', items: [
                    ['Clarified task requirements and expectations', 'Clarified task requirements and expectations'],
                    ['Set a revised task completion timeline', 'Set a revised task completion timeline'],
                    ['Provided additional materials or resources', 'Provided additional materials or resources'],
                ]},
                { group: '📝 Other', items: [
                    ['Other intervention (specify in details/remarks)', 'Other intervention (specify in remarks below)'],
                ]},
            ],
            followups: [
                'Check task progress before deadline',
                'Confirm task completion in next meeting',
            ],
            notesPlaceholder: 'Describe the task concern, guidance provided, and agreed plan...',
        },
        bullying: {
            alert: { type: 'danger', icon: 'fa-solid fa-shield-exclamation', text: '<strong>Bullying / Harassment Case.</strong> Per DepEd Anti-Bullying Act (RA 10627), this requires mandatory documentation and proper escalation. Complete all fields carefully.' },
            outcomes: [
                { group: '✅ Resolved', items: [
                    ['Resolved / Case Settled Between Parties', 'Resolved — case settled between parties'],
                    ['Resolved / Student Reassured and Supported', 'Resolved — student reassured and supported'],
                ]},
                { group: '🔄 Ongoing / Needs Follow-up', items: [
                    ['Needs Follow-up Session (Recurring Issue)', 'Needs follow-up — recurring bullying issue'],
                    ['Ongoing Monitoring Required', 'Ongoing monitoring of student welfare required'],
                    ['Awaiting Parental / Guardian Coordination', 'Awaiting parental / guardian coordination'],
                ]},
                { group: '⚠️ Escalated', items: [
                    ['Referred to Guidance Counselor', 'Referred to Guidance Counselor'],
                    ['Referred to School Principal / Administration', 'Referred to School Principal / Administration'],
                    ['Case Filed / Formal Complaint Logged', 'Case filed — formal complaint logged'],
                    ['Disciplinary Intervention Initiated', 'Disciplinary intervention initiated against bully'],
                ]},
            ],
            actions: [
                { group: '🗣️ Counseling & Support', items: [
                    ['Conducted one-on-one advising and counselling', 'Conducted one-on-one advising and counselling'],
                    ['Conducted emotional support / active listening session', 'Conducted emotional support / active listening session'],
                ]},
                { group: '🤝 Mediation & Resolution', items: [
                    ['Initiated mediation between involved parties', 'Initiated mediation between involved parties'],
                    ['Initiated formal Anti-Bullying & Mediation Protocols', 'Initiated formal Anti-Bullying & Mediation Protocols'],
                    ['Conducted class / peer awareness discussion on bullying', 'Conducted class / peer awareness discussion on bullying'],
                ]},
                { group: '👨‍👩‍👧 Parental Involvement', items: [
                    ['Scheduled Parental Coordination / PTC Conference', 'Scheduled Parental Coordination / PTC Conference'],
                    ['Contacted parent/guardian directly (phone / in-person)', 'Contacted parent/guardian directly (phone / in-person)'],
                ]},
                { group: '📋 Safety & Welfare', items: [
                    ['Adjusted seating / class grouping arrangements', 'Adjusted seating / class grouping arrangements'],
                    ['Recommended safe space / buddy system for student', 'Recommended safe space / buddy system for student'],
                ]},
                { group: '🚨 Escalation (Serious Cases)', items: [
                    ['Referred to Guidance Office (mental health / bullying)', 'Referred to Guidance Office (mental health / bullying)'],
                    ['Escalated to School Principal / Discipline Board', 'Escalated to School Principal / Discipline Board'],
                    ['Submitted Formal Incident Report (DepEd Anti-Bullying)', 'Submitted Formal Incident Report (DepEd Anti-Bullying Form)'],
                    ['Endorsed to Barangay / DSWD / PNP-WCPD', 'Endorsed to Barangay / DSWD / PNP-WCPD for external intervention'],
                ]},
                { group: '📝 Other', items: [
                    ['Other intervention (specify in details/remarks)', 'Other intervention (specify in remarks below)'],
                ]},
            ],
            followups: [
                'Monitor student safety and welfare daily for 2 weeks',
                'Schedule another consultation within 1 week',
                'Conduct classroom observation for recurring incidents',
                'Require written apology from the bully',
                'Coordinate with Guidance Counselor on next session',
                'Suspend bully per school disciplinary policy',
                'Refer to external mental health / support services',
            ],
            notesPlaceholder: 'Describe the bullying incident: who, what, when, how often, what the student reported, and what was done...',
        },
        emotional: {
            alert: { type: 'warning', icon: 'fa-solid fa-heart-pulse', text: '<strong>Emotional / Mental Health Concern.</strong> Approach with care and empathy. Ensure proper referral and monitoring.' },
            outcomes: [
                { group: '✅ Resolved', items: [
                    ['Student reassured and emotionally stabilized', 'Student reassured and emotionally stabilized'],
                    ['Concern acknowledged and addressed', 'Concern acknowledged and addressed in session'],
                ]},
                { group: '🔄 Needs Follow-up', items: [
                    ['Needs Follow-up Session', 'Needs follow-up mental health check-in'],
                    ['Ongoing Monitoring Required', 'Ongoing monitoring of student\'s wellbeing required'],
                    ['Awaiting Parental / Guardian Coordination', 'Awaiting parental / guardian coordination'],
                ]},
                { group: '⚠️ Escalated', items: [
                    ['Referred to Guidance Counselor', 'Referred to School Guidance Counselor'],
                    ['Referred to external mental health professional', 'Referred to external mental health professional'],
                ]},
            ],
            actions: [
                { group: '💬 Emotional Support', items: [
                    ['Conducted one-on-one advising and counselling', 'Conducted one-on-one advising and counselling'],
                    ['Conducted emotional support / active listening session', 'Conducted emotional support / active listening session'],
                    ['Validated student feelings and provided coping strategies', 'Validated student feelings and provided coping strategies'],
                ]},
                { group: '👨‍👩‍👧 Family Involvement', items: [
                    ['Scheduled Parental Coordination / PTC Conference', 'Scheduled Parental Coordination / PTC Conference'],
                    ['Contacted parent/guardian directly (phone / in-person)', 'Contacted parent/guardian directly (phone / in-person)'],
                ]},
                { group: '🚨 Referral', items: [
                    ['Referred to Guidance Office (mental health / bullying)', 'Referred to Guidance Office for mental health support'],
                    ['Referred to external mental health professional', 'Referred to external mental health professional / therapist'],
                ]},
                { group: '📝 Other', items: [
                    ['Other intervention (specify in details/remarks)', 'Other intervention (specify in remarks below)'],
                ]},
            ],
            followups: [
                'Schedule weekly mental health check-in',
                'Monitor student attendance and behavior',
                'Coordinate with Guidance Counselor on next session',
                'Inform parents of student\'s progress',
                'Refer to external support services if needed',
            ],
            notesPlaceholder: 'Describe the emotional concern shared, how the student presented, and what support was provided...',
        },
        peer_conflict: {
            alert: { type: 'warning', icon: 'fa-solid fa-users-slash', text: '<strong>Peer Conflict / Dispute.</strong> Document all parties involved and actions taken to resolve the conflict.' },
            outcomes: [
                { group: '✅ Resolved', items: [
                    ['Conflict resolved between peers', 'Conflict resolved between peers through dialogue'],
                    ['Mutual agreement reached', 'Mutual agreement reached between conflicting parties'],
                ]},
                { group: '🔄 Needs Follow-up', items: [
                    ['Needs Follow-up Session', 'Needs follow-up — conflict still being managed'],
                    ['Ongoing Monitoring Required', 'Ongoing monitoring required to prevent re-escalation'],
                ]},
                { group: '⚠️ Escalated', items: [
                    ['Referred to Guidance Counselor', 'Referred to Guidance Counselor'],
                    ['Referred to School Principal / Administration', 'Referred to School Principal / Administration'],
                ]},
            ],
            actions: [
                { group: '🤝 Mediation', items: [
                    ['Initiated mediation between involved parties', 'Initiated mediation between involved parties'],
                    ['Conducted one-on-one advising and counselling', 'Conducted individual advising for each party'],
                    ['Facilitated group dialogue / reconciliation session', 'Facilitated group dialogue / reconciliation session'],
                ]},
                { group: '📋 Preventive Measures', items: [
                    ['Adjusted seating / class grouping arrangements', 'Adjusted seating / class grouping arrangements'],
                    ['Set behavioral expectations and agreement', 'Set clear behavioral expectations and written agreement'],
                ]},
                { group: '👨‍👩‍👧 Parental Involvement', items: [
                    ['Scheduled Parental Coordination / PTC Conference', 'Scheduled Parental Coordination / PTC Conference'],
                    ['Contacted parent/guardian directly (phone / in-person)', 'Contacted parent/guardian directly (phone / in-person)'],
                ]},
                { group: '🚨 Escalation', items: [
                    ['Escalated to School Principal / Discipline Board', 'Escalated to School Principal / Discipline Board'],
                ]},
                { group: '📝 Other', items: [
                    ['Other intervention (specify in details/remarks)', 'Other intervention (specify in remarks below)'],
                ]},
            ],
            followups: [
                'Check in with both parties after 3 days',
                'Monitor classroom dynamics for 2 weeks',
                'Schedule follow-up mediation if needed',
                'Coordinate with Guidance Counselor',
            ],
            notesPlaceholder: 'Describe the conflict: parties involved, nature of dispute, and how it was resolved...',
        },
        others: {
            alert: null,
            outcomes: [
                { group: '✅ Resolved', items: [
                    ['Concern addressed and resolved', 'Concern addressed and resolved'],
                    ['Student\'s query answered satisfactorily', 'Student\'s query answered satisfactorily'],
                ]},
                { group: '🔄 Needs Follow-up', items: [
                    ['Needs Follow-up Session', 'Needs follow-up session'],
                    ['Ongoing Monitoring Required', 'Ongoing monitoring required'],
                ]},
                { group: '⚠️ Escalated', items: [
                    ['Referred to Guidance Counselor', 'Referred to Guidance Counselor'],
                    ['Referred to School Principal / Admin', 'Referred to School Administration'],
                ]},
            ],
            actions: [
                { group: '🗣️ General Advising', items: [
                    ['Conducted one-on-one advising and counselling', 'Conducted one-on-one advising and counselling'],
                    ['Provided relevant information and guidance', 'Provided relevant information and guidance'],
                ]},
                { group: '📋 Administrative', items: [
                    ['Coordinated with relevant department / office', 'Coordinated with relevant department / office'],
                    ['Scheduled follow-up appointment', 'Scheduled follow-up appointment'],
                ]},
                { group: '📝 Other', items: [
                    ['Other intervention (specify in details/remarks)', 'Other intervention (specify in remarks below)'],
                ]},
            ],
            followups: [
                'Schedule follow-up consultation',
                'Monitor student progress',
                'Coordinate with relevant staff',
            ],
            notesPlaceholder: 'Describe the concern raised and the guidance or assistance provided...',
        },
    },

    _getPurposeConfig: function(purpose) {
        if (!purpose) return this._purposeConfig.others;
        const p = purpose.toLowerCase();
        if (p.includes('grade')) return this._purposeConfig.grades;
        if (p.includes('project')) return this._purposeConfig.projects;
        if (p.includes('assignment')) return this._purposeConfig.assignments;
        if (p.includes('task')) return this._purposeConfig.task;
        if (p.includes('bullying') || p.includes('harassment')) return this._purposeConfig.bullying;
        if (p.includes('emotional') || p.includes('mental')) return this._purposeConfig.emotional;
        if (p.includes('peer') || p.includes('conflict') || p.includes('dispute')) return this._purposeConfig.peer_conflict;
        return this._purposeConfig.others;
    },

    _buildSelectOptions: function(selectEl, groupedItems, defaultLabel) {
        selectEl.innerHTML = `<option value="" disabled selected>${defaultLabel}</option>`;
        groupedItems.forEach(group => {
            const og = document.createElement('optgroup');
            og.label = group.group;
            group.items.forEach(([val, text]) => {
                const opt = document.createElement('option');
                opt.value = val;
                opt.textContent = text;
                og.appendChild(opt);
            });
            selectEl.appendChild(og);
        });
    },

    openActionModal: function (id, type, purpose = '') {
        document.getElementById('actionApptId').value = id;
        document.getElementById('actionType').value = type;

        let title = '';
        let desc = '';
        if (type === 'approved') { title = 'Approve Request'; desc = 'This will notify the student that the consultation is confirmed.'; }
        if (type === 'rejected') { title = 'Reject Request'; desc = 'Please provide a reason in the notes if possible.'; }
        if (type === 'completed') { title = 'Complete Consultation'; desc = 'Mark this consultation as successfully completed.'; }
        if (type === 'edit_completed') { title = 'Update Consultation Record'; desc = 'Modify the outcome, action taken, and notes for this consultation.'; }
        if (type === 'no_show_sanction') { title = '⚠️ Add Sanction Note'; desc = 'The student did not attend this consultation. Write a sanction note (e.g., reschedule penalty, warning, etc.). This will be visible to the student.'; }

        document.getElementById('actionModalTitle').textContent = title;
        document.getElementById('actionModalDesc').textContent = desc;
        document.getElementById('actionNotes').value = '';

        const completedDetails = document.getElementById('completedConsultationDetails');
        const notesLabel = document.getElementById('actionNotesLabel');
        const notesInput = document.getElementById('actionNotes');
        
        if (completedDetails) {
            if (type === 'completed' || type === 'edit_completed') {
                completedDetails.style.display = 'block';
                
                // --- Dynamic Purpose Logic ---
                const config = this._getPurposeConfig(purpose);
                
                // Alert banner handling
                const alertBanner = document.getElementById('purposeAlertBanner');
                const alertIcon = document.getElementById('purposeAlertIcon');
                const alertText = document.getElementById('purposeAlertText');
                
                if (config.alert) {
                    alertBanner.className = `alert alert-${config.alert.type} mb-3 py-2`;
                    alertIcon.className = `${config.alert.icon} me-2`;
                    alertText.innerHTML = config.alert.text;
                    alertBanner.classList.remove('d-none');
                } else {
                    alertBanner.classList.add('d-none');
                }
                
                // Populate dropdowns
                this._buildSelectOptions(document.getElementById('consultationOutcome'), config.outcomes, 'Select outcome...');
                this._buildSelectOptions(document.getElementById('actionTakenSelect'), config.actions, 'Select action taken...');
                
                // Follow up plan
                const followUpSelect = document.getElementById('followUpPlan');
                followUpSelect.innerHTML = '<option value="">— No follow-up needed —</option>';
                config.followups.forEach(f => {
                    const opt = document.createElement('option');
                    opt.value = f;
                    opt.textContent = f;
                    followUpSelect.appendChild(opt);
                });

                if (notesLabel) notesLabel.textContent = 'Detailed Remarks / Case Notes (Optional)';
                if (notesInput) notesInput.placeholder = config.notesPlaceholder || 'Provide specific details...';
            } else {
                completedDetails.style.display = 'none';
                if (notesLabel) notesLabel.textContent = 'Notes (Optional)';
                if (notesInput) notesInput.placeholder = 'Message to student...';
            }
        }

        const modal = new bootstrap.Modal(document.getElementById('actionModal'));
        modal.show();

        document.getElementById('confirmActionBtn').onclick = async () => {
            const notes = document.getElementById('actionNotes').value;

            if (type === 'approved') {
                // Get details of the current appointment to identify competing/conflicting ones
                const { data: currentAppt, error: fetchError } = await supabaseClient
                    .from('appointments')
                    .select('faculty_id, appointment_date, start_time')
                    .eq('id', id)
                    .single();

                if (fetchError || !currentAppt) {
                    alert("Error retrieving appointment details: " + (fetchError ? fetchError.message : "Not found"));
                    return;
                }

                // Check if another appointment is already approved for the exact same date and time slot
                const { data: alreadyApproved, error: checkApprovedError } = await supabaseClient
                    .from('appointments')
                    .select('id')
                    .eq('faculty_id', currentAppt.faculty_id)
                    .eq('appointment_date', currentAppt.appointment_date)
                    .eq('start_time', currentAppt.start_time)
                    .eq('status', 'approved')
                    .neq('id', id);

                if (checkApprovedError) {
                    alert("Error verifying slot availability: " + checkApprovedError.message);
                    return;
                }

                if (alreadyApproved && alreadyApproved.length > 0) {
                    alert("Cannot approve: This time slot has already been approved for another student.");
                    return;
                }

                // Update the selected appointment to approved
                const { error: approveError } = await supabaseClient.from('appointments').update({
                    status: 'approved',
                    faculty_notes: notes
                }).eq('id', id);

                if (approveError) {
                    alert("Failed to approve appointment: " + approveError.message);
                    return;
                }

                // Auto-reject any other pending appointments for the same date and time slot
                await supabaseClient.from('appointments').update({
                    status: 'rejected',
                    faculty_notes: 'This slot has been booked by another student (First-Come, First-Served).'
                })
                .eq('faculty_id', currentAppt.faculty_id)
                .eq('appointment_date', currentAppt.appointment_date)
                .eq('start_time', currentAppt.start_time)
                .eq('status', 'pending')
                .neq('id', id);

            } else if (type === 'no_show_sanction') {
                // Save sanction note without changing the status (stays no_show)
                if (!notes.trim()) {
                    alert('Please enter a sanction note before saving.');
                    return;
                }
                const { error: sanctionErr } = await supabaseClient.from('appointments').update({
                    sanction_note: notes.trim()
                }).eq('id', id);

                if (sanctionErr) {
                    alert('Failed to save sanction note: ' + sanctionErr.message);
                    return;
                }
            } else {
                let finalNotes = notes;
                let finalStatus = type === 'edit_completed' ? 'completed' : type;

                if (type === 'completed' || type === 'edit_completed') {
                    const outcome = document.getElementById('consultationOutcome').value;
                    const action = document.getElementById('actionTakenSelect').value;
                    const followup = document.getElementById('followUpPlan').value;
                    if (!outcome || !action) {
                        alert('Please select the Consultation Outcome and the Action Taken.');
                        return;
                    }
                    // Save structured text into the database notes column
                    finalNotes = `[Outcome: ${outcome}] [Action Taken: ${action}]${followup ? ` [Follow-up: ${followup}]` : ''}${notes ? ` Details: ${notes}` : ''}`;
                }

                const { error: updateError } = await supabaseClient.from('appointments').update({
                    status: finalStatus,
                    faculty_notes: finalNotes
                }).eq('id', id);

                if (updateError) {
                    alert("Failed to update appointment: " + updateError.message);
                    return;
                }
            }

            modal.hide();
            this.fetchFacultyRequests();
            if (typeof this.loadWeeklyAppointments === 'function' && document.getElementById('weeklyReportView')) {
                this.loadWeeklyAppointments();
            }
        };
    },

    handleAddAvailability: async function (e) {
        e.preventDefault();
        
        const checkedBoxes = document.querySelectorAll('#daysCheckboxContainer .day-checkbox:checked');
        if (checkedBoxes.length === 0) {
            alert("Please select at least one day of the week.");
            return;
        }

        const start = document.getElementById('availStartTime').value;
        const end = document.getElementById('availEndTime').value;

        if (start >= end) {
            alert("Start time must be before end time.");
            return;
        }

        const recordsToInsert = Array.from(checkedBoxes).map(box => ({
            faculty_id: this.user.id,
            day_of_week: parseInt(box.value),
            start_time: start + ':00',
            end_time: end + ':00',
            specific_date: null
        }));

        const { error } = await supabaseClient.from('faculty_availability').insert(recordsToInsert);

        if (error) {
            alert(error.message);
        } else {
            // Reset the form: clear times and uncheck checkboxes
            document.getElementById('availStartTime').value = '';
            document.getElementById('availEndTime').value = '';
            checkedBoxes.forEach(box => box.checked = false);
            
            // Clear active state of quick time slots
            const quickTimeSlots = document.getElementById('quickTimeSlots');
            if (quickTimeSlots) {
                quickTimeSlots.querySelectorAll('.quick-time-btn').forEach(b => b.classList.remove('active'));
            }
            
            this.fetchFacultyAvailability();
        }
    },

    fetchFacultyAvailability: async function () {
        const { data, error } = await supabaseClient
            .from('faculty_availability')
            .select('*')
            .eq('faculty_id', this.user.id)
            .order('day_of_week', { ascending: true })
            .order('start_time', { ascending: true });

        if (error) return;

        const tbody = document.getElementById('availabilityTableBody');
        tbody.innerHTML = '';

        const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

        data.forEach(avail => {
            const formatTime = (time) => new Date(`1970-01-01T${time}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            const dayName = days[avail.day_of_week] || 'Unknown';

            tbody.innerHTML += `
                <tr>
                    <td>
                        <div class="fw-medium text-dark">${dayName}</div>
                    </td>
                    <td>${formatTime(avail.start_time)} - ${formatTime(avail.end_time)}</td>
                    <td class="text-end">
                        <button class="btn btn-sm btn-outline-primary rounded-pill me-1" onclick="App.openEditAvailabilityModal('${avail.id}', ${avail.day_of_week}, '${avail.start_time}', '${avail.end_time}')">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger rounded-pill" onclick="App.deleteAvailability('${avail.id}')">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        });

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-muted">No availability set. Students cannot book appointments.</td></tr>';
        }
    },

    deleteAvailability: async function (id) {
        if (confirm("Delete this availability slot?")) {
            await supabaseClient.from('faculty_availability').delete().eq('id', id);
            this.fetchFacultyAvailability();
        }
    },

    openEditAvailabilityModal: function (id, dayOfWeek, startTime, endTime) {
        document.getElementById('editAvailId').value = id;
        document.getElementById('editDayOfWeek').value = dayOfWeek;
        document.getElementById('editAvailStartTime').value = startTime.substring(0, 5);
        document.getElementById('editAvailEndTime').value = endTime.substring(0, 5);

        const modal = new bootstrap.Modal(document.getElementById('editAvailabilityModal'));
        modal.show();
    },

    handleUpdateAvailability: async function (e) {
        e.preventDefault();
        const id = document.getElementById('editAvailId').value;
        const dayOfWeekVal = document.getElementById('editDayOfWeek').value;
        const start = document.getElementById('editAvailStartTime').value;
        const end = document.getElementById('editAvailEndTime').value;

        if (dayOfWeekVal === "") {
            alert("Please select a day of the week.");
            return;
        }

        if (start >= end) {
            alert("Start time must be before end time.");
            return;
        }

        const { error } = await supabaseClient.from('faculty_availability').update({
            day_of_week: parseInt(dayOfWeekVal),
            start_time: start + (start.length === 5 ? ':00' : ''),
            end_time: end + (end.length === 5 ? ':00' : ''),
            specific_date: null
        }).eq('id', id);

        if (error) {
            alert(error.message);
        } else {
            const modalEl = document.getElementById('editAvailabilityModal');
            const modalInstance = bootstrap.Modal.getInstance(modalEl);
            if (modalInstance) modalInstance.hide();
            this.fetchFacultyAvailability();
        }
    },

    renderCharts: function(data) {
        if (!window.Chart) return;

        const isDark = document.body.classList.contains('dark-mode');
        Chart.defaults.color = isDark ? '#cbd5e1' : '#6b7280';
        Chart.defaults.borderColor = isDark ? '#334155' : '#e5e7eb';
        
        // Status Chart
        let pending = 0, approved = 0, completed = 0;
        data.forEach(a => {
            if (a.status === 'pending') pending++;
            if (a.status === 'approved') approved++;
            if (a.status === 'completed') completed++;
        });

        const ctxStatus = document.getElementById('statusChart');
        if (ctxStatus) {
            if (this.charts.status) this.charts.status.destroy();
            this.charts.status = new Chart(ctxStatus, {
                type: 'doughnut',
                data: {
                    labels: ['Pending', 'Approved', 'Completed'],
                    datasets: [{
                        data: [pending, approved, completed],
                        backgroundColor: ['#f59e0b', '#10b981', '#3b82f6'],
                        borderWidth: 0
                    }]
                },
                options: { plugins: { legend: { position: 'bottom', labels: { color: isDark ? '#f8fafc' : '#1f2937' } } }, cutout: '70%' }
            });
        }

        // Weekly Chart (Past 7 days)
        const days = [];
        const counts = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            days.push(d.toLocaleDateString([], { weekday: 'short' }));
            counts.push(data.filter(a => a.appointment_date === dateStr).length);
        }

        const ctxWeekly = document.getElementById('weeklyChart');
        if (ctxWeekly) {
            if (this.charts.weekly) this.charts.weekly.destroy();
            this.charts.weekly = new Chart(ctxWeekly, {
                type: 'bar',
                data: {
                    labels: days,
                    datasets: [{
                        label: 'Consultations',
                        data: counts,
                        backgroundColor: '#3b82f6',
                        borderRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: { 
                        y: { beginAtZero: true, ticks: { stepSize: 1, color: isDark ? '#94a3b8' : '#6b7280' }, grid: { color: isDark ? '#334155' : '#e5e7eb' } },
                        x: { ticks: { color: isDark ? '#94a3b8' : '#6b7280' }, grid: { color: isDark ? '#334155' : '#e5e7eb' } }
                    },
                    plugins: { legend: { labels: { color: isDark ? '#f8fafc' : '#1f2937' } } }
                }
            });
        }
    },

    initRealtime: function() {
        if (!supabaseClient || !this.user) return;
        
        supabaseClient.channel('custom-all-channel')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'appointments' },
            (payload) => {
                const appt = payload.new;
                
                // If I am faculty and someone booked me
                if (this.profile && this.profile.role === 'faculty' && appt.faculty_id === this.user.id && payload.eventType === 'INSERT') {
                    sessionStorage.removeItem('notifsViewed');
                    const title = '📋 New Appointment Request!';
                    const body = `A student just booked a consultation for ${appt.appointment_date}.`;
                    this.showToast(title, body, 'success');
                    this.sendNativeNotification(title, body);
                    this.fetchFacultyRequests();
                }
                
                // If I am student and my booking was updated
                if (this.profile && this.profile.role === 'student' && appt.student_id === this.user.id && payload.eventType === 'UPDATE') {
                    sessionStorage.removeItem('notifsViewed');
                    const statusMap = {
                        approved: { title: '✅ Appointment Approved!', body: 'Your consultation has been confirmed by the faculty.', type: 'success' },
                        rejected: { title: '❌ Appointment Rejected', body: 'Your consultation request was not approved. Check the notes for details.', type: 'danger' },
                        completed: { title: '🎓 Consultation Completed!', body: 'Your consultation has been marked as completed. Check your remarks.', type: 'primary' },
                        no_show: { title: '⚠️ Marked as No-Show', body: 'You were marked as absent for your consultation. Please rebook.', type: 'warning' },
                    };
                    const info = statusMap[appt.status] || { title: '🔔 Appointment Updated', body: 'Your appointment status has changed to: ' + appt.status, type: 'info' };
                    this.showToast(info.title, info.body, info.type);
                    this.sendNativeNotification(info.title, info.body);
                    this.fetchStudentAppointments();
                }
            }
        )
        .subscribe();
    },

    requestNotificationPermission: async function() {
        if (!('Notification' in window)) return;
        if (Notification.permission === 'default') {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                console.log('ConsulTime: Notification permission granted.');
            }
        }
    },

    sendNativeNotification: function(title, body) {
        if (!('Notification' in window)) return;
        if (Notification.permission !== 'granted') return;

        // If service worker is available, use it for background-safe notifications
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
                type: 'SHOW_NOTIFICATION',
                title: title,
                body: body,
                icon: './consultime_mobile_mockup.png',
                badge: './consultime_mobile_mockup.png',
                tag: 'consultime-alert-' + Date.now(),
                url: window.location.href
            });
        } else {
            // Fallback: direct Notification API
            try {
                const n = new Notification(title, {
                    body: body,
                    icon: './consultime_mobile_mockup.png',
                    badge: './consultime_mobile_mockup.png',
                    tag: 'consultime-alert',
                    renotify: true,
                    vibrate: [200, 100, 200]
                });
                n.onclick = () => { window.focus(); n.close(); };
            } catch(e) {
                console.warn('Native notification failed:', e);
            }
        }
    },

    showToast: function(title, message, type='primary') {
        this.playNotificationSound();
        if (!document.getElementById('toastContainer')) {
            document.body.insertAdjacentHTML('beforeend', '<div id="toastContainer" class="toast-container position-fixed bottom-0 end-0 p-3" style="z-index: 1055;"></div>');
        }
        
        const toastId = 'toast' + Date.now();
        const html = `
            <div id="${toastId}" class="toast align-items-center text-bg-${type} border-0 show shadow-lg" role="alert" aria-live="assertive" aria-atomic="true">
              <div class="d-flex">
                <div class="toast-body fw-medium">
                  <strong>${title}</strong><br><small>${message}</small>
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" onclick="document.getElementById('${toastId}').remove()"></button>
              </div>
            </div>
        `;
        document.getElementById('toastContainer').insertAdjacentHTML('beforeend', html);
        
        setTimeout(() => {
            const t = document.getElementById(toastId);
            if (t) t.remove();
        }, 5000);
    },

    playNotificationSound: function() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();
            
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            // Premium "Ding" sound (soft bell)
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
            osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.1); // Up to A6
            
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
            
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.5);
        } catch (e) {
            console.error("Audio play failed:", e);
        }
    },

    initChatbot: function() {
        if (document.getElementById('chatbotToggle')) return;
        const html = `
            <!-- Chatbot Toggle Button -->
            <button class="btn btn-primary rounded-circle shadow-lg d-flex justify-content-center align-items-center" 
                    id="chatbotToggle" 
                    style="position: fixed; bottom: 30px; right: 30px; width: 65px; height: 65px; z-index: 1050; border: 4px solid white; transition: transform 0.2s;"
                    onclick="App.toggleChatbot()"
                    onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">
                <i class="fa-solid fa-robot fs-3"></i>
            </button>

            <!-- Chatbot Window -->
            <div class="card shadow-lg d-none flex-column border-0" id="chatbotWindow" style="position: fixed; bottom: 110px; right: 30px; width: 360px; height: 500px; z-index: 1050; border-radius: 16px; overflow: hidden;">
                <div class="bg-primary text-white p-3 d-flex justify-content-between align-items-center shadow-sm" style="z-index: 2;">
                    <div class="fw-bold d-flex align-items-center gap-2 fs-5">
                        <div class="bg-white text-primary rounded-circle d-flex justify-content-center align-items-center" style="width: 32px; height: 32px;"><i class="fa-solid fa-robot"></i></div>
                        ConsulTime Assistant
                    </div>
                    <button class="btn-close btn-close-white" onclick="App.toggleChatbot()"></button>
                </div>
                <div class="card-body p-3 flex-grow-1 overflow-auto d-flex flex-column gap-3" id="chatbotMessages" style="background-color: #f8fafc;">
                    <div class="d-flex gap-2">
                        <div class="bg-primary text-white rounded-circle d-flex justify-content-center align-items-center flex-shrink-0 mt-1" style="width: 35px; height: 35px; font-size: 14px;"><i class="fa-solid fa-robot"></i></div>
                        <div class="bg-white border p-3 rounded-4 text-dark small shadow-sm" style="border-top-left-radius: 4px !important;">
                            Hi there! 👋 I'm the ConsulTime Assistant. How can I help you schedule your consultations today?
                        </div>
                    </div>
                </div>
                <div class="p-3 border-top bg-white" id="chatbotOptionsContainer">
                    <p class="text-muted small mb-2 fw-medium">Suggested Questions:</p>
                    <div class="d-flex flex-wrap gap-2" id="chatbotOptions">
                        <button class="btn btn-sm btn-outline-primary rounded-pill flex-grow-1 fw-medium" onclick="App.sendChatMessage('How do I book?')">How do I book?</button>
                        <button class="btn btn-sm btn-outline-primary rounded-pill flex-grow-1 fw-medium" onclick="App.sendChatMessage('Where is the video link?')">Where is the video link?</button>
                        <button class="btn btn-sm btn-outline-primary rounded-pill flex-grow-1 fw-medium" onclick="App.sendChatMessage('Can I cancel?')">Can I cancel?</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);
    },

    toggleChatbot: function() {
        const chatWindow = document.getElementById('chatbotWindow');
        const isHidden = chatWindow.classList.contains('d-none');
        
        if (isHidden) {
            chatWindow.classList.remove('d-none');
            chatWindow.classList.add('d-flex');
            chatWindow.style.animation = 'slideUp 0.3s ease-out';
        } else {
            chatWindow.classList.add('d-none');
            chatWindow.classList.remove('d-flex');
        }
    },

    sendChatMessage: function(msg) {
        const msgContainer = document.getElementById('chatbotMessages');
        
        // Add User Message
        msgContainer.insertAdjacentHTML('beforeend', `
            <div class="d-flex gap-2 justify-content-end mb-1">
                <div class="bg-primary text-white p-3 rounded-4 small shadow-sm" style="border-top-right-radius: 4px !important;">
                    ${msg}
                </div>
            </div>
        `);
        msgContainer.scrollTop = msgContainer.scrollHeight;

        // Disable options
        document.getElementById('chatbotOptions').style.opacity = '0.5';
        document.getElementById('chatbotOptions').style.pointerEvents = 'none';

        // Add Typing Indicator
        const typingId = 'typing' + Date.now();
        msgContainer.insertAdjacentHTML('beforeend', `
            <div class="d-flex gap-2" id="${typingId}">
                <div class="bg-primary text-white rounded-circle d-flex justify-content-center align-items-center flex-shrink-0 mt-1" style="width: 35px; height: 35px; font-size: 14px;"><i class="fa-solid fa-robot"></i></div>
                <div class="bg-white border p-3 rounded-4 text-muted small shadow-sm d-flex align-items-center gap-1" style="border-top-left-radius: 4px !important;">
                    <span class="spinner-grow spinner-grow-sm text-primary" style="width: 6px; height: 6px; animation-delay: 0s;"></span>
                    <span class="spinner-grow spinner-grow-sm text-primary" style="width: 6px; height: 6px; animation-delay: 0.2s;"></span>
                    <span class="spinner-grow spinner-grow-sm text-primary" style="width: 6px; height: 6px; animation-delay: 0.4s;"></span>
                </div>
            </div>
        `);
        msgContainer.scrollTop = msgContainer.scrollHeight;

        // Simulate network delay and reply
        setTimeout(() => {
            document.getElementById(typingId).remove();
            
            let reply = "I'm sorry, I don't understand that request.";
            if (msg === 'How do I book?') reply = "It's easy! Click the green **New Appointment** button on your dashboard. Select your department, choose a Faculty member, pick an available date and time, and type your purpose. The faculty will review it shortly!";
            if (msg === 'Where is the video link?') reply = "Once your professor approves your request, a blue **Join Call** button will automatically appear next to your schedule. Just click it to enter the video room!";
            if (msg === 'Can I cancel?') reply = "Yes! As long as your appointment status is still **Pending**, you can click the red **Cancel** button on your dashboard to withdraw your request.";

            msgContainer.insertAdjacentHTML('beforeend', `
                <div class="d-flex gap-2 mb-1">
                    <div class="bg-primary text-white rounded-circle d-flex justify-content-center align-items-center flex-shrink-0 mt-1" style="width: 35px; height: 35px; font-size: 14px;"><i class="fa-solid fa-robot"></i></div>
                    <div class="bg-white border p-3 rounded-4 text-dark small shadow-sm" style="border-top-left-radius: 4px !important; line-height: 1.5;">
                        ${reply.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}
                    </div>
                </div>
            `);
            msgContainer.scrollTop = msgContainer.scrollHeight;

            document.getElementById('chatbotOptions').style.opacity = '1';
            document.getElementById('chatbotOptions').style.pointerEvents = 'auto';

        }, 1200);
    },

    // --- ADMIN DASHBOARD LOGIC ---
    loadAdminDashboard: async function() {
        this.fetchAdminStats();
        this.fetchPendingFaculty();
        this.fetchManageUsers();
        
        // Add search event listener for managing users
        const searchInput = document.getElementById('userSearchInput');
        if (searchInput && !searchInput.dataset.listenerAdded) {
            searchInput.addEventListener('input', () => this.filterUsersList());
            searchInput.dataset.listenerAdded = 'true';
        }
        
        const filterSelect = document.getElementById('userRoleFilter');
        if (filterSelect && !filterSelect.dataset.listenerAdded) {
            filterSelect.addEventListener('change', () => this.filterUsersList());
            filterSelect.dataset.listenerAdded = 'true';
        }
    },

    fetchAdminStats: async function() {
        try {
            const { count: studentCount, error: err1 } = await supabaseClient
                .from('profiles')
                .select('*', { count: 'exact', head: true })
                .eq('role', 'student');

            const { count: facultyCount, error: err2 } = await supabaseClient
                .from('profiles')
                .select('*', { count: 'exact', head: true })
                .eq('role', 'faculty');

            const { count: pendingCount, error: err3 } = await supabaseClient
                .from('profiles')
                .select('*', { count: 'exact', head: true })
                .eq('role', 'faculty')
                .eq('is_approved', false);

            const { count: apptCount, error: err4 } = await supabaseClient
                .from('appointments')
                .select('*', { count: 'exact', head: true });

            if (err1 || err2 || err3 || err4) throw (err1 || err2 || err3 || err4);

            if (document.getElementById('stat-total-students')) document.getElementById('stat-total-students').textContent = studentCount || 0;
            if (document.getElementById('stat-total-faculty')) document.getElementById('stat-total-faculty').textContent = facultyCount || 0;
            if (document.getElementById('stat-pending-approvals')) {
                const el = document.getElementById('stat-pending-approvals');
                el.textContent = pendingCount || 0;
                if (pendingCount > 0) {
                    el.classList.add('text-danger', 'fw-bold');
                } else {
                    el.classList.remove('text-danger', 'fw-bold');
                }
            }
            if (document.getElementById('stat-total-appointments')) document.getElementById('stat-total-appointments').textContent = apptCount || 0;

        } catch (error) {
            console.error("Admin stats error:", error);
        }
    },

    fetchPendingFaculty: async function() {
        const tableBody = document.getElementById('pendingFacultyTableBody');
        if (!tableBody) return;

        tableBody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted"><i class="fa-solid fa-spinner fa-spin me-2"></i>Loading requests...</td></tr>';

        try {
            const { data, error } = await supabaseClient
                .from('profiles')
                .select('*')
                .eq('role', 'faculty')
                .eq('is_approved', false)
                .order('created_at', { ascending: false });

            if (error) throw error;

            const notifBadge = document.getElementById('notifBadge');
            const notifList = document.getElementById('notificationList');

            if (data.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="5" class="text-center py-5 text-muted"><i class="fa-solid fa-circle-check text-success fs-3 d-block mb-2"></i>No pending faculty approval requests.</td></tr>';
                if (notifBadge) notifBadge.style.display = 'none';
                if (notifList) {
                    notifList.innerHTML = '<li><h6 class="dropdown-header fw-bold">Notifications</h6></li><li><hr class="dropdown-divider"></li><li><span class="dropdown-item text-center text-muted small">No new system notices</span></li>';
                }
                return;
            }

            if (notifBadge && notifList) {
                notifBadge.style.display = 'block';
                notifBadge.textContent = data.length;
                
                let notifHtml = '<li><h6 class="dropdown-header fw-bold">Recent Notifications</h6></li><li><hr class="dropdown-divider"></li>';
                data.forEach(fac => {
                    notifHtml += `<li><a class="dropdown-item py-2 border-bottom" href="#" onclick="document.getElementById('nav-faculty-approvals').click()">
                        <div class="fw-bold small text-dark">${sanitizeHTML(fac.full_name)}</div>
                        <div class="text-muted" style="font-size: 12px;">Registered as Faculty (Approval Pending)</div>
                    </a></li>`;
                });
                notifList.innerHTML = notifHtml;
            }

            tableBody.innerHTML = '';
            data.forEach(fac => {
                const createdDate = fac.created_at ? new Date(fac.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
                tableBody.innerHTML += `
                    <tr>
                        <td class="px-4">
                            <div class="d-flex align-items-center gap-3">
                                <div class="bg-light text-primary rounded-circle d-flex align-items-center justify-content-center fw-bold" style="width: 40px; height: 40px; font-size: 14px;">
                                    ${sanitizeHTML(fac.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase())}
                                </div>
                                <div>
                                    <span class="fw-bold text-dark d-block">${sanitizeHTML(fac.full_name)}</span>
                                    <span class="text-muted small" style="font-size: 11px;">ID: ${sanitizeHTML(fac.id_number || '—')}</span>
                                </div>
                            </div>
                        </td>
                        <td>${sanitizeHTML(fac.email)}</td>
                        <td><span class="badge bg-light text-primary border border-primary-subtle px-3 py-2 rounded-pill font-monospace" style="font-size:11px;">${sanitizeHTML(fac.department || '—')}</span></td>
                        <td>${createdDate}</td>
                        <td class="text-end px-4">
                            <button onclick="App.approveFaculty('${fac.id}')" class="btn btn-sm btn-success rounded-pill px-3 py-1.5 fw-semibold me-2 shadow-sm"><i class="fa-solid fa-check me-1"></i>Approve</button>
                            <button onclick="App.rejectFaculty('${fac.id}')" class="btn btn-sm btn-outline-danger rounded-pill px-3 py-1.5 fw-semibold"><i class="fa-solid fa-trash me-1"></i>Reject</button>
                        </td>
                    </tr>
                `;
            });

        } catch (error) {
            console.error("Pending faculty error:", error);
            tableBody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-danger"><i class="fa-solid fa-triangle-exclamation me-2"></i>Unable to load pending requests.</td></tr>';
        }
    },

    fetchManageUsers: async function() {
        const tableBody = document.getElementById('usersTableBody');
        if (!tableBody) return;

        tableBody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted"><i class="fa-solid fa-spinner fa-spin me-2"></i>Loading directory...</td></tr>';

        try {
            const { data, error } = await supabaseClient
                .from('profiles')
                .select('*')
                .order('role', { ascending: false })
                .order('full_name', { ascending: true });

            if (error) throw error;

            this.allUsers = data;
            this.filterUsersList();

        } catch (error) {
            console.error("Manage users error:", error);
            tableBody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-danger"><i class="fa-solid fa-triangle-exclamation me-2"></i>Unable to load user directory.</td></tr>';
        }
    },

    filterUsersList: function() {
        const tableBody = document.getElementById('usersTableBody');
        if (!tableBody || !this.allUsers) return;

        const query = document.getElementById('userSearchInput').value.toLowerCase();
        const roleFilter = document.getElementById('userRoleFilter').value;

        const filtered = this.allUsers.filter(u => {
            const matchesSearch = u.full_name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query) || (u.department && u.department.toLowerCase().includes(query));
            const matchesRole = roleFilter === 'all' || u.role === roleFilter;
            return matchesSearch && matchesRole;
        });

        if (filtered.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-5 text-muted"><i class="fa-solid fa-user-slash fs-3 d-block mb-2 text-muted"></i>No users match the search criteria.</td></tr>';
            return;
        }

        tableBody.innerHTML = '';
        filtered.forEach(u => {
            const badgeClass = u.role === 'admin' ? 'bg-danger' : (u.role === 'faculty' ? 'bg-primary' : 'bg-success');
            const statusBadge = u.role === 'faculty' 
                ? (u.is_approved ? '<span class="badge bg-success-subtle text-success border border-success-subtle rounded-pill px-2 py-1" style="font-size:10px;"><i class="fa-solid fa-check-double me-1"></i>Active</span>' 
                                 : '<span class="badge bg-warning-subtle text-warning border border-warning-subtle rounded-pill px-2 py-1" style="font-size:10px;"><i class="fa-solid fa-triangle-exclamation me-1"></i>Pending</span>')
                : '<span class="badge bg-success-subtle text-success border border-success-subtle rounded-pill px-2 py-1" style="font-size:10px;"><i class="fa-solid fa-check-double me-1"></i>Active</span>';

            // Build the action buttons
            // Admins shouldn't delete themselves to prevent locking themselves out of the portal
            const deleteBtn = u.id === this.user.id 
                ? `<button class="btn btn-sm btn-outline-secondary rounded-pill px-2 py-1" style="font-size:10px;" disabled><i class="fa-solid fa-ban"></i> Self</button>`
                : `<button onclick="App.deleteUser('${u.id}', '${sanitizeHTML(u.full_name.replace(/'/g, "\\'"))}')" class="btn btn-sm btn-outline-danger rounded-pill px-2 py-1" style="font-size:10px;"><i class="fa-solid fa-trash-can"></i> Delete</button>`;
            
            const editBtn = `<button onclick="App.showEditUserModal('${u.id}')" class="btn btn-sm btn-primary rounded-pill px-3 py-1 me-1 text-white shadow-sm" style="font-size:10px;"><i class="fa-solid fa-user-pen"></i> Edit</button>`;

            tableBody.innerHTML += `
                <tr>
                    <td class="px-4">
                        <div class="d-flex align-items-center gap-3">
                            <div class="bg-light text-secondary rounded-circle d-flex align-items-center justify-content-center fw-bold" style="width: 40px; height: 40px; font-size: 14px;">
                                ${u.avatar ? `<img src="${u.avatar}" class="w-100 h-100 rounded-circle object-fit-cover">` : sanitizeHTML(u.full_name.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase())}
                            </div>
                            <div>
                                <span class="fw-bold text-dark d-block">${sanitizeHTML(u.full_name)}</span>
                                <span class="text-muted small" style="font-size: 11px;">ID: ${sanitizeHTML(u.id_number || '—')}</span>
                            </div>
                        </div>
                    </td>
                    <td>${sanitizeHTML(u.email)}</td>
                    <td><span class="badge ${badgeClass} rounded-pill px-3 py-1.5 fw-bold text-uppercase" style="font-size:10px;">${sanitizeHTML(u.role)}</span></td>
                    <td>
                        <span class="d-block">${sanitizeHTML(u.department || '—')}</span>
                        ${u.role === 'student' && (u.school_year || u.section) ? `<span class="text-muted small" style="font-size: 11px;">S.Y. ${sanitizeHTML(u.school_year || '—')} - ${sanitizeHTML(u.section || '—')}</span>` : ''}
                    </td>
                    <td>${statusBadge}</td>
                    <td class="text-end px-4">
                        <div class="d-inline-flex">
                            ${editBtn}
                            ${deleteBtn}
                        </div>
                    </td>
                </tr>
            `;
        });
    },

    approveFaculty: async function(facultyId) {
        if (!confirm("Are you sure you want to approve this faculty member's registration?")) return;
        
        try {
            const { error } = await supabaseClient
                .from('profiles')
                .update({ is_approved: true })
                .eq('id', facultyId);

            if (error) throw error;

            this.showProfileToast("Faculty member approved successfully!", "success");
            this.loadAdminDashboard(); // Refresh dashboard

        } catch (error) {
            console.error("Approve faculty error:", error);
            this.showProfileToast("Failed to approve faculty member: " + error.message, "danger");
        }
    },

    rejectFaculty: async function(facultyId) {
        if (!confirm("Are you sure you want to reject and delete this registration? This action cannot be undone.")) return;

        try {
            const { error } = await supabaseClient
                .from('profiles')
                .delete()
                .eq('id', facultyId);

            if (error) throw error;

            this.showProfileToast("Registration request rejected and deleted.", "info");
            this.loadAdminDashboard(); // Refresh dashboard

        } catch (error) {
            console.error("Reject faculty error:", error);
            this.showProfileToast("Failed to reject registration: " + error.message, "danger");
        }
    },

    showEditUserModal: function(userId) {
        const user = this.allUsers.find(u => u.id === userId);
        if (!user) return;

        document.getElementById('editUserId').value = user.id;
        document.getElementById('editUserFullName').value = user.full_name;
        document.getElementById('editUserIdNumber').value = user.id_number || '';
        document.getElementById('editUserRole').value = user.role;
        document.getElementById('editUserIsApproved').checked = user.is_approved !== false;

        if (user.role === 'student') {
            document.getElementById('editUserStudentFields').classList.remove('d-none');
            document.getElementById('editUserSchoolYear').value = user.school_year || '';
            document.getElementById('editUserSection').value = user.section || '';
        } else {
            document.getElementById('editUserStudentFields').classList.add('d-none');
            document.getElementById('editUserSchoolYear').value = '';
            document.getElementById('editUserSection').value = '';
        }

        this.updateEditUserDepartmentDropdown(user.role, user.department || '');
        this.toggleModalApprovalSwitch();

        const editModal = new bootstrap.Modal(document.getElementById('editUserModal'));
        editModal.show();
    },

    toggleModalApprovalSwitch: function() {
        const role = document.getElementById('editUserRole').value;
        const container = document.getElementById('editFacultyApprovalContainer');
        if (role === 'faculty') {
            container.classList.remove('d-none');
        } else {
            container.classList.add('d-none');
        }

        const studentFieldsContainer = document.getElementById('editUserStudentFields');
        if (studentFieldsContainer) {
            if (role === 'student') {
                studentFieldsContainer.classList.remove('d-none');
            } else {
                studentFieldsContainer.classList.add('d-none');
            }
        }

        this.updateEditUserDepartmentDropdown(role, document.getElementById('editUserDepartment').value);
    },

    updateEditUserDepartmentDropdown: function(role, currentDept) {
        const deptSelect = document.getElementById('editUserDepartment');
        if (!deptSelect) return;
        
        deptSelect.innerHTML = '';
        
        const studentOptions = [
            { value: "STEM", text: "Senior High: STEM (Science, Technology, Engineering, & Mathematics)" },
            { value: "ABM", text: "Senior High: ABM (Accountancy, Business, & Management)" },
            { value: "HUMSS", text: "Senior High: HUMSS (Humanities & Social Sciences)" },
            { value: "GAS", text: "Senior High: GAS (General Academic Strand)" },
            { value: "TVL - ICT", text: "Senior High: TVL - ICT (Info. & Comm. Technology)" },
            { value: "TVL - HE", text: "Senior High: TVL - HE (Home Economics)" },
            { value: "TVL - IA", text: "Senior High: TVL - IA (Industrial Arts)" },
            { value: "Grade 7", text: "Junior High: Grade 7" },
            { value: "Grade 8", text: "Junior High: Grade 8" },
            { value: "Grade 9", text: "Junior High: Grade 9" },
            { value: "Grade 10", text: "Junior High: Grade 10" },
            { value: "Others", text: "Others" }
        ];

        const facultyOptions = [
            { value: "English Department", text: "English Department" },
            { value: "Mathematics Department", text: "Mathematics Department" },
            { value: "Science Department", text: "Science Department" },
            { value: "Filipino Department", text: "Filipino Department" },
            { value: "Social Studies Department", text: "Social Studies Department" },
            { value: "MAPEH Department", text: "MAPEH Department" },
            { value: "TLE / TVL Department", text: "TLE / TVL Department" },
            { value: "Values Education Department", text: "Values Education Department" },
            { value: "SHS Department", text: "Senior High School (SHS) Department" },
            { value: "JHS Department", text: "Junior High School (JHS) Department" },
            { value: "Guidance & Counseling Department", text: "Guidance & Counseling Department" },
            { value: "Administrative / Support Staff", text: "Administrative / Support Staff" },
            { value: "Others", text: "Others" }
        ];

        let options = [];
        if (role === 'student') {
            options = studentOptions;
        } else {
            options = facultyOptions;
        }

        const placeholderOpt = document.createElement('option');
        placeholderOpt.value = "";
        placeholderOpt.disabled = true;
        placeholderOpt.selected = !currentDept;
        placeholderOpt.textContent = "Select Course / Department";
        deptSelect.appendChild(placeholderOpt);

        options.forEach(opt => {
            const el = document.createElement('option');
            el.value = opt.value;
            el.textContent = opt.text;
            if (currentDept === opt.value) {
                el.selected = true;
            }
            deptSelect.appendChild(el);
        });
        
        if (currentDept && !options.some(opt => opt.value === currentDept)) {
            const el = document.createElement('option');
            el.value = currentDept;
            el.textContent = currentDept;
            el.selected = true;
            deptSelect.appendChild(el);
        }
    },

    saveEditedUser: async function(e) {
        e.preventDefault();
        const id = document.getElementById('editUserId').value;
        const fullName = document.getElementById('editUserFullName').value;
        const idNumber = document.getElementById('editUserIdNumber').value;
        const department = document.getElementById('editUserDepartment').value;
        const role = document.getElementById('editUserRole').value;
        const isApproved = role === 'faculty' ? document.getElementById('editUserIsApproved').checked : true;
        
        const schoolYear = role === 'student' ? document.getElementById('editUserSchoolYear').value : null;
        const section = role === 'student' ? document.getElementById('editUserSection').value : null;

        const btn = document.getElementById('saveEditedUserBtn');
        const oldText = btn.innerHTML;

        try {
            btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin me-1"></i>Saving...';
            btn.disabled = true;

            const { error } = await supabaseClient
                .from('profiles')
                .update({
                    full_name: fullName,
                    id_number: idNumber,
                    department: department,
                    role: role,
                    is_approved: isApproved,
                    school_year: schoolYear,
                    section: section
                })
                .eq('id', id);

            if (error) throw error;

            this.showProfileToast("User profile updated successfully!", "success");
            
            // Hide modal
            const modalEl = document.getElementById('editUserModal');
            const modalInstance = bootstrap.Modal.getInstance(modalEl);
            if (modalInstance) modalInstance.hide();

            // Refresh dashboards
            this.loadAdminDashboard();

        } catch (error) {
            console.error("Save edit user error:", error);
            this.showProfileToast("Failed to update profile: " + error.message, "danger");
        } finally {
            btn.innerHTML = oldText;
            btn.disabled = false;
        }
    },

    deleteUser: async function(userId, userName) {
        if (!confirm(`WARNING: Are you sure you want to permanently delete user "${userName}"?\nThis will completely remove their account and all associated appointment records. This action cannot be undone.`)) return;

        try {
            const { error } = await supabaseClient
                .from('profiles')
                .delete()
                .eq('id', userId);

            if (error) throw error;

            this.showProfileToast(`User "${userName}" has been deleted.`, "info");
            this.loadAdminDashboard(); // Refresh directory

        } catch (error) {
            console.error("Delete user error:", error);
            this.showProfileToast("Failed to delete user: " + error.message, "danger");
        }
    },

    alarmAudioInterval: null,
    audioCtx: null,

    getManilaTime: function(date = new Date()) {
        const options = {
            timeZone: 'Asia/Manila',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false
        };
        const formatter = new Intl.DateTimeFormat('en-US', options);
        const parts = formatter.formatToParts(date);
        const dateParts = {};
        parts.forEach(p => { dateParts[p.type] = p.value; });
        let hour = parseInt(dateParts.hour, 10);
        if (hour === 24) hour = 0;
        return {
            dateStr: `${dateParts.year}-${dateParts.month}-${dateParts.day}`,
            timeStr: `${dateParts.hour}:${dateParts.minute}:${dateParts.second}`,
            hour: hour,
            minute: parseInt(dateParts.minute, 10),
            second: parseInt(dateParts.second, 10),
            year: parseInt(dateParts.year, 10),
            month: parseInt(dateParts.month, 10),
            day: parseInt(dateParts.day, 10)
        };
    },

    playLoudAlarmSound: function() {
        if (this.alarmAudioInterval) return;
        if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        const playBeepPair = () => {
            if (!this.audioCtx) return;
            if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
            const now = this.audioCtx.currentTime;
            
            const osc1 = this.audioCtx.createOscillator();
            const gain1 = this.audioCtx.createGain();
            osc1.type = 'square';
            osc1.frequency.setValueAtTime(880, now);
            gain1.gain.setValueAtTime(0, now);
            gain1.gain.linearRampToValueAtTime(0.8, now + 0.05);
            gain1.gain.setValueAtTime(0.8, now + 0.15);
            gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
            osc1.connect(gain1); gain1.connect(this.audioCtx.destination);
            osc1.start(now); osc1.stop(now + 0.25);
            
            const osc2 = this.audioCtx.createOscillator();
            const gain2 = this.audioCtx.createGain();
            osc2.type = 'square';
            osc2.frequency.setValueAtTime(880, now + 0.3);
            gain2.gain.setValueAtTime(0, now + 0.3);
            gain2.gain.linearRampToValueAtTime(0.8, now + 0.35);
            gain2.gain.setValueAtTime(0.8, now + 0.45);
            gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
            osc2.connect(gain2); gain2.connect(this.audioCtx.destination);
            osc2.start(now + 0.3); osc2.stop(now + 0.55);
        };
        try { playBeepPair(); } catch (e) { console.error(e); }
        this.alarmAudioInterval = setInterval(playBeepPair, 1500);
    },

    stopLoudAlarmSound: function() {
        if (this.alarmAudioInterval) {
            clearInterval(this.alarmAudioInterval);
            this.alarmAudioInterval = null;
        }
    },

    showConsultationAlarmOverlay: function(appt) {
        if (document.getElementById('consultationAlarmOverlay')) return;
        this.playLoudAlarmSound();
        const overlay = document.createElement('div');
        overlay.id = 'consultationAlarmOverlay';
        overlay.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(15,23,42,0.75);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;animation:fadeIn 0.4s ease-out forwards;";
        
        if (!document.getElementById('alarmStyles')) {
            const style = document.createElement('style');
            style.id = 'alarmStyles';
            style.textContent = "@keyframes fadeIn{from{opacity:0;}to{opacity:1;}}@keyframes scaleUp{from{transform:scale(0.9);opacity:0;}to{transform:scale(1);opacity:1;}}@keyframes pulseRing{0%{transform:scale(0.95);box-shadow:0 0 0 0 rgba(16,185,129,0.7);}70%{transform:scale(1);box-shadow:0 0 0 20px rgba(16,185,129,0);}100%{transform:scale(0.95);box-shadow:0 0 0 0 rgba(16,185,129,0);}}@keyframes bellRing{0%{transform:rotate(0);}10%{transform:rotate(15deg);}20%{transform:rotate(-15deg);}30%{transform:rotate(10deg);}40%{transform:rotate(-10deg);}50%{transform:rotate(5deg);}60%{transform:rotate(-5deg);}70%{transform:rotate(0);}100%{transform:rotate(0);}}.pulse-container{animation:pulseRing 2s infinite;}.bell-animation{animation:bellRing 1.2s infinite;display:inline-block;}";
            document.head.appendChild(style);
        }
        
        const formattedTime = new Date(`1970-01-01T${appt.start_time}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        overlay.innerHTML = `
            <div class="card bg-dark text-white border-0 shadow-lg pulse-container" style="max-width:500px;width:100%;border-radius:24px;background:rgba(30,41,59,0.7)!important;border:1px solid rgba(255,255,255,0.1)!important;backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);animation:scaleUp 0.3s cubic-bezier(0.34,1.56,0.64,1) forwards;">
                <div class="card-body text-center p-5">
                    <div class="mb-4">
                        <div class="bg-emerald-soft text-emerald d-inline-flex align-items-center justify-content-center rounded-circle p-4" style="width:80px;height:80px;background:rgba(16,185,129,0.15);color:#10b981;">
                            <i class="fa-solid fa-bell bell-animation fs-1"></i>
                        </div>
                    </div>
                    <h3 class="fw-extrabold mb-2 text-white">Consultation Starting Now!</h3>
                    <p class="text-white-50 small mb-4">Your approved schedule with <strong>${sanitizeHTML(appt.partner_name)}</strong> is active.</p>
                    <div class="bg-light bg-opacity-10 p-3 rounded-4 mb-4 text-start border border-white border-opacity-10">
                        <div class="d-flex align-items-center mb-2">
                            <i class="fa-solid fa-calendar text-emerald me-3"></i>
                            <div>
                                <small class="text-white-50 d-block" style="font-size: 10px;">TIME</small>
                                <span class="fw-bold text-white small">${formattedTime} (${sanitizeHTML(appt.appointment_date)})</span>
                            </div>
                        </div>
                        <div class="d-flex align-items-center">
                            <i class="fa-solid fa-comment-dots text-emerald me-3"></i>
                            <div>
                                <small class="text-white-50 d-block" style="font-size: 10px;">PURPOSE</small>
                                <span class="text-white small">${sanitizeHTML(appt.purpose || 'General Consultation')}</span>
                            </div>
                        </div>
                    </div>
                    <div class="d-grid gap-2">
                        <a href="https://meet.jit.si/ConsulTime_${appt.id}" target="_blank" id="btnJoinAlarm" class="btn btn-emerald btn-lg rounded-pill fw-bold text-white shadow" style="background:#10b981;"><i class="fa-solid fa-video me-2"></i>Join Consultation</a>
                        <button id="btnDismissAlarm" class="btn btn-outline-light btn-lg rounded-pill fw-semibold">Dismiss Alarm</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        const dismissHandler = () => {
            this.stopLoudAlarmSound(); overlay.remove();
            const dismissed = JSON.parse(localStorage.getItem('dismissedAlarms') || '{}');
            dismissed[appt.id] = true; localStorage.setItem('dismissedAlarms', JSON.stringify(dismissed));
        };
        document.getElementById('btnDismissAlarm').addEventListener('click', dismissHandler);
        document.getElementById('btnJoinAlarm').addEventListener('click', dismissHandler);
    },

    checkConsultationAlarms: async function() {
        if (!this.user || !this.profile) return;
        try {
            const { dateStr, timeStr, hour, minute } = this.getManilaTime();
            const isStudent = this.profile.role === 'student';
            const { data, error } = await supabaseClient
                .from('appointments')
                .select("*, student:profiles!appointments_student_id_fkey(full_name), faculty:profiles!appointments_faculty_id_fkey(full_name)")
                .or(`student_id.eq.${this.user.id},faculty_id.eq.${this.user.id}`)
                .eq('status', 'approved')
                .eq('appointment_date', dateStr);
            if (error || !data) return;
            const dismissed = JSON.parse(localStorage.getItem('dismissedAlarms') || '{}');
            data.forEach(appt => {
                if (dismissed[appt.id]) return;
                const [startH, startM] = appt.start_time.split(':').map(Number);
                const [endH, endM] = appt.end_time.split(':').map(Number);
                const currentMinutes = hour * 60 + minute;
                const startMinutes = startH * 60 + startM;
                const endMinutes = endH * 60 + endM;
                if (currentMinutes >= (startMinutes - 5) && currentMinutes <= endMinutes) {
                    const partner = isStudent ? appt.faculty : appt.student;
                    const partnerName = partner ? partner.full_name : (isStudent ? 'Faculty Member' : 'Student');
                    this.showConsultationAlarmOverlay({
                        id: appt.id, appointment_date: appt.appointment_date, start_time: appt.start_time, purpose: appt.purpose, partner_name: partnerName
                    });
                }
            });
        } catch (err) { console.error("Alarm check error:", err); }
    }
};

// Expose App object globally to allow inline HTML event handlers (e.g. onclick="App.approveFaculty()") to access it
window.App = App;

// Add keyframes animation for chatbot
document.head.insertAdjacentHTML('beforeend', '<style>@keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }</style>');

document.addEventListener('DOMContentLoaded', () => App.init());
window.addEventListener('pageshow', (event) => {
    // If the browser loaded the page from the Back/Forward Cache, re-check auth state instantly
    if (event.persisted && typeof App !== 'undefined' && App.init) {
        App.initialized = false;
        App.init();
    }
});
