import {randomBytes} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {passwordHash} from './cloud-auth.mjs';

// 在线版只有一个登录密码。忘了或想换的时候跑 npm run cloud:password。
// 只写入 scrypt 哈希，明文只在终端显示一次，不落盘、不进仓库。
const file = '.env.cloud';
const given = process.argv[2];
if (given && given.length < 8) {
  console.error('自定义密码至少 8 位');
  process.exit(1);
}
let text;
try {
  text = await readFile(file, 'utf8');
} catch {
  console.error('没有 .env.cloud，先运行 npm run cloud:setup');
  process.exit(1);
}
if (!/^FOLIO_PASSWORD_HASH=/m.test(text)) {
  console.error('.env.cloud 缺少 FOLIO_PASSWORD_HASH');
  process.exit(1);
}
const password = given || randomBytes(18).toString('base64url');
await writeFile(file, text.replace(/^FOLIO_PASSWORD_HASH=.*$/m, `FOLIO_PASSWORD_HASH=${passwordHash(password)}`), {mode: 0o600});
console.log(given ? '已更新为自定义密码。' : `已生成新密码（只显示这一次，请存入密码管理器）：\n${password}`);
console.log('重启在线版生效：launchctl kickstart -k gui/$(id -u)/com.folio.cloud');
