// Supabase Configuration
// Replace with your actual Supabase URL and Key
const supabaseUrl = 'https://uximseyeqkhoghsrksds.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV4aW1zZXllcWtob2doc3Jrc2RzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNjYwODksImV4cCI6MjA5NDY0MjA4OX0.5BdspRtw7IBI201E-RrqXiDJ-MDQFBpKhJlaujP-i6w';

let supabaseClient;
if (window.supabase) {
    supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
}

const App = {
    user: null,
    profile: null,
    charts: {},

    get settingsVerified() {
        return sessionStorage.getItem('ct_settings_verified') === 'true';
    },
    set settingsVerified(val) {
        sessionStorage.setItem('ct_settings_verified', val ? 'true' : 'false');
    },

    init: async function () {
        if (!supabaseClient) return;

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

        await this.checkAuthStatus();
        
        // Initialize global components
        this.initRealtime();
        if (this.profile && this.profile.role === 'student') {
            this.initChatbot();
        }

        this.routePage();
    },

    toggleDarkMode: function() {
        document.body.classList.toggle('dark-mode');
        localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
        // Re-render charts to update colors if on faculty dashboard
        if (this.profile && this.profile.role === 'faculty') {
            this.fetchFacultyRequests();
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
        if (bookForm) bookForm.addEventListener('submit', (e) => this.handleBooking(e));

        const availForm = document.getElementById('availabilityForm');
        if (availForm) availForm.addEventListener('submit', (e) => this.handleAddAvailability(e));

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
        const { data: { session } } = await supabaseClient.auth.getSession();

        if (session) {
            this.user = session.user;
            let { data: profile } = await supabaseClient
                .from('profiles')
                .select('*')
                .eq('id', this.user.id)
                .single();

            // If profile is missing from database, fall back to user_metadata to prevent crash and loss of session
            if (!profile && this.user.user_metadata) {
                profile = {
                    id: this.user.id,
                    full_name: this.user.user_metadata.full_name || 'User',
                    role: this.user.user_metadata.role || 'student',
                    department: this.user.user_metadata.department || '',
                    id_number: this.user.user_metadata.id_number || '',
                    address: this.user.user_metadata.address || '',
                    age: this.user.user_metadata.age || null,
                    email: this.user.email,
                    is_approved: true
                };
            }

            // If account is pending administrator approval
            if (profile && profile.is_approved === false) {
                await supabaseClient.auth.signOut();
                this.user = null;
                this.profile = null;
                
                const loginAlert = document.getElementById('loginAlert');
                if (loginAlert) {
                    loginAlert.innerHTML = `<i class="fa-solid fa-triangle-exclamation me-2"></i><strong>Approval Pending:</strong> Your faculty account has been registered but is currently pending administrator approval. Please wait for an administrator to activate your account.`;
                    loginAlert.classList.remove('d-none');
                } else {
                    alert("Your faculty account is currently pending administrator approval. Please wait for an administrator to activate your account.");
                }
                
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
            this.populateProfilePage();
        }
    },

    routePage: function () {
        const path = window.location.pathname;
        const isAuthPage = path.includes('login.html') || path.includes('register.html');
        const isDashboard = path.includes('dashboard.html');
        const isProfilePage = path.includes('profile.html');

        if (this.user) {
            // Safe role detection fallback
            const userRole = (this.profile && this.profile.role) || (this.user.user_metadata && this.user.user_metadata.role) || 'student';
            const dash = userRole === 'admin' ? 'admin-dashboard.html' : (userRole === 'faculty' ? 'faculty-dashboard.html' : 'student-dashboard.html');

            // Detect browser back/forward button clicks
            const navEntries = window.performance && window.performance.getEntriesByType && window.performance.getEntriesByType('navigation');
            const isBackForward = navEntries && navEntries.length > 0 && navEntries[0].type === 'back_forward';

            if (isAuthPage) {
                // If they landed here via browser back/forward buttons, force redirect back to dashboard
                if (isBackForward) {
                    window.location.replace(dash);
                } else if (document.referrer && document.referrer.includes('dashboard.html')) {
                    window.location.replace('index.html');
                } else {
                    window.location.replace(dash);
                }
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

            // Before reloading, check if there's any active presence on another session
            btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Checking Active Sessions...';
            const checkChannel = supabaseClient.channel(`presence_${data.user.id}`);
            
            checkChannel.subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    // Wait 1.2 seconds for presence state to sync from Supabase Realtime
                    setTimeout(async () => {
                        const state = checkChannel.presenceState();
                        const activeSessions = [];
                        
                        // Parse presenceState
                        Object.keys(state).forEach(key => {
                            if (state[key]) {
                                state[key].forEach(presence => {
                                    activeSessions.push(presence);
                                });
                            }
                        });

                        // Unsubscribe check channel
                        checkChannel.unsubscribe();

                        if (activeSessions.length > 0) {
                            // Account is already active elsewhere! Log out the new session
                            await supabaseClient.auth.signOut();
                            btn.innerHTML = originalText;
                            btn.disabled = false;
                            
                            // Display the prompt
                            alertBox.innerHTML = '<i class="fa-solid fa-circle-exclamation me-2"></i>This account is already logged in on another device or tab.';
                            alertBox.classList.remove('d-none');
                        } else {
                            // Proceed with login reload
                            window.location.reload();
                        }
                    }, 1200);
                }
            });
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
        const department = document.getElementById('department').value;
        const address = document.getElementById('address') ? document.getElementById('address').value : '';
        const age = document.getElementById('age') ? document.getElementById('age').value : '';
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
                        age: age
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
            alertBox.textContent = error.message;
            alertBox.classList.remove('d-none');
            btn.innerHTML = 'Register Account <i class="fa-solid fa-user-plus"></i>';
            btn.disabled = false;
        }
    },

    handleLogout: async function () {
        await supabaseClient.auth.signOut();
        window.location.replace('login.html');
    },

    trackPresence: function(userId) {
        if (!userId) return;
        
        // Subscribe to a unique realtime presence channel for this user
        this.presenceChannel = supabaseClient.channel(`presence_${userId}`, {
            config: {
                presence: {
                    key: userId
                }
            }
        });

        this.presenceChannel
            .on('presence', { event: 'sync' }, () => {
                console.log('Presence sync completed.');
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    // Track this session with a unique session ID in sessionStorage
                    let tabSessionId = sessionStorage.getItem('ct_session_id');
                    if (!tabSessionId) {
                        tabSessionId = 'sess_' + Math.random().toString(36).substring(2, 15);
                        sessionStorage.setItem('ct_session_id', tabSessionId);
                    }
                    await this.presenceChannel.track({
                        session_id: tabSessionId,
                        online_at: new Date().toISOString()
                    });
                }
            });
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

        const views = ['view-dashboard', 'view-book', 'view-history', 'view-requests', 'view-availability', 'view-profile'];
        views.forEach(v => {
            const el = document.getElementById(v);
            if (el) el.classList.add('d-none');
        });

        const targetView = document.getElementById(`view-${viewId}`);
        if (targetView) targetView.classList.remove('d-none');
    },

    // --- PROFILE LOGIC ---
    populateProfileView: function() {
        if (!document.getElementById('profileName')) return;
        
        document.getElementById('profileName').value = this.profile.full_name;
        document.getElementById('profileDept').value = this.profile.department || '';
        if (document.getElementById('profileIdNumber')) {
            document.getElementById('profileIdNumber').value = this.profile.id_number || '';
        }
        if (document.getElementById('profileAddress')) {
            document.getElementById('profileAddress').value = this.profile.address || '';
        }
        if (document.getElementById('profileAge')) {
            document.getElementById('profileAge').value = this.profile.age || '';
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
        const p = this.profile;
        const initials = p.full_name.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase();

        // Hero section
        document.getElementById('heroName').textContent = p.full_name;
        document.getElementById('heroEmail').textContent = p.email;
        document.getElementById('heroBadge').textContent = p.role.toUpperCase();
        
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

        // Edit form
        const profileNameInput = document.getElementById('profileName');
        if (profileNameInput) {
            profileNameInput.value = p.full_name;
            if (document.getElementById('profileEmail')) document.getElementById('profileEmail').value = p.email;
            if (document.getElementById('profileIdNumber')) document.getElementById('profileIdNumber').value = p.id_number || '';
            if (document.getElementById('profileDept')) document.getElementById('profileDept').value = p.department || '';
            if (document.getElementById('profileAddress')) document.getElementById('profileAddress').value = p.address || '';
            if (document.getElementById('profileAge')) document.getElementById('profileAge').value = p.age || '';
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

                const updates = {
                    full_name: document.getElementById('profileName').value,
                    department: document.getElementById('profileDept').value,
                    id_number: document.getElementById('profileIdNumber').value,
                    address: document.getElementById('profileAddress').value,
                    age: parseInt(document.getElementById('profileAge').value) || null
                };
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
        const address = document.getElementById('profileAddress') ? document.getElementById('profileAddress').value : '';
        const age = document.getElementById('profileAge') ? document.getElementById('profileAge').value : '';
        
        const updates = {
            full_name: name,
            department: dept
        };
        if (idNumber) updates.id_number = idNumber;
        if (address) updates.address = address;
        if (age) updates.age = parseInt(age);

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
                    const partnerName = appt.profiles ? appt.profiles.full_name : 'Faculty';
                    icon = appt.status === 'completed' ? 'fa-check' : (appt.status === 'approved' ? 'fa-calendar' : (appt.status === 'pending' ? 'fa-clock' : 'fa-xmark'));
                    
                    if (appt.status === 'completed') {
                        title = `Completed consultation with ${partnerName}`;
                        desc = `Topic: "${appt.purpose}" successfully resolved.`;
                    } else if (appt.status === 'approved') {
                        title = `Consultation scheduled with ${partnerName}`;
                        desc = `Confirmed for ${formatTime(appt.start_time)} - ${formatTime(appt.end_time)}.`;
                    } else if (appt.status === 'pending') {
                        title = `Requested consultation with ${partnerName}`;
                        desc = `Awaiting approval for the purpose: "${appt.purpose}".`;
                    } else {
                        title = `Consultation with ${partnerName} rejected`;
                        desc = appt.notes ? `Reason: "${appt.notes}"` : `The request was rejected or cancelled.`;
                    }
                } else {
                    // Faculty timeline
                    const partnerName = appt.profiles ? appt.profiles.full_name : 'Student';
                    icon = appt.status === 'completed' ? 'fa-check' : (appt.status === 'approved' ? 'fa-calendar' : (appt.status === 'pending' ? 'fa-clock' : 'fa-xmark'));
                    
                    if (appt.status === 'completed') {
                        title = `Completed consultation with ${partnerName}`;
                        desc = `Resolved purpose: "${appt.purpose}".`;
                    } else if (appt.status === 'approved') {
                        title = `Scheduled consultation with ${partnerName}`;
                        desc = `Time: ${formatTime(appt.start_time)} - ${formatTime(appt.end_time)}.`;
                    } else if (appt.status === 'pending') {
                        title = `New consultation request from ${partnerName}`;
                        desc = `Requested a session for: "${appt.purpose}".`;
                    } else {
                        title = `Consultation request with ${partnerName} rejected`;
                        desc = appt.notes ? `Feedback provided: "${appt.notes}"` : `Request was declined.`;
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

    // --- STUDENT DASHBOARD LOGIC ---
    loadStudentDashboard: async function () {
        this.fetchFacultyList();
        this.fetchStudentAppointments();
    },

    fetchFacultyList: async function () {
        const select = document.getElementById('facultySelect');
        if (!select) return;

        const { data, error } = await supabaseClient
            .from('profiles')
            .select('id, full_name, department')
            .eq('role', 'faculty');

        if (error) {
            console.error(error);
            return;
        }

        select.innerHTML = '<option value="" disabled selected>Select a faculty member...</option>';
        
        // Group faculty by department for a cleaner dropdown UI
        const groupedFaculty = data.reduce((acc, fac) => {
            const dept = fac.department || 'General Department';
            if (!acc[dept]) acc[dept] = [];
            acc[dept].push(fac);
            return acc;
        }, {});

        // Sort and render optgroups
        Object.keys(groupedFaculty).sort().forEach(dept => {
            let optgroup = `<optgroup label="${dept}">`;
            groupedFaculty[dept].forEach(fac => {
                optgroup += `<option value="${fac.id}">${fac.full_name}</option>`;
            });
            optgroup += `</optgroup>`;
            select.innerHTML += optgroup;
        });
    },

    handleFacultySelectChange: async function() {
        const facId = document.getElementById('facultySelect').value;
        const dateInput = document.getElementById('appointmentDate');
        const container = document.getElementById('availabilityContainer');
        const slotsDiv = document.getElementById('timeSlotsContainer');

        if (!facId) return;

        // Reset fields
        dateInput.value = '';
        dateInput.disabled = true;
        dateInput.placeholder = 'Loading calendar...';
        container.style.display = 'none';
        slotsDiv.innerHTML = '';
        document.getElementById('selectedStartTime').value = '';
        document.getElementById('selectedEndTime').value = '';

        // Fetch faculty's available days
        const { data: availability, error } = await supabaseClient
            .from('faculty_availability')
            .select('specific_date')
            .eq('faculty_id', facId)
            .gte('specific_date', new Date().toISOString().split('T')[0]);

        if (error || !availability || availability.length === 0) {
            dateInput.placeholder = 'No availability set by faculty';
            return;
        }

        const availableDates = [...new Set(availability.map(a => a.specific_date))]; 

        dateInput.disabled = false;
        dateInput.placeholder = 'Select a date...';

        // Destroy previous flatpickr instance if exists
        if (dateInput._flatpickr) {
            dateInput._flatpickr.destroy();
        }

        // Initialize Flatpickr
        flatpickr(dateInput, {
            minDate: "today",
            enable: availableDates,
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

        // Fetch Faculty Availability for this EXACT date
        const { data: availability, error } = await supabaseClient
            .from('faculty_availability')
            .select('*')
            .eq('faculty_id', facId)
            .eq('specific_date', dateVal);

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
        availability.forEach(avail => {
            let start = new Date(`1970-01-01T${avail.start_time}`);
            const end = new Date(`1970-01-01T${avail.end_time}`);

            while (start < end) {
                let slotStart = start.toTimeString().substring(0, 5);
                start.setMinutes(start.getMinutes() + 30);
                let slotEnd = start.toTimeString().substring(0, 5);

                // Check if slot is taken
                let isTaken = false;
                if (existingAppts) {
                    isTaken = existingAppts.some(appt => {
                        return appt.start_time.substring(0, 5) === slotStart;
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
            slotsDiv.innerHTML = '<div class="col-12"><div class="alert alert-info mb-0">All slots are booked for this day.</div></div>';
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
            .order('appointment_date', { ascending: false });

        if (error) return;

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

            tbody.innerHTML += `
                <tr>
                    <td class="px-4">
                        <div class="d-flex align-items-center">
                            <div class="bg-primary-soft text-primary rounded-circle d-flex align-items-center justify-content-center me-3" style="width: 36px; height: 36px;">
                                <i class="fa-solid fa-user-tie"></i>
                            </div>
                            <span class="fw-medium">${appt.profiles.full_name}</span>
                        </div>
                    </td>
                    <td>
                        <div class="fw-medium">${dateStr}</div>
                        <small class="text-muted">${formatTime(appt.start_time)} - ${formatTime(appt.end_time)}</small>
                    </td>
                    <td class="text-wrap" style="max-width: 200px;">${appt.purpose}</td>
                    <td><span class="badge status-badge ${badgeClass} text-uppercase">${appt.status}</span></td>
                    <td class="text-end px-4">
                        ${appt.status === 'pending' ? `<button class="btn btn-sm btn-outline-danger rounded-pill px-3" onclick="App.cancelAppointment('${appt.id}')">Cancel</button>` : ''}
                        ${appt.status === 'approved' ? `<a href="https://meet.jit.si/ConsulTime_${appt.id}" target="_blank" class="btn btn-sm btn-primary rounded-pill px-3 shadow-sm"><i class="fa-solid fa-video me-1"></i> Join Call</a>` : ''}
                    </td>
                </tr>
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
                        <div class="fw-bold small text-dark text-capitalize">Appointment ${a.status}</div>
                        <div class="text-muted" style="font-size: 12px;">With ${a.profiles.full_name}</div>
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
            await supabaseClient.from('appointments').update({ status: 'cancelled' }).eq('id', id);
            this.fetchStudentAppointments();
        }
    },

    // --- FACULTY DASHBOARD LOGIC ---
    loadFacultyDashboard: async function () {
        this.fetchFacultyRequests();
        this.fetchFacultyAvailability();
        
        // Init flatpickr for adding availability
        const availDate = document.getElementById('specificDate');
        if (availDate) {
            flatpickr(availDate, {
                minDate: "today"
            });
        }
    },

    fetchFacultyRequests: async function () {
        const { data, error } = await supabaseClient
            .from('appointments')
            .select('*, profiles!appointments_student_id_fkey(full_name, department)')
            .eq('faculty_id', this.user.id)
            .order('appointment_date', { ascending: true });

        if (error) return;
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
                    <button class="btn btn-sm btn-outline-primary rounded-pill px-3" onclick="App.openActionModal('${appt.id}', 'completed')">Mark Done</button>
                    <a href="https://meet.jit.si/ConsulTime_${appt.id}" target="_blank" class="btn btn-sm btn-primary rounded-pill px-3 shadow-sm ms-1"><i class="fa-solid fa-video"></i></a>
                `;
            }

            tbody.innerHTML += `
                <tr>
                    <td class="px-4">
                        <div class="d-flex align-items-center">
                            <div class="bg-accent-soft text-accent rounded-circle d-flex align-items-center justify-content-center me-3" style="width: 36px; height: 36px;">
                                ${appt.profiles.full_name.charAt(0)}
                            </div>
                            <div>
                                <div class="fw-medium text-dark">${appt.profiles.full_name}</div>
                                <div class="small text-muted" style="font-size: 11px;">${appt.profiles.department || 'Student'}</div>
                            </div>
                        </div>
                    </td>
                    <td>
                        <div class="fw-medium">${dateStr}</div>
                        <small class="text-muted">${formatTime(appt.start_time)} - ${formatTime(appt.end_time)}</small>
                    </td>
                    <td class="text-wrap text-muted small" style="max-width: 200px;">${appt.purpose}</td>
                    <td><span class="badge status-badge ${badgeClass} text-uppercase">${appt.status}</span></td>
                    <td class="text-end px-4">
                        ${actions}
                    </td>
                </tr>
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
                    html += `<li><a class="dropdown-item py-2 border-bottom" href="#" onclick="document.getElementById('nav-requests').click()">
                        <div class="fw-bold small text-dark">${a.profiles.full_name}</div>
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

    openActionModal: function (id, type) {
        document.getElementById('actionApptId').value = id;
        document.getElementById('actionType').value = type;

        let title = '';
        let desc = '';
        if (type === 'approved') { title = 'Approve Request'; desc = 'This will notify the student that the consultation is confirmed.'; }
        if (type === 'rejected') { title = 'Reject Request'; desc = 'Please provide a reason in the notes if possible.'; }
        if (type === 'completed') { title = 'Complete Consultation'; desc = 'Mark this consultation as successfully completed.'; }

        document.getElementById('actionModalTitle').textContent = title;
        document.getElementById('actionModalDesc').textContent = desc;
        document.getElementById('actionNotes').value = '';

        const modal = new bootstrap.Modal(document.getElementById('actionModal'));
        modal.show();

        document.getElementById('confirmActionBtn').onclick = async () => {
            const notes = document.getElementById('actionNotes').value;
            await supabaseClient.from('appointments').update({
                status: type,
                faculty_notes: notes
            }).eq('id', id);

            modal.hide();
            this.fetchFacultyRequests();
        };
    },

    handleAddAvailability: async function (e) {
        e.preventDefault();
        const dateVal = document.getElementById('specificDate').value;
        const start = document.getElementById('availStartTime').value;
        const end = document.getElementById('availEndTime').value;

        if (!dateVal) {
            alert("Please select a date.");
            return;
        }

        if (start >= end) {
            alert("Start time must be before end time.");
            return;
        }

        const { error } = await supabaseClient.from('faculty_availability').insert([
            {
                faculty_id: this.user.id,
                specific_date: dateVal,
                start_time: start + ':00',
                end_time: end + ':00'
            }
        ]);

        if (error) alert(error.message);
        else {
            document.getElementById('availabilityForm').reset();
            this.fetchFacultyAvailability();
        }
    },

    fetchFacultyAvailability: async function () {
        const { data, error } = await supabaseClient
            .from('faculty_availability')
            .select('*')
            .eq('faculty_id', this.user.id)
            .order('specific_date', { ascending: true })
            .order('start_time', { ascending: true });

        if (error) return;

        const tbody = document.getElementById('availabilityTableBody');
        tbody.innerHTML = '';

        // Filter out past dates (optional but recommended)
        const todayStr = new Date().toISOString().split('T')[0];
        const validData = data.filter(a => a.specific_date >= todayStr);

        validData.forEach(avail => {
            const formatTime = (time) => new Date(`1970-01-01T${time}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            const dateObj = new Date(avail.specific_date);
            const exactDateStr = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric', weekday: 'long' });

            tbody.innerHTML += `
                <tr>
                    <td>
                        <div class="fw-medium text-dark">${exactDateStr}</div>
                    </td>
                    <td>${formatTime(avail.start_time)} - ${formatTime(avail.end_time)}</td>
                    <td class="text-end">
                        <button class="btn btn-sm btn-outline-danger rounded-pill" onclick="App.deleteAvailability('${avail.id}')">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        });

        if (validData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-muted">No availability set. Students cannot book appointments.</td></tr>';
        }
    },

    deleteAvailability: async function (id) {
        if (confirm("Delete this availability slot?")) {
            await supabaseClient.from('faculty_availability').delete().eq('id', id);
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
                if (this.profile.role === 'faculty' && appt.faculty_id === this.user.id && payload.eventType === 'INSERT') {
                    sessionStorage.removeItem('notifsViewed');
                    this.showToast('New Appointment Request!', 'A student just booked a consultation.', 'success');
                    this.fetchFacultyRequests();
                }
                
                // If I am student and my booking was updated
                if (this.profile.role === 'student' && appt.student_id === this.user.id && payload.eventType === 'UPDATE') {
                    sessionStorage.removeItem('notifsViewed');
                    this.showToast('Status Updated!', 'Your appointment is now ' + appt.status + '.', 'info');
                    this.fetchStudentAppointments();
                }
            }
        )
        .subscribe();
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

            if (data.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="5" class="text-center py-5 text-muted"><i class="fa-solid fa-circle-check text-success fs-3 d-block mb-2"></i>No pending faculty approval requests.</td></tr>';
                return;
            }

            tableBody.innerHTML = '';
            data.forEach(fac => {
                const createdDate = fac.created_at ? new Date(fac.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
                tableBody.innerHTML += `
                    <tr>
                        <td class="px-4">
                            <div class="d-flex align-items-center gap-3">
                                <div class="bg-light text-primary rounded-circle d-flex align-items-center justify-content-center fw-bold" style="width: 40px; height: 40px; font-size: 14px;">
                                    ${fac.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                                </div>
                                <div>
                                    <span class="fw-bold text-dark d-block">${fac.full_name}</span>
                                    <span class="text-muted small" style="font-size: 11px;">ID: ${fac.id_number || '—'}</span>
                                </div>
                            </div>
                        </td>
                        <td>${fac.email}</td>
                        <td><span class="badge bg-light text-primary border border-primary-subtle px-3 py-2 rounded-pill font-monospace" style="font-size:11px;">${fac.department || '—'}</span></td>
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
                : `<button onclick="App.deleteUser('${u.id}', '${u.full_name.replace(/'/g, "\\'")}')" class="btn btn-sm btn-outline-danger rounded-pill px-2 py-1" style="font-size:10px;"><i class="fa-solid fa-trash-can"></i> Delete</button>`;
            
            const editBtn = `<button onclick="App.showEditUserModal('${u.id}')" class="btn btn-sm btn-primary rounded-pill px-3 py-1 me-1 text-white shadow-sm" style="font-size:10px;"><i class="fa-solid fa-user-pen"></i> Edit</button>`;

            tableBody.innerHTML += `
                <tr>
                    <td class="px-4">
                        <div class="d-flex align-items-center gap-3">
                            <div class="bg-light text-secondary rounded-circle d-flex align-items-center justify-content-center fw-bold" style="width: 40px; height: 40px; font-size: 14px;">
                                ${u.avatar ? `<img src="${u.avatar}" class="w-100 h-100 rounded-circle object-fit-cover">` : u.full_name.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase()}
                            </div>
                            <div>
                                <span class="fw-bold text-dark d-block">${u.full_name}</span>
                                <span class="text-muted small" style="font-size: 11px;">ID: ${u.id_number || '—'}</span>
                            </div>
                        </div>
                    </td>
                    <td>${u.email}</td>
                    <td><span class="badge ${badgeClass} rounded-pill px-3 py-1.5 fw-bold text-uppercase" style="font-size:10px;">${u.role}</span></td>
                    <td>${u.department || '—'}</td>
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
        document.getElementById('editUserDepartment').value = user.department || '';
        document.getElementById('editUserRole').value = user.role;
        document.getElementById('editUserIsApproved').checked = user.is_approved !== false;

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
    },

    saveEditedUser: async function(e) {
        e.preventDefault();
        const id = document.getElementById('editUserId').value;
        const fullName = document.getElementById('editUserFullName').value;
        const idNumber = document.getElementById('editUserIdNumber').value;
        const department = document.getElementById('editUserDepartment').value;
        const role = document.getElementById('editUserRole').value;
        const isApproved = role === 'faculty' ? document.getElementById('editUserIsApproved').checked : true;

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
                    is_approved: isApproved
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
    }
};

// Add keyframes animation for chatbot
document.head.insertAdjacentHTML('beforeend', '<style>@keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }</style>');

document.addEventListener('DOMContentLoaded', () => App.init());
window.addEventListener('pageshow', () => {
    // If the browser loaded the page from the Back/Forward Cache, re-check auth state instantly
    if (typeof App !== 'undefined' && App.init) {
        App.init();
    }
});
