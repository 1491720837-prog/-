import test from 'node:test';
import assert from 'node:assert/strict';
import {larkIdentity, identityHint} from '../scripts/lark-identity.mjs';

test('默认使用用户身份，只接受 user / bot', () => {
  assert.equal(larkIdentity(undefined), 'user');
  assert.equal(larkIdentity(''), 'user');
  assert.equal(larkIdentity('user'), 'user');
  assert.equal(larkIdentity('BOT'), 'bot');
  assert.equal(larkIdentity(' bot '), 'bot');
  assert.throws(() => larkIdentity('app'), /只能是 user 或 bot/);
  assert.throws(() => larkIdentity('tenant'), /只能是 user 或 bot/);
});

test('应用身份的权限报错会带上可执行提示', () => {
  assert.equal(identityHint('user', 'forbidden'), 'forbidden');
  assert.match(identityHint('bot', 'forbidden'), /知识库空间/);
  assert.match(identityHint('bot', 'code 99991672 access denied'), /tenant scope/);
  assert.match(identityHint('bot', 'app has not applied for the required scope(s): wiki:wiki'), /wiki:node:create/);
  assert.match(identityHint('bot', 'permission denied on space'), /可编辑成员/);
  // 与权限无关的错误不应被改写
  assert.equal(identityHint('bot', 'network timeout'), 'network timeout');
});
