/**
 * Provisions an admin account out-of-band. There is deliberately no API
 * endpoint for this — "become an admin" is not a privilege any HTTP
 * request should be able to grant, so it only exists as something someone
 * with shell access to the server runs by hand.
 *
 * Usage: node scripts/createAdmin.js <email> <password> <firstName> <lastName>
 */
import bcrypt from "bcrypt";
import { prisma } from "../src/config/database.js";
import { env } from "../src/config/env.js";

const [email, password, firstName, lastName] = process.argv.slice(2);

if (!email || !password || !firstName || !lastName) {
  console.error("Usage: node scripts/createAdmin.js <email> <password> <firstName> <lastName>");
  process.exit(1);
}

const passwordHash = await bcrypt.hash(password, env.BCRYPT_SALT_ROUNDS);

const user = await prisma.user.upsert({
  where: { email },
  update: { role: "ADMIN", passwordHash, isActive: true },
  create: {
    email,
    passwordHash,
    firstName,
    lastName,
    role: "ADMIN",
    isEmailVerified: true,
  },
});

console.log(`Admin ready: ${user.email} (${user.id})`);
await prisma.$disconnect();
