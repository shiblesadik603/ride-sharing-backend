import { describe, it, expect, afterAll } from "@jest/globals";
import { prisma } from "../../src/config/database.js";
import * as tokenRepository from "../../src/repositories/token.repository.js";
import { createTestPassenger, deleteTestUser } from "../helpers/factories.js";

afterAll(async () => {
  await prisma.$disconnect();
});

describe("token.repository cleanup queries (integration, real Postgres)", () => {
  it("deleteExpiredRefreshTokens removes only expired or revoked rows, keeps valid ones", async () => {
    const user = await createTestPassenger();
    const hour = 60 * 60 * 1000;

    const valid = await tokenRepository.createRefreshToken({
      userId: user.id,
      tokenHash: `valid-${user.id}`,
      expiresAt: new Date(Date.now() + hour),
    });
    const expired = await tokenRepository.createRefreshToken({
      userId: user.id,
      tokenHash: `expired-${user.id}`,
      expiresAt: new Date(Date.now() - hour),
    });
    const revoked = await tokenRepository.createRefreshToken({
      userId: user.id,
      tokenHash: `revoked-${user.id}`,
      expiresAt: new Date(Date.now() + hour), // not expired, but revoked
    });
    await tokenRepository.revokeRefreshToken(revoked.id);

    await tokenRepository.deleteExpiredRefreshTokens();

    const remaining = await prisma.refreshToken.findMany({ where: { userId: user.id } });
    const remainingIds = remaining.map((t) => t.id);

    expect(remainingIds).toContain(valid.id);
    expect(remainingIds).not.toContain(expired.id);
    expect(remainingIds).not.toContain(revoked.id);

    await deleteTestUser(user.id);
  });

  it("deleteExpiredVerificationTokens removes only expired or used rows, keeps valid ones", async () => {
    const user = await createTestPassenger();
    const hour = 60 * 60 * 1000;

    const valid = await tokenRepository.createVerificationToken({
      userId: user.id,
      tokenHash: `valid-vt-${user.id}`,
      type: "EMAIL_VERIFICATION",
      expiresAt: new Date(Date.now() + hour),
    });
    const expired = await prisma.verificationToken.create({
      data: {
        userId: user.id,
        tokenHash: `expired-vt-${user.id}`,
        type: "PASSWORD_RESET",
        expiresAt: new Date(Date.now() - hour),
      },
    });
    const used = await prisma.verificationToken.create({
      data: {
        userId: user.id,
        tokenHash: `used-vt-${user.id}`,
        type: "PASSWORD_RESET",
        expiresAt: new Date(Date.now() + hour),
        usedAt: new Date(),
      },
    });

    await tokenRepository.deleteExpiredVerificationTokens();

    const remaining = await prisma.verificationToken.findMany({ where: { userId: user.id } });
    const remainingIds = remaining.map((t) => t.id);

    expect(remainingIds).toContain(valid.id);
    expect(remainingIds).not.toContain(expired.id);
    expect(remainingIds).not.toContain(used.id);

    await deleteTestUser(user.id);
  });
});
