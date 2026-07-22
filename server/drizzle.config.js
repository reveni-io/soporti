import { defineConfig } from 'drizzle-kit'
import dotenv from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../.env') })

// Drizzle Kit config: used by `npm run db:generate` (create migration SQL from
// the schema) and `npm run db:migrate` (apply them). The server also applies
// pending migrations on boot via runMigrations() in src/db/index.js.
export default defineConfig({
  schema: './src/db/schema.js',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || '',
  },
})
