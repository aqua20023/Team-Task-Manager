import { loadEnv } from "./env.js";
import { openDatabase, seedDatabase } from "./db.js";

loadEnv();

const db = openDatabase();
const created = seedDatabase(db);

if (created) {
  console.log("Seeded demo data.");
  console.log("Admin: jai@example.com / password123");
  console.log("Member: aarav@example.com / password123");
} else {
  console.log("Database already has users, so seeding was skipped.");
}
