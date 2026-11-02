// Which lark-cli identity Folio acts as.
//
// "user" is the default: documents belong to you, and you can edit them from any
// device. "bot" uses the app's tenant token (appId/appSecret), which never needs a
// device-flow login, but the documents belong to the app and the app must be a
// member of the target wiki space with edit rights.
//
// Read this lazily: server.mjs calls `new FeishuSync()` at import time, before
// .env.local is loaded, so caching it in a constructor would ignore FOLIO_LARK_AS.
export function larkIdentity(value = process.env.FOLIO_LARK_AS) {
  const identity = String(value ?? '').trim().toLowerCase();
  if (!identity) return 'user';
  if (identity !== 'user' && identity !== 'bot')
    throw Error('FOLIO_LARK_AS 只能是 user 或 bot');
  return identity;
}

export function identityHint(identity, message) {
  if (identity !== 'bot') return message;
  const text = String(message || '');
  if (/has not applied for the required scope|99991672/i.test(text))
    return `${text}（应用身份还未申请这些 tenant scope：在开发者后台申请并发布应用版本后重试；文档与知识库写入通常需要 wiki:wiki、wiki:node:create、docx:document:write_only、drive:file:upload）`;
  if (/forbidden|permission|拒绝|无权限|no permission|access denied|99991663/i.test(text))
    return `${text}（应用身份需要在目标知识库空间里被添加为可编辑成员；可先用 FOLIO_LARK_AS=user 确认是权限问题）`;
  return message;
}
