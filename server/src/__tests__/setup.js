// OpenAI settings (API key, model, vector store id) live in the database, not
// env vars — tests that need them mock ../openai/settings.js / ../openai/client.js.
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id'
process.env.DATABASE_URL = 'postgresql://soporti:soporti@localhost:5432/soporti_test'
process.env.JWT_SECRET = 'test-jwt-secret-0123456789abcdef0123456789abcdef'
