/* Test de connectivité DB Phase 3 — lecture seule. */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  try {
    const [schools, users, grades] = await Promise.all([
      prisma.school.count(),
      prisma.user.count(),
      prisma.grade.count(),
    ]);
    console.log(`DB OK — schools=${schools} users=${users} grades=${grades}`);
    const s = await prisma.school.findFirst({ select: { id: true, name: true, currency: true } });
    console.log('first school:', s);
  } catch (e) {
    console.log('DB KO code:', e.code || '-');
    console.log('DB KO meta:', e.meta ? JSON.stringify(e.meta).slice(0, 300) : '-');
    console.log('DB KO msg:', String(e.message).replace(/\s+/g, ' ').slice(0, 400));
  } finally {
    await prisma.$disconnect();
  }
})();
