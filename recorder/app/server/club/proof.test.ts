import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proofUrl } from './proof.js';

test('a proof shot opens only public web pages: never this Mac, its network or a file', () => {
  assert.equal(proofUrl('https://docs.anthropic.com/en/release-notes').hostname, 'docs.anthropic.com');
  for (const bad of ['http://localhost:4184/', 'http://127.0.0.1/', 'http://192.168.1.10/', 'http://10.0.0.2/admin', 'http://172.20.0.1/', 'http://[::1]/', 'http://printer.local/', 'file:///etc/passwd', 'javascript:alert(1)', 'not a url'])
    assert.throws(() => proofUrl(bad), /web|public/, bad);
});
