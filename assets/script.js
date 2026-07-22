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
