import {randomBytes,createHmac,timingSafeEqual,scryptSync} from 'node:crypto';
export function passwordHash(password){const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(password,salt,64).toString('hex');}
function equal(a,b){return typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));}
export class CloudAuth {
  constructor({origin,secret,password,openAccess=false}){
    this.origin=new URL(origin).origin;this.secure=this.origin.startsWith('https:');this.openAccess=openAccess;
    if(!this.secure&&!['127.0.0.1','localhost'].includes(new URL(origin).hostname))throw Error('在线版必须使用 HTTPS');
    if(openAccess){this.secret=secret||'';this.password='';this.attempts=[];return;}
    if(!secret||secret.length<32||!/^\w{32}:[a-f0-9]{128}$/.test(password||''))throw Error('请配置至少 32 字符的 FOLIO_SESSION_SECRET 和 FOLIO_PASSWORD_HASH');
    this.secret=secret;this.password=password;this.attempts=[];
  }
  sign(value){return createHmac('sha256',this.secret).update(value).digest('hex');}
  cookie(value,maxAge=604800){return `folio_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${this.secure?'; Secure':''}`;}
  login(password){
    this.attempts=this.attempts.filter(t=>Date.now()-t<60000);if(this.attempts.length>=10){const e=Error('尝试次数过多，请一分钟后重试');e.status=429;throw e;}this.attempts.push(Date.now());
    const [salt,hash]=this.password.split(':');if(typeof password!=='string'||password.length>1000||!equal(scryptSync(password,salt,64).toString('hex'),hash)){const e=Error('密码错误');e.status=401;throw e;}
    const body=Buffer.from(JSON.stringify({exp:Date.now()+604800000,nonce:randomBytes(16).toString('hex')})).toString('base64url');return this.cookie(body+'.'+this.sign(body));
  }
  authenticated(req){if(this.openAccess)return true;try{const token=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('folio_session='))?.slice(14);const [body,sig]=token.split('.');return equal(sig,this.sign(body))&&JSON.parse(Buffer.from(body,'base64url')).exp>Date.now();}catch{return false;}}
  checkOrigin(req){if(req.headers.origin!==this.origin){const e=Error('请求来源不匹配');e.status=403;throw e;}}
}
