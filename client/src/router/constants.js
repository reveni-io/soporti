// Route paths for the whole app. Import these instead of hardcoding paths so
// links, redirects and route definitions stay in sync. Plain strings only —
// this file is also imported by the standalone landing build, which has no
// router.
export const ROUTES = {
  LANDING: '/',
  LOGIN: '/login',
  CHAT: '/chat',
  ADMIN: '/admin',
  SHARE: '/share/:shareId',
}
