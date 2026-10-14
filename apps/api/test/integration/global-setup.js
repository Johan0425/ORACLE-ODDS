const { execSync } = require('node:child_process');

module.exports = async () => {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://oracle:oracle@localhost:5432/oracle_odds_test?schema=public';
  // Reconstruye el esquema desde las migraciones reales (valida que aplican sobre una base vacía).
  execSync('npx prisma migrate reset --force --skip-seed --skip-generate', {
    cwd: __dirname + '/../..',
    env: { ...process.env, DATABASE_URL: url, DATABASE_URL_UNPOOLED: url },
    stdio: 'pipe',
  });
};
