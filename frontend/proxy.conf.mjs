// Dev server proxy: /api → Django. In Docker the target is the `backend` service.
export default {
  '/api': {
    target: process.env.API_TARGET ?? 'http://localhost:8000',
    secure: false,
  },
};
