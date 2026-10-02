import type { BrowserEnvironment } from '../contracts/browser-environment.ts';
export const environmentFixture: BrowserEnvironment = {
  schemaVersion: 1,
  capturedAt: '2026-09-16T00:00:00.000Z',
  headerSource: 'navigator-derived',
  headers: {
    'user-agent': 'Fixture browser',
    'accept-language': 'en-US,en;q=0.9',
    'sec-ch-ua': '"Chromium";v="130", "Not A Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
  },
  navigator: {
    userAgent: 'Fixture browser',
    platform: 'MacIntel',
    language: 'en-US',
    languages: ['en-US', 'en'],
    hardwareConcurrency: 8,
    deviceMemory: 8,
    maxTouchPoints: 0,
    cookieEnabled: true,
    userAgentData: {
      brands: [
        { brand: 'Chromium', version: '130' },
        { brand: 'Not A Brand', version: '99' },
      ],
      mobile: false,
      platform: 'macOS',
    },
  },
  screen: {
    width: 1440,
    height: 900,
    availWidth: 1440,
    availHeight: 875,
    colorDepth: 24,
    pixelRatio: 2,
  },
  timezone: 'Asia/Shanghai',
};
