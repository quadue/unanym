import {identityOrigin} from './scripts/demo-addresses.js';
import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests/browser',fullyParallel:false,workers:1,timeout:30_000,use:{headless:true},webServer:{command:'node scripts/demo.js',url:identityOrigin+'/identity/health',reuseExistingServer:false,timeout:20_000}});
