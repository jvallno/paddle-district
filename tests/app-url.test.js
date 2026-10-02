import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appUrl } from '../lib/app-url.js';

const loc = (hostname, search = '', origin = `http://${hostname}:5174`) =>
  ({ origin, pathname: '/', hostname, search });

test('production: no flag even if search has emulators', () => {
  assert.equal(appUrl(loc('app.example.com', '?emulators', 'https://app.example.com'), '#/u/ana'),
    'https://app.example.com/#/u/ana');
});
test('localhost live: no flag', () => {
  assert.equal(appUrl(loc('localhost'), '#/u/ana'), 'http://localhost:5174/#/u/ana');
});
test('localhost sandbox: keeps ?emulators', () => {
  assert.equal(appUrl(loc('localhost', '?emulators'), '#/u/ana'), 'http://localhost:5174/?emulators#/u/ana');
});
test('hash appended as given', () => {
  assert.equal(appUrl(loc('127.0.0.1', '?emulators'), '#/x/y'), 'http://127.0.0.1:5174/?emulators#/x/y');
});
