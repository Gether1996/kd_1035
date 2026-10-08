// Dev server proxy: API, admin, sitemap, Django static files (guide icons) and uploaded files → Django. In Docker the target is the `backend` service.
const target = process.env.API_TARGET ?? 'http://localhost:8000';

export default {
  '/api': { target, secure: false },
  '/sitemap.xml': { target, secure: false },
  '/uploads': { target, secure: false },
  '/static': { target, secure: false },
  '/admin': { target, secure: false },
};
