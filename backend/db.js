// 1. VARIABLES — PostgreSQL connection configuration
import postgres from 'postgres'

const connectionString = process.env.DATABASE_URL
// 2. FUNCTIONS — postgres() creates the database client.
const sql = postgres(connectionString)

export default sql
