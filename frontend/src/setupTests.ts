// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';
import { TextDecoder, TextEncoder } from 'util';

// jsdom under jest 27 (bundled with react-scripts 5) ships neither, and
// react-router's dev build touches TextEncoder at import time.
if (typeof global.TextEncoder === 'undefined') {
  (global as any).TextEncoder = TextEncoder;
  (global as any).TextDecoder = TextDecoder;
}

// The response interceptor in src/services/api.ts redirects on a 401 by assigning
// window.location.href. jsdom implements no navigation, so an unstubbed assignment
// throws "Not implemented: navigation". Replace location with a plain object whose
// href is writable, and record what was assigned so tests can assert on it.
// href must stay an absolute URL: axios reads `new URL(window.location.href)` at
// import time, and a bare '/' makes that throw "Invalid URL".
const ORIGIN = 'http://localhost/';
const locationStub = {
  href: ORIGIN,
  origin: 'http://localhost',
  protocol: 'http:',
  host: 'localhost',
  hostname: 'localhost',
  port: '',
  pathname: '/',
  search: '',
  hash: '',
  assign: jest.fn(),
  replace: jest.fn(),
  reload: jest.fn(),
  toString: () => locationStub.href,
};

Object.defineProperty(window, 'location', {
  configurable: true,
  writable: true,
  value: locationStub,
});

// The request interceptor reads auth_token out of localStorage, so leaking it
// between tests would silently authenticate later ones.
beforeEach(() => {
  window.localStorage.clear();
  locationStub.href = ORIGIN;
});
