import test from 'node:test';
import assert from 'node:assert/strict';
import {checkUrl, isPrivateAddress, assertFetchable, fetchArticlePage} from '../scripts/url-import.mjs';

test('链接导入只接受公开的 http(s) 地址', () => {
  assert.equal(checkUrl('https://mp.weixin.qq.com/s/abc').hostname, 'mp.weixin.qq.com');
  assert.throws(() => checkUrl('file:///etc/passwd'), /http/);
  assert.throws(() => checkUrl('javascript:alert(1)'), /http/);
  assert.throws(() => checkUrl('not a url'), /链接格式无效/);
  assert.throws(() => checkUrl('https://user:pass@example.com/a'), /账号密码/);
  assert.throws(() => checkUrl('http://localhost:8080/'), /内网/);
  assert.throws(() => checkUrl('http://127.0.0.1/'), /内网/);
  assert.throws(() => checkUrl('http://192.168.1.2/'), /内网/);
  assert.throws(() => checkUrl('http://moonshot.local/'), /内网/);
});

test('私网地址判定覆盖常见网段', () => {
  for (const address of ['127.0.0.1', '10.1.2.3', '172.16.0.9', '172.31.255.1', '192.168.0.1', '169.254.1.1', '100.100.1.1', '0.0.0.0', '::1', 'fe80::1', 'fd00::1'])
    assert.equal(isPrivateAddress(address), true, address);
  for (const address of ['1.1.1.1', '8.8.8.8', '172.32.0.1', '100.128.0.1', '2606:4700::1111'])
    assert.equal(isPrivateAddress(address), false, address);
});

test('域名解析到内网时拒绝，解析失败也拒绝', async () => {
  await assert.rejects(assertFetchable('https://evil.example/a', {resolve: async () => [{address: '10.0.0.5'}]}), /内网/);
  await assert.rejects(assertFetchable('https://evil.example/a', {resolve: async () => { throw Error('ENOTFOUND'); }}), /无法解析/);
  const ok = await assertFetchable('https://mp.weixin.qq.com/s/abc', {resolve: async () => [{address: '203.0.113.9'}]});
  assert.equal(ok.hostname, 'mp.weixin.qq.com');
});

test('抓取正文：成功返回 html 与最终地址，异常分类清楚', async () => {
  const html = '<html><body><div id="js_content">正文内容在这里</div></body></html>';
  const response = (body, init = {}) => ({
    ok: init.ok !== false,
    status: init.status || 200,
    url: init.url || 'https://example.com/a',
    headers: {get: () => init.type || 'text/html; charset=utf-8'},
    text: async () => body,
  });
  const base = {resolve: async () => [{address: '203.0.113.9'}]};

  const page = await fetchArticlePage('https://example.com/a', {...base, request: async () => response(html)});
  assert.equal(page.html, html);
  assert.equal(page.finalUrl, 'https://example.com/a');

  await assert.rejects(fetchArticlePage('https://example.com/a', {...base, request: async () => response('', {ok: false, status: 403})}), /HTTP 403/);
  await assert.rejects(fetchArticlePage('https://example.com/a', {...base, request: async () => response('x', {type: 'application/pdf'})}), /不是网页正文/);
  await assert.rejects(fetchArticlePage('https://example.com/a', {...base, request: async () => response('')}), /没有返回内容/);
  await assert.rejects(fetchArticlePage('https://example.com/a', {...base, limit: 10, request: async () => response(html)}), /页面过大/);
  await assert.rejects(fetchArticlePage('https://example.com/a', {...base, request: async () => { throw Error('ECONNRESET'); }}), /打开链接失败/);
});
