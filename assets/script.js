// ===================================================================
// Tutoro — shared site script (used by index.html and all /areas/ pages)
// ===================================================================

// ===================================================================
// API CONNECTION
// Replace this with your real Render URL once deployed, e.g.
// 'https://tutoro-backend.onrender.com'
// ===================================================================
var TUTORO_API_BASE = 'https://tutoro-backend-zz25.onrender.com';

// Field-name mapping: HTML form field -> backend API field.
// Kept explicit and separate from the HTML so form markup never needs
// to change even if the API's field names do.
var PARENT_LEAD_FIELD_MAP = {
  name: 'name', phone: 'phone_number', grade: 'student_class',
  subject: 'subject', area: 'area', timing: 'preferred_timing',
  teaching_mode: 'teaching_mode_preference',
  email: 'email', website: 'website',
};
var TUTOR_LEAD_FIELD_MAP = {
  name: 'name', phone: 'phone_number', area: 'area',
  subjects: 'subjects', classes: 'classes',
  experience: 'experience', fee: 'expected_fee',
  email: 'email', website: 'website',
};


// Mobile nav toggle
(function(){
  var toggle = document.getElementById('navToggle');
  var links = document.getElementById('navLinks');
  if(toggle && links){
    toggle.addEventListener('click', function(){
      links.classList.toggle('open');
    });
  }
})();

// Tabs for how-it-works (only present on homepage)
document.querySelectorAll('.tab-btn').forEach(function(btn){
  btn.addEventListener('click', function(){
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

// ===================================================================
// Populate area dropdowns from the live backend catalog.
// If this fails (API not deployed yet, network issue), the static
// fallback options already in the HTML remain untouched -- the form
// still works, just without picking up any admin-side area changes.
// ===================================================================
(function () {
  var selects = document.querySelectorAll('.area-select');
  if (!selects.length) return;

  fetch(TUTORO_API_BASE + '/api/catalog/areas/')
    .then(function (res) { return res.json(); })
    .then(function (data) {
      var areas = data.results || data;
      if (!Array.isArray(areas) || !areas.length) return;

      selects.forEach(function (select) {
        var currentValue = select.value;
        select.innerHTML = '<option value="">Select your area</option>';
        areas.forEach(function (area) {
          var opt = document.createElement('option');
          opt.value = area.name;
          opt.textContent = area.name;
          select.appendChild(opt);
        });
        if (currentValue) select.value = currentValue;
      });
    })
    .catch(function () {
      // Silent fail -- static fallback options already in the HTML stay as-is.
    });
})();

function getOrCreateErrorBox(form) {
  var existing = form.querySelector('.form-error-box');
  if (existing) return existing;
  var box = document.createElement('div');
  box.className = 'form-error-box';
  box.style.cssText = 'display:none;background:#fdecea;color:#b3261e;' +
    'border:1px solid #f5c6c2;border-radius:8px;padding:10px 14px;' +
    'font-size:13.5px;margin-bottom:14px;';
  var submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.parentNode.insertBefore(box, submitBtn);
  return box;
}

var PHONE_PATTERN = /^(?:\+91|91|0)?[6-9]\d{9}$/;

function submitLead(form, endpointPath, fieldMap, successId) {
  var errorBox = getOrCreateErrorBox(form);
  var formData = new FormData(form);
  var payload = {};
  for (var htmlField in fieldMap) {
    payload[fieldMap[htmlField]] = formData.get(htmlField) || '';
  }
  // Checkboxes need explicit boolean conversion -- FormData.get returns
  // the string 'on' when checked, null when not, neither of which is a
  // real JSON boolean the backend's BooleanField expects.
  payload.consent_given = formData.get('consent') === 'on';

  errorBox.style.display = 'none';

  // Catch an obviously wrong number before it ever reaches the server --
  // same rule as the backend, so it never disagrees with what actually
  // gets accepted.
  var rawPhone = (payload.phone_number || '').replace(/\s|-/g, '');
  if (!PHONE_PATTERN.test(rawPhone)) {
    errorBox.textContent = 'Please enter a valid 10-digit Indian mobile number.';
    errorBox.style.display = 'block';
    return;
  }

  var submitBtn = form.querySelector('button[type="submit"]');
  var originalBtnText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending...';

  fetch(TUTORO_API_BASE + endpointPath, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
    .then(function (response) {
      if (response.status === 201) {
        form.style.display = 'none';
        document.getElementById(successId).classList.add('show');
        return null;
      }
      return response.json().then(function (data) { throw data; });
    })
    .catch(function (err) {
      // Show the backend's actual validation message when we have one
      // (e.g. "that area isn't supported yet") rather than a generic error.
      var message = 'Something went wrong. Please try WhatsApp instead.';
      if (err && typeof err === 'object') {
        var firstKey = Object.keys(err)[0];
        if (firstKey && Array.isArray(err[firstKey])) {
          message = err[firstKey][0];
        }
      }
      errorBox.textContent = message;
      errorBox.style.display = 'block';
    })
    .finally(function () {
      submitBtn.disabled = false;
      submitBtn.textContent = originalBtnText;
    });
}

function handleFormSubmit(formId, successId) {
  var form = document.getElementById(formId);
  if (!form) return;

  var isParentForm = formId === 'parentForm';
  var endpointPath = isParentForm ? '/api/leads/parent/' : '/api/leads/tutor/';
  var fieldMap = isParentForm ? PARENT_LEAD_FIELD_MAP : TUTOR_LEAD_FIELD_MAP;

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    submitLead(form, endpointPath, fieldMap, successId);
  });
}
handleFormSubmit('parentForm', 'parentSuccess');
handleFormSubmit('tutorForm', 'tutorSuccess');

// ===================================================================
// GEO-DETECTION (homepage only — silent, no permission prompt)
//
// Uses a free IP-lookup API to guess the visitor's city, purely client-side.
// This works on GitHub Pages since it's just JS running in the visitor's
// own browser — no server of ours involved.
//
// Behavior:
//  - If we can't detect a city (blocked, offline, ad-blocker, API down),
//    we fail silently. Nothing breaks, nothing shows.
//  - If detected city is Hyderabad, we leave the page as-is (that's who
//    the whole site is built for right now).
//  - If detected city is anything else, we show a small dismissible
//    banner inviting them to register interest for when we expand,
//    instead of just losing them.
//  - Dismissal is remembered for the browser session only.
// ===================================================================
(function(){
  var banner = document.getElementById('geoBanner');
  if(!banner) return; // banner only exists on homepage

  if(sessionStorage.getItem('tutoro_geo_dismissed') === '1') return;

  fetch('https://ipapi.co/json/')
    .then(function(res){ return res.json(); })
    .then(function(data){
      var city = (data && data.city) ? data.city.trim() : '';
      if(!city) return;

      if(city.toLowerCase() !== 'hyderabad'){
        banner.innerHTML =
          '📍 Looks like you\'re browsing from <strong>' + city + '</strong> — ' +
          'Tutoro is currently live in Hyderabad only, but expanding soon. ' +
          '<a href="#for-tutors">Register your interest</a>' +
          '<button class="geo-close" aria-label="Dismiss">✕</button>';
        banner.style.display = 'flex';

        var closeBtn = banner.querySelector('.geo-close');
        if(closeBtn){
          closeBtn.addEventListener('click', function(){
            banner.style.display = 'none';
            sessionStorage.setItem('tutoro_geo_dismissed', '1');
          });
        }
      }
    })
    .catch(function(){
      // Silent fail — no banner, no error shown to visitor
    });
})();


// ===================================================================
// LIVE MATCH CARD — per-area, fetched from the real backend.
// Falls back silently to the static placeholder already in the HTML
// if the API is unreachable or returns nothing.
// ===================================================================
(function () {
  var cards = document.querySelectorAll('.route-card[data-area]');
  if (!cards.length) return;

  cards.forEach(function (card) {
    var areaName = card.getAttribute('data-area');
    fetch(TUTORO_API_BASE + '/api/matching/recent-match/?area=' + encodeURIComponent(areaName))
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var studentNameEl = card.querySelector('#liveMatchStudentName') || card.querySelector('[id$="StudentName"]');
        var studentDetailEl = card.querySelector('#liveMatchStudentDetail') || card.querySelector('[id$="StudentDetail"]');
        var tutorNameEl = card.querySelector('#liveMatchTutorName') || card.querySelector('[id$="TutorName"]');
        var tutorDetailEl = card.querySelector('#liveMatchTutorDetail') || card.querySelector('[id$="TutorDetail"]');
        var distanceEl = card.querySelector('#liveMatchDistance') || card.querySelector('[id$="Distance"]');
        var verifiedEl = card.querySelector('#liveMatchVerified') || card.querySelector('[id$="Verified"]');

        if (studentNameEl) studentNameEl.textContent = data.student_display_name;
        if (studentDetailEl) studentDetailEl.textContent =
          data.student_class_display + ' · ' + data.subject + ' · ' + data.area_name;

        if (tutorNameEl) tutorNameEl.textContent = data.tutor_name;
        if (tutorDetailEl) tutorDetailEl.textContent =
          data.tutor_qualification + ' · ' + data.tutor_experience_years + ' yrs · ' + data.area_name;

        if (distanceEl) {
          var distText = (data.distance_km !== null && data.distance_km !== undefined)
            ? data.distance_km + ' KM' : 'NEARBY';
          distanceEl.innerHTML = distText + '<span>apart</span>';
        }
        if (verifiedEl) {
          verifiedEl.innerHTML = (data.tutor_verified ? 'VERIFIED' : 'IN REVIEW') + '<span>tutor ID checked</span>';
        }
      })
      .catch(function () {
        // Silent fail — static placeholder already in the HTML stays as-is.
      });
  });
})();

// ===================================================================
// REVIEWS — pulls published reviews from the live backend and renders
// them as cards. Silent no-op if the section isn't on the page, or if
// there simply aren't any published reviews yet (expected early on,
// since every review starts unpublished until AI/staff moderation
// approves it — see apps.reviews).
// ===================================================================
(function () {
  var grid = document.getElementById('reviewsGrid');
  var emptyMsg = document.getElementById('reviewsEmpty');
  if (!grid) return;

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function starString(rating) {
    var n = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
    return '★★★★★☆☆☆☆☆'.slice(5 - n, 10 - n);
  }

  fetch(TUTORO_API_BASE + '/api/reviews/')
    .then(function (res) { return res.json(); })
    .then(function (data) {
      var reviews = data.results || data;
      if (!Array.isArray(reviews) || !reviews.length) {
        if (emptyMsg) emptyMsg.textContent = "We're just getting started — reviews will show up here as demo classes complete.";
        return;
      }
      grid.innerHTML = '';
      reviews.slice(0, 6).forEach(function (review) {
        var card = document.createElement('div');
        card.className = 'review-card';
        card.innerHTML =
          '<div class="stars">' + starString(review.rating) + '</div>' +
          '<p>' + escapeHtml(review.comment || 'Great experience with Tutoro.') + '</p>' +
          '<div class="review-meta"><strong>' + escapeHtml(review.reviewer_name || 'Parent') +
          '</strong> · tutor ' + escapeHtml(review.tutor_name || '') + '</div>';
        grid.appendChild(card);
      });
    })
    .catch(function () {
      // Silent fail -- the section quietly stays on its loading text
      // rather than showing a broken/error state to visitors.
      if (emptyMsg) emptyMsg.textContent = "Couldn't load reviews right now.";
    });
})();

// ===================================================================
// FAQ CHATBOT — talks to POST /api/ai/faq/ (Claude, answers grounded
// only in Tutoro's own facts server-side). Stateless by design, same
// as the backend: no history is sent, each question stands alone.
// ===================================================================
(function () {
  var form = document.getElementById('faqChatForm');
  var input = document.getElementById('faqChatInput');
  var log = document.getElementById('faqChatLog');
  if (!form || !input || !log) return;

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function addMessage(text, cls) {
    var msg = document.createElement('div');
    msg.className = 'faq-chat-msg ' + cls;
    msg.innerHTML = escapeHtml(text);
    log.appendChild(msg);
    log.scrollTop = log.scrollHeight;
    return msg;
  }

  var busy = false;

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) return;

    var question = input.value.trim();
    if (!question) return;

    addMessage(question, 'user');
    input.value = '';
    var pending = addMessage('Thinking…', 'bot pending');

    busy = true;
    input.disabled = true;

    fetch(TUTORO_API_BASE + '/api/ai/faq/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: question }),
    })
      .then(function (res) {
        if (!res.ok) return res.json().then(function (d) { throw d; });
        return res.json();
      })
      .then(function (data) {
        pending.textContent = data.answer;
        pending.classList.remove('pending');
      })
      .catch(function (err) {
        var message = (err && err.detail) || "Couldn't get an answer right now. Please try again shortly.";
        pending.textContent = message;
        pending.classList.remove('pending');
        pending.classList.add('error');
      })
      .finally(function () {
        busy = false;
        input.disabled = false;
        input.focus();
      });
  });
})();

// ===================================================================
// AUTH MODAL — login / signup / session state.
//
// This was previously dead markup: the modal HTML existed but nothing
// opened it, submitted the forms, or talked to the backend. This is
// the missing wiring.
//
// Session storage: uses localStorage (not sessionStorage) so a login
// persists across tabs/visits, same as any normal website login --
// this is a real deployed site, not a Claude-artifact sandbox, so
// localStorage is the correct tool here.
// ===================================================================
(function () {
  var navBtn = document.getElementById('authNavBtn');
  var overlay = document.getElementById('authModalOverlay');
  var closeBtn = document.getElementById('authModalClose');
  if (!navBtn || !overlay || !closeBtn) return; // not present on this page

  var TOKEN_KEY = 'tutoro_access_token';
  var REFRESH_KEY = 'tutoro_refresh_token';
  var USER_KEY = 'tutoro_user';

  function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); }
    catch (e) { return null; }
  }
  function setSession(access, refresh, user) {
    localStorage.setItem(TOKEN_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
  }

  function showPanel(panelSuffix) {
    document.querySelectorAll('.auth-panel').forEach(function (p) { p.classList.remove('active'); });
    var target = document.getElementById('authPanel-' + panelSuffix);
    if (target) target.classList.add('active');
    document.querySelectorAll('.auth-tab-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.authTab === panelSuffix);
    });
  }

  function refreshNavBtnLabel() {
    var user = getUser();
    navBtn.textContent = user ? (user.full_name || user.email || 'Account') : 'Log in';
  }

  function openModal() {
    var user = getUser();
    if (user) {
      var details = document.getElementById('accountDetails');
      if (details) {
        details.innerHTML =
          '<p><strong>' + (user.full_name || '') + '</strong></p>' +
          '<p style="color:var(--text-muted);">' + (user.email || '') + '</p>' +
          '<p style="color:var(--text-muted);text-transform:capitalize;">' + (user.role || '').toLowerCase() + ' account</p>';
      }
      renderVerifyEmailBox(user);
      renderDashboard(user);
      showPanel('account');
      // account panel isn't a tab, so clear tab active state
      document.querySelectorAll('.auth-tab-btn').forEach(function (b) { b.classList.remove('active'); });
    } else {
      showPanel('login');
    }
    overlay.classList.add('open');
  }
  function closeModal() { overlay.classList.remove('open'); }

  // ---- ACCOUNT DASHBOARD (account panel) ----
  // The whole reason login previously had no visible destination:
  // nothing ever pulled StudentRequest/Assignment/profile data back
  // into the page after auth succeeded. This is that wiring —
  // parents see their own requests, tutors see their own profile +
  // assignments, both read-only (creating/editing those things still
  // happens through the existing lead forms / staff coordination).

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  // Groups the many backend status values into three visual buckets
  // so the badge styling doesn't need one CSS rule per enum value.
  var STATUS_GROUPS = {
    // StudentRequest.Status
    OPEN: 'pending', MATCHED: 'active', DEMO_SCHEDULED: 'active',
    CONVERTED: 'active', CLOSED: 'closed', CANCELLED: 'closed',
    // Assignment.Status
    PROPOSED: 'pending', DEMO_COMPLETED: 'active', ACCEPTED: 'active',
    DECLINED: 'closed', ENDED: 'closed',
  };
  function statusPill(statusCode, statusLabel) {
    var group = STATUS_GROUPS[statusCode] || 'pending';
    return '<span class="status-pill status-pill--' + group + '">' + escapeHtml(statusLabel || statusCode || '') + '</span>';
  }

  // Subjects only come back as bare IDs on StudentRequest (unlike
  // Assignment, which already resolves subject names server-side) --
  // fetched once and cached so every request card doesn't re-fetch.
  var subjectsCache = null;
  function loadSubjectsMap() {
    if (subjectsCache) return Promise.resolve(subjectsCache);
    return fetch(TUTORO_API_BASE + '/api/catalog/subjects/')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var list = data.results || data;
        var map = {};
        (Array.isArray(list) ? list : []).forEach(function (s) { map[s.id] = s.name; });
        subjectsCache = map;
        return map;
      })
      .catch(function () { return {}; });
  }

  function renderDashboard(user) {
    var container = document.getElementById('dashboardSection');
    if (!container) return;
    container.innerHTML = '<p class="dashboard-loading">Loading...</p>';

    if (user.role === 'PARENT') {
      renderParentDashboard(container);
    } else if (user.role === 'TUTOR') {
      renderTutorDashboard(container);
    } else {
      container.innerHTML = '';
    }
  }

  function renderParentDashboard(container) {
    Promise.all([
      authFetch('/api/matching/requests/').then(function (res) { return res.json(); }),
      loadSubjectsMap(),
    ])
      .then(function (results) {
        var data = results[0], subjectsMap = results[1];
        var requests = data.results || data;
        if (!Array.isArray(requests)) throw new Error('unexpected response');

        var html = '<h4>Your tutoring requests</h4>';
        if (!requests.length) {
          html += '<p class="dashboard-empty">You haven\'t submitted a tutoring request yet. Use the "Find a tutor" form to get started.</p>';
        } else {
          html += requests.map(function (r) {
            var subjectNames = (r.subjects || []).map(function (id) { return subjectsMap[id]; }).filter(Boolean).join(', ');
            return (
              '<div class="dash-card">' +
                '<div class="dash-card-top">' +
                  '<span class="dash-card-title">' + escapeHtml(r.student_name) + '</span>' +
                  statusPill(r.status) +
                '</div>' +
                '<p class="dash-card-sub">' + escapeHtml(subjectNames || 'Subjects not set') + ' · ' + escapeHtml(r.area_name || '') + '</p>' +
                '<div class="dash-card-meta">Requested ' + formatDate(r.created_at) + '</div>' +
              '</div>'
            );
          }).join('');
        }
        container.innerHTML = html;
      })
      .catch(function () {
        container.innerHTML = '<h4>Your tutoring requests</h4><p class="dashboard-error">Couldn\'t load your requests right now.</p>';
      });
  }

  function renderTutorDashboard(container) {
    Promise.all([
      authFetch('/api/profiles/tutors/me/').then(function (res) { return res.json(); }),
      authFetch('/api/matching/assignments/me/').then(function (res) { return res.json(); }),
    ])
      .then(function (results) {
        var profile = results[0];
        var assignmentsData = results[1];
        var assignments = assignmentsData.results || assignmentsData;
        if (!Array.isArray(assignments)) assignments = [];

        var verified = profile.verification_status === 'VERIFIED';
        var html = '<h4>Your profile</h4>' +
          '<div class="dash-card">' +
            '<div class="dash-profile-row"><span>Verification</span><span>' +
              (verified ? '✓ Verified' : escapeHtml(profile.verification_status || 'Pending')) + '</span></div>' +
            '<div class="dash-profile-row"><span>Accepting students</span><span>' + (profile.is_accepting_students ? 'Yes' : 'No') + '</span></div>' +
            '<div class="dash-profile-row"><span>Rating</span><span>' +
              (profile.total_reviews ? (Number(profile.rating_avg || 0).toFixed(1) + ' ★ (' + profile.total_reviews + ')') : 'No reviews yet') + '</span></div>' +
          '</div>';

        html += '<h4>Your assignments</h4>';
        if (!assignments.length) {
          html += '<p class="dashboard-empty">No students matched yet — once Tutoro pairs you with a family, it\'ll show up here.</p>';
        } else {
          html += assignments.map(function (a) {
            return (
              '<div class="dash-card">' +
                '<div class="dash-card-top">' +
                  '<span class="dash-card-title">' + escapeHtml(a.student_name) + '</span>' +
                  statusPill(a.status, a.status_display) +
                '</div>' +
                '<p class="dash-card-sub">' + escapeHtml((a.subjects || []).join(', ') || 'Subjects not set') +
                  ' · ' + escapeHtml(a.student_class || '') + ' · ' + escapeHtml(a.area_name || '') + '</p>' +
                '<div class="dash-card-meta">Matched ' + formatDate(a.created_at) + '</div>' +
              '</div>'
            );
          }).join('');
        }
        container.innerHTML = html;
      })
      .catch(function () {
        container.innerHTML = '<p class="dashboard-error">Couldn\'t load your dashboard right now.</p>';
      });
  }

  // ---- EMAIL VERIFICATION (account panel) ----
  var verifyEmailBox = document.getElementById('verifyEmailBox');
  var verifyEmailBadge = document.getElementById('verifyEmailBadge');
  var verifyRequestForm = document.getElementById('verifyRequestForm');
  var verifyConfirmForm = document.getElementById('verifyConfirmForm');
  var resendVerifyCodeBtn = document.getElementById('resendVerifyCodeBtn');

  function authFetch(path, options) {
    options = options || {};
    options.headers = options.headers || {};
    options.headers['Content-Type'] = 'application/json';
    var token = localStorage.getItem(TOKEN_KEY);
    if (token) options.headers['Authorization'] = 'Bearer ' + token;
    return fetch(TUTORO_API_BASE + path, options);
  }

  function renderVerifyEmailBox(user) {
    if (!verifyEmailBox || !verifyEmailBadge) return;
    if (user.is_verified) {
      verifyEmailBadge.textContent = '✓ Email verified';
      verifyEmailBadge.className = 'verify-badge verified';
      if (verifyRequestForm) verifyRequestForm.style.display = 'none';
      if (verifyConfirmForm) verifyConfirmForm.style.display = 'none';
    } else {
      verifyEmailBadge.textContent = 'Email not verified yet';
      verifyEmailBadge.className = 'verify-badge unverified';
      if (verifyConfirmForm) verifyConfirmForm.style.display = 'none';
      if (verifyRequestForm) verifyRequestForm.style.display = 'block';
    }
  }

  function requestVerifyCode(form) {
    var submitBtn = form.querySelector('button[type="submit"]');
    var original = submitBtn ? submitBtn.textContent : '';
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Sending...'; }

    return authFetch('/api/auth/otp/request/', { method: 'POST' })
      .then(function (res) {
        if (!res.ok) return res.json().then(function (d) { throw d; });
        return res.json();
      })
      .then(function () {
        if (verifyRequestForm) verifyRequestForm.style.display = 'none';
        if (verifyConfirmForm) {
          verifyConfirmForm.style.display = 'block';
          verifyConfirmForm.reset();
        }
      })
      .catch(function (err) {
        showFormError(form, (err && err.detail) || "Couldn't send the code right now. Please try again shortly.");
      })
      .finally(function () {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = original; }
      });
  }

  if (verifyRequestForm) {
    verifyRequestForm.addEventListener('submit', function (e) {
      e.preventDefault();
      requestVerifyCode(verifyRequestForm);
    });
  }
  if (resendVerifyCodeBtn) {
    resendVerifyCodeBtn.addEventListener('click', function () {
      requestVerifyCode(verifyConfirmForm);
    });
  }
  if (verifyConfirmForm) {
    verifyConfirmForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = new FormData(verifyConfirmForm);
      var submitBtn = verifyConfirmForm.querySelector('button[type="submit"]');
      var original = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Verifying...';

      authFetch('/api/auth/otp/verify/', {
        method: 'POST',
        body: JSON.stringify({ code: data.get('code') }),
      })
        .then(function (res) {
          if (!res.ok) return res.json().then(function (d) { throw d; });
          return res.json();
        })
        .then(function () {
          var user = getUser();
          if (user) {
            user.is_verified = true;
            localStorage.setItem(USER_KEY, JSON.stringify(user));
            renderVerifyEmailBox(user);
          }
        })
        .catch(function (err) {
          showFormError(verifyConfirmForm, (err && err.detail) || 'That code is invalid or has expired.');
        })
        .finally(function () {
          submitBtn.disabled = false;
          submitBtn.textContent = original;
        });
    });
  }

  navBtn.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });

  document.querySelectorAll('.auth-tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () { showPanel(btn.dataset.authTab); });
  });

  document.querySelectorAll('.auth-role-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.auth-role-btn').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      document.querySelectorAll('.auth-role-form').forEach(function (f) { f.classList.remove('active'); });
      var form = document.getElementById(btn.dataset.role + 'SignupForm');
      if (form) form.classList.add('active');
    });
  });

  var logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      clearSession();
      refreshNavBtnLabel();
      closeModal();
    });
  }

  function showFormError(form, message) {
    var box = form.querySelector('.auth-form-error');
    if (!box) {
      box = document.createElement('div');
      box.className = 'auth-form-error';
      box.style.cssText = 'background:#fdecea;color:#b3261e;border:1px solid #f5c6c2;' +
        'border-radius:8px;padding:9px 12px;font-size:13px;margin-bottom:12px;';
      form.insertBefore(box, form.firstChild);
    }
    box.textContent = message;
    box.style.display = 'block';
  }

  function firstErrorMessage(err) {
    if (!err || typeof err !== 'object') return 'Something went wrong. Please try again.';
    var firstKey = Object.keys(err)[0];
    if (!firstKey) return 'Something went wrong. Please try again.';
    var val = err[firstKey];
    return Array.isArray(val) ? val[0] : String(val);
  }

  // ---- LOGIN ----
  var loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = new FormData(loginForm);
      var submitBtn = loginForm.querySelector('button[type="submit"]');
      var original = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Logging in...';

      fetch(TUTORO_API_BASE + '/api/auth/login/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: data.get('email'), password: data.get('password') }),
      })
        .then(function (res) {
          if (!res.ok) return res.json().then(function (d) { throw d; });
          return res.json();
        })
        .then(function (tokens) {
          // JWT payload carries role/email; a minimal decode avoids an
          // extra round trip just to greet the user by name.
          var payload = JSON.parse(atob(tokens.access.split('.')[1]));
          setSession(tokens.access, tokens.refresh, {
            email: payload.email || data.get('email'),
            role: payload.role || '',
            full_name: payload.full_name || '',
            is_verified: !!payload.is_verified,
          });
          refreshNavBtnLabel();
          closeModal();
          loginForm.reset();
        })
        .catch(function (err) {
          showFormError(loginForm, err.detail || 'Incorrect email or password.');
        })
        .finally(function () {
          submitBtn.disabled = false;
          submitBtn.textContent = original;
        });
    });
  }

  // ---- SIGNUP: shared submit handler for parent/tutor ----
  function handleSignup(formId, endpointPath, buildPayload) {
    var form = document.getElementById(formId);
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = new FormData(form);
      var submitBtn = form.querySelector('button[type="submit"]');
      var original = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating account...';

      fetch(TUTORO_API_BASE + endpointPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(data, form)),
      })
        .then(function (res) {
          if (!res.ok) return res.json().then(function (d) { throw d; });
          return res.json();
        })
        .then(function () {
          // Auto-login right after signup so the person doesn't have
          // to type their password twice in one sitting.
          return fetch(TUTORO_API_BASE + '/api/auth/login/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: data.get('email'), password: data.get('password') }),
          }).then(function (res) { return res.json(); });
        })
        .then(function (tokens) {
          var payload = JSON.parse(atob(tokens.access.split('.')[1]));
          setSession(tokens.access, tokens.refresh, {
            email: payload.email || data.get('email'),
            role: payload.role || '',
            full_name: data.get('full_name') || '',
            is_verified: !!payload.is_verified,
          });
          refreshNavBtnLabel();
          closeModal();
          form.reset();
        })
        .catch(function (err) {
          showFormError(form, firstErrorMessage(err));
        })
        .finally(function () {
          submitBtn.disabled = false;
          submitBtn.textContent = original;
        });
    });
  }

  // ---- FORGOT / RESET PASSWORD ----
  var resetRequestForm = document.getElementById('resetRequestForm');
  var resetConfirmForm = document.getElementById('resetConfirmForm');
  var showResetPanelBtn = document.getElementById('showResetPanelBtn');
  var backToLoginBtn = document.getElementById('backToLoginBtn');
  var resendResetCodeBtn = document.getElementById('resendResetCodeBtn');
  var resetConfirmEmailEl = document.getElementById('resetConfirmEmail');
  var lastResetEmail = '';

  function showResetRequestStep() {
    if (resetConfirmForm) resetConfirmForm.style.display = 'none';
    if (resetRequestForm) resetRequestForm.style.display = 'block';
  }
  function showResetConfirmStep(email) {
    lastResetEmail = email;
    if (resetConfirmEmailEl) resetConfirmEmailEl.textContent = email;
    if (resetRequestForm) resetRequestForm.style.display = 'none';
    if (resetConfirmForm) {
      resetConfirmForm.style.display = 'block';
      resetConfirmForm.reset();
    }
  }

  if (showResetPanelBtn) {
    showResetPanelBtn.addEventListener('click', function () {
      showResetRequestStep();
      if (resetRequestForm) resetRequestForm.reset();
      showPanel('reset');
      document.querySelectorAll('.auth-tab-btn').forEach(function (b) { b.classList.remove('active'); });
    });
  }
  if (backToLoginBtn) {
    backToLoginBtn.addEventListener('click', function () { showPanel('login'); });
  }

  function requestResetCode(email, form) {
    var submitBtn = form.querySelector('button[type="submit"]');
    var original = submitBtn ? submitBtn.textContent : '';
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Sending...'; }

    return fetch(TUTORO_API_BASE + '/api/auth/password-reset/request/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email }),
    })
      .then(function (res) { return res.json().catch(function () { return {}; }); })
      .then(function () {
        // Backend always returns the same generic message whether or
        // not the account exists (by design, to prevent email
        // enumeration) -- so we always advance to the code-entry step.
        showResetConfirmStep(email);
      })
      .catch(function () {
        showFormError(form, "Couldn't send the code right now. Please try again shortly.");
      })
      .finally(function () {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = original; }
      });
  }

  if (resetRequestForm) {
    resetRequestForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = new FormData(resetRequestForm).get('email');
      requestResetCode(email, resetRequestForm);
    });
  }

  if (resendResetCodeBtn) {
    resendResetCodeBtn.addEventListener('click', function () {
      if (!lastResetEmail) return;
      requestResetCode(lastResetEmail, resetConfirmForm);
    });
  }

  if (resetConfirmForm) {
    resetConfirmForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = new FormData(resetConfirmForm);
      var submitBtn = resetConfirmForm.querySelector('button[type="submit"]');
      var original = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Resetting...';

      fetch(TUTORO_API_BASE + '/api/auth/password-reset/confirm/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: lastResetEmail,
          code: data.get('code'),
          new_password: data.get('new_password'),
        }),
      })
        .then(function (res) {
          if (!res.ok) return res.json().then(function (d) { throw d; });
          return res.json();
        })
        .then(function () {
          showResetRequestStep();
          showPanel('login');
          document.querySelectorAll('.auth-tab-btn').forEach(function (b) {
            b.classList.toggle('active', b.dataset.authTab === 'login');
          });
          if (loginForm) {
            loginForm.reset();
            var emailField = loginForm.querySelector('input[name="email"]');
            if (emailField) emailField.value = lastResetEmail;
            showFormError(loginForm, 'Password reset. Please log in with your new password.');
            var errBox = loginForm.querySelector('.auth-form-error');
            if (errBox) {
              errBox.style.background = '#eaf6ee';
              errBox.style.color = '#1e6b3a';
              errBox.style.borderColor = '#c9e9d3';
            }
          }
        })
        .catch(function (err) {
          showFormError(resetConfirmForm, (err && err.detail) || 'That code is invalid or has expired.');
        })
        .finally(function () {
          submitBtn.disabled = false;
          submitBtn.textContent = original;
        });
    });
  }

  handleSignup('parentSignupForm', '/api/auth/register/parent/', function (data) {
    var payload = {
      email: data.get('email'),
      phone_number: data.get('phone_number'),
      password: data.get('password'),
      full_name: data.get('full_name'),
      area: data.get('area'),
      student_class: data.get('student_class') || '',
      budget_fee: data.get('budget_fee') || '',
    };
    // Only send timings the parent actually picked -- an empty string
    // isn't a valid TimeField value, so it must stay out of the
    // payload entirely rather than being sent as ''.
    var startTime = data.get('preferred_start_time');
    var endTime = data.get('preferred_end_time');
    if (startTime) payload.preferred_start_time = startTime;
    if (endTime) payload.preferred_end_time = endTime;
    return payload;
  });

  handleSignup('tutorSignupForm', '/api/auth/register/tutor/', function (data, form) {
    var areaCheckboxes = form.querySelectorAll('.area-checkbox-group input[type="checkbox"]:checked');
    // Tutor types subjects freely (e.g. "Maths, Physics, English") --
    // split on commas, trim whitespace, and drop empty entries from a
    // trailing/leading comma. The backend matches each name against
    // the subject catalog and creates it if it's new.
    var subjectsText = data.get('subjects') || '';
    var subjects = subjectsText.split(',')
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 0; });
    return {
      email: data.get('email'),
      phone_number: data.get('phone_number'),
      password: data.get('password'),
      full_name: data.get('full_name'),
      subjects: subjects,
      preferred_areas: Array.from(areaCheckboxes).map(function (c) { return c.value; }),
      experience_years: data.get('experience_years') || 0,
      expected_fee: data.get('expected_fee') || null,
    };
  });

  // ---- Populate the parent signup area <select> and the tutor
  // signup area checkboxes from the live backend catalog. ----
  fetch(TUTORO_API_BASE + '/api/catalog/areas/')
    .then(function (res) { return res.json(); })
    .then(function (data) {
      var areas = data.results || data;
      if (!Array.isArray(areas)) return;

      document.querySelectorAll('.area-select-id').forEach(function (select) {
        areas.forEach(function (area) {
          var opt = document.createElement('option');
          opt.value = area.id;
          opt.textContent = area.name;
          select.appendChild(opt);
        });
      });

      document.querySelectorAll('.area-checkbox-group').forEach(function (group) {
        areas.forEach(function (area, i) {
          var id = group.id ? group.id + '-' + i : 'areaCheckbox-' + i + '-' + Math.random().toString(36).slice(2);
          var label = document.createElement('label');
          label.className = 'checkbox-option';
          var input = document.createElement('input');
          input.type = 'checkbox';
          input.name = 'preferred_areas';
          input.value = area.id;
          input.id = id;
          label.setAttribute('for', id);
          label.appendChild(input);
          label.appendChild(document.createTextNode(area.name));
          group.appendChild(label);
        });
      });
    })
    .catch(function () { /* signup form falls back to no options; user sees an empty list rather than a crash */ });

  // ---- Populate the "required timings" hour dropdowns (parent
  // signup) with hourly slots covering typical tuition hours. ----
  (function () {
    var HOURS = []; // 6 AM through 9 PM start, so the last class can still run to 10 PM
    for (var h = 6; h <= 22; h++) {
      var value = (h < 10 ? '0' + h : h) + ':00';
      var label = (h % 12 === 0 ? 12 : h % 12) + ':00 ' + (h < 12 || h === 24 ? 'AM' : 'PM');
      HOURS.push({ value: value, label: label });
    }
    document.querySelectorAll('.hour-select-start, .hour-select-end').forEach(function (select) {
      var placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = select.classList.contains('hour-select-start') ? 'Starting hour' : 'Ending hour';
      select.appendChild(placeholder);
      HOURS.forEach(function (hour) {
        var opt = document.createElement('option');
        opt.value = hour.value;
        opt.textContent = hour.label;
        select.appendChild(opt);
      });
    });
  })();

  refreshNavBtnLabel();
})();
