// Mobile navigation toggle
document.addEventListener('DOMContentLoaded', function() {
    const mobileNavToggle = document.querySelector('.mobile-nav-toggle');
    const topNavInner = document.querySelector('.top-nav-inner');
    
    if (mobileNavToggle) {
        mobileNavToggle.addEventListener('click', function() {
            topNavInner.classList.toggle('open');
            mobileNavToggle.setAttribute('aria-expanded', 
                mobileNavToggle.getAttribute('aria-expanded') === 'false' ? 'true' : 'false');
        });
        
        // Close menu when a link is clicked
        const navLinks = topNavInner.querySelectorAll('a');
        navLinks.forEach(link => {
            link.addEventListener('click', function() {
                topNavInner.classList.remove('open');
                mobileNavToggle.setAttribute('aria-expanded', 'false');
            });
        });
    }
});
