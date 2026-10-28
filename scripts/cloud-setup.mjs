import {randomBytes} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {passwordHash} from './cloud-auth.mjs';
const password=randomBytes(18).toString('base64url');
const data=`FOLIO_PUBLIC_URL=http://127.0.0.1:4319\nHOST=127.0.0.1\nPORT=4319\nFOLIO_DATA_DIR=./artifacts/cloud-data\nFOLIO_SESSION_SECRET=${randomBytes(48).toString('hex')}\nFOLIO_PASSWORD_HASH=${passwordHash(password)}\n`;
try{await writeFile('.env.cloud',data,{flag:'wx',mode:0o600});console.log('已生成 .env.cloud（被 Git 忽略）。工作台登录密码仅显示这一次：\n'+password+'\n请放入密码管理器。运行 npm run cloud 在本机预演在线版。\n部署时将配置放入平台的 Secrets，替换 PUBLIC_URL、HOST、PORT 和持久化目录。');}catch(e){if(e.code==='EEXIST')throw Error('.env.cloud 已存在，未覆盖。');throw e;}
