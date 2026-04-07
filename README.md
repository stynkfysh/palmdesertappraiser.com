# palmdesertappraiser.com

Professional real estate appraisal website for Brian Ward Appraisal, serving Palm Desert and the Coachella Valley, California.

## Folder Structure

```
palmdesertappraiser.com/
├── index.html              # Homepage
├── appraisal-fees.html     # Services & Fees
├── service-area.html       # Service area overview with city links
├── contact.html            # Contact form (posts to /api/contact)
├── faq.html                # FAQ accordion with structured data
├── reviews.html            # Client testimonials
├── styles.css              # All site styles (single file)
├── script.js               # Nav toggle, FAQ accordion, form handler
├── sitemap.xml             # XML sitemap for search engines
├── robots.txt              # Search engine directives
├── _headers                # Cloudflare Pages custom headers (security, caching)
├── _redirects              # Cloudflare Pages redirect rules
├── areas/                  # Individual city/area pages
│   ├── palm-desert.html
│   ├── palm-springs.html
│   ├── rancho-mirage.html
│   ├── indian-wells.html
│   ├── la-quinta.html
│   ├── indio.html
│   ├── cathedral-city.html
│   ├── desert-hot-springs.html
│   ├── coachella.html
│   ├── thousand-palms.html
│   └── bermuda-dunes.html
├── functions/              # Cloudflare Pages Functions (serverless)
│   └── api/
│       └── contact.js      # Contact form handler (Resend API)
└── images/                 # Image directory (add photos here)
```

## Deploying to Cloudflare Pages

### 1. Create a Git Repository

```bash
cd palmdesertappraiser.com
git init
git add .
git commit -m "Initial site build"
git remote add origin https://github.com/YOUR_USER/palmdesertappraiser.com.git
git push -u origin main
```

### 2. Connect to Cloudflare Pages

1. Go to [Cloudflare Pages](https://dash.cloudflare.com/?to=/:account/pages)
2. Click **Create a project** → **Connect to Git**
3. Select the repository
4. Build settings:
   - **Build command:** (leave empty — static site, no build step)
   - **Build output directory:** `/` (root of the repo)
5. Click **Save and Deploy**

### 3. Set Environment Variables

In Cloudflare Pages → Settings → Environment variables, add:

| Variable | Value | Description |
|---|---|---|
| `RESEND_API_KEY` | `re_xxxxxxxx` | Your Resend API key |
| `TO_EMAIL` | `contact@brianward.com` | Where form submissions go |
| `FROM_EMAIL` | `Palm Desert Appraiser <noreply@palmdesertappraiser.com>` | Sender address (must be verified in Resend) |

### 4. Configure Custom Domain

1. In Cloudflare Pages → Custom domains → Add `www.palmdesertappraiser.com`
2. In Cloudflare DNS, ensure:
   - `palmdesertappraiser.com` → CNAME to your Pages project
   - `www.palmdesertappraiser.com` → CNAME to your Pages project
3. Enable "Always Use HTTPS" and "Auto Minify" in Cloudflare settings

### 5. Resend Setup

1. Sign up at [resend.com](https://resend.com)
2. Verify the `palmdesertappraiser.com` domain (add DNS records they provide)
3. Create an API key and add it as the `RESEND_API_KEY` environment variable

## Content Update Points

These locations are designed for easy programmatic updates (e.g., monthly scheduled tasks):

### Market Data (Homepage)
The `#market-data` section on `index.html` contains the market snapshot. Look for the comment markers:
```html
<!-- START: market-snapshot -->
...
<!-- END: market-snapshot -->
```
The `data-updated` attribute on the section tracks the last update date.

### Adding Blog Posts / Market Reports
Create a `blog.html` page and individual post pages in a `blog/` directory. The nav already uses a consistent structure that makes adding new pages straightforward.

### Image Placeholders
All image placeholder locations use the class `img-placeholder` with a `data-image` attribute describing what photo should go there. Search for these to find all locations that need photos:
```bash
grep -r "img-placeholder" --include="*.html"
```

## Design Notes

- **Color palette:** Desert-inspired — deep blue primary (#1a5276), warm gold accent (#c17f24), sand backgrounds (#f5f0e8)
- **Typography:** Georgia for headings (professional serif), system font stack for body text (fast loading)
- **No external dependencies:** Pure HTML/CSS/JS, no frameworks, no CDN dependencies
- **Mobile-first responsive:** Breakpoints at 768px and 900px
