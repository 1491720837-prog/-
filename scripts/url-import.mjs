import {lookup} from 'node:dns/promises';

const PRIVATE_V4 = [
  /^0\./,
  /^10\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
];
const PRIVATE_V6 = /^(::1?|f[cd][0-9a-f]{2}:|fe[89ab][0-9a-f]:)/i;
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export function isPrivateAddress(address) {
  const value = String(address || '').trim().toLowerCase();
  if (!value) return true;
  if (value.includes(':')) return PRIVATE_V6.test(value);
  return PRIVATE_V4.some((pattern) => pattern.test(value));
}

// The gateway only listens on loopback, but a link handler is still an SSRF-shaped
// surface, so every hop is restricted to public http(s) hosts.
export function checkUrl(value) {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    throw Error('链接格式无效，请粘贴完整的 http(s) 地址');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw Error('只支持 http 或 https 链接');
  if (url.username || url.password) throw Error('链接中不能包含账号密码');
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) throw Error('链接缺少域名');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local'))
    throw Error('不允许访问本机或内网地址');
  if (/^[\d.]+$/.test(host) && isPrivateAddress(host))
    throw Error('不允许访问本机或内网地址');
  return url;
}

export async function assertFetchable(value, {resolve = lookup} = {}) {
  const url = checkUrl(value);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (/^[\d.]+$/.test(host) || host.includes(':')) return url;
  let addresses;
  try {
    addresses = await resolve(host, {all: true});
  } catch {
    throw Error(`无法解析域名：${host}`);
  }
  const list = Array.isArray(addresses) ? addresses : [addresses];
  if (!list.length) throw Error(`无法解析域名：${host}`);
  if (list.some((entry) => isPrivateAddress(entry?.address))) throw Error('不允许访问内网地址');
  return url;
}

export async function fetchArticlePage(
  value,
  {request = fetch, resolve = lookup, limit = 4_000_000, timeout = 25000} = {},
) {
  const target = await assertFetchable(value, {resolve});
  let response;
  try {
    response = await request(target.href, {
      redirect: 'follow',
      signal: AbortSignal.timeout(timeout),
      headers: {
        'user-agent': UA,
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.6',
      },
    });
  } catch (error) {
    throw Error(`打开链接失败：${error.message}`);
  }
  if (!response.ok) throw Error(`抓取失败：HTTP ${response.status}（可能需要登录，或站点限制了抓取）`);
  const type = response.headers?.get?.('content-type') || '';
  if (type && !/text\/html|xhtml/i.test(type)) throw Error('链接不是网页正文，请改用文献或播客导入');
  const finalUrl = response.url || target.href;
  checkUrl(finalUrl);
  const html = await response.text();
  if (!html.trim()) throw Error('页面没有返回内容');
  if (html.length > limit) throw Error('页面过大，请找该文章的单独页面再导入');
  return {html, finalUrl};
}
