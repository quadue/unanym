import {identityOrigin} from './scripts/demo-addresses.js';
import {defineConfig} from '@playwright/test';
// Record the local commit without fetching a private PR base for report metadata.
export default defineConfig({captureGitInfo:{commit:true,diff:false},testDir:'tests/browser',fullyParallel:false,workers:1,timeout:30_000,use:{headless:true},webServer:{command:'node scripts/demo.js',url:identityOrigin+'/identity/health',reuseExistingServer:false,timeout:20_000}});
