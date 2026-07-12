// ===================================================================
// Tutoro — shared site script (used by index.html and all /areas/ pages)
// ===================================================================

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

// Form submission (Formspree-style fetch, falls back gracefully in demo mode)
function handleFormSubmit(formId, successId){
  var form = document.getElementById(formId);
  if(!form) return;
  form.addEventListener('submit', function(e){
    e.preventDefault();
    var data = new FormData(form);
    var endpoint = form.getAttribute('action');

    // If endpoint hasn't been configured yet, just show success (demo mode)
    if(!endpoint || endpoint.indexOf('_ENDPOINT') !== -1){
      form.style.display = 'none';
      document.getElementById(successId).classList.add('show');
      return;
    }

    fetch(endpoint, {
      method: 'POST',
      body: data,
      headers: { 'Accept': 'application/json' }
    }).then(function(response){
      form.style.display = 'none';
      document.getElementById(successId).classList.add('show');
    }).catch(function(){
      form.style.display = 'none';
      document.getElementById(successId).classList.add('show');
    });
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
