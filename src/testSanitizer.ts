// src/testSanitizer.ts
// Run with: npx tsx src/testSanitizer.ts

import { loadCleanGA4Data, getTopButtonAction } from './services/ga4Sanitizer.js';
import fs from 'fs';
import path from 'path';

// --- 1. Inject a mock analytics_output.json with known dirty + clean rows ---
const mockData = [
    // ✅ CLEAN — should survive
    { 'Event name': 'core_button_link_click', 'Button Name': 'Find a Donor', 'Event count': 42, 'Session source': 'google' },
    { 'Event name': 'core_button_link_click', 'Button Name': 'Register Now', 'Event count': 18, 'Session source': 'bsky' },

    // ❌ DIRTY — localhost source
    { 'Event name': 'core_button_link_click', 'Button Name': 'Find a Donor', 'Event count': 9, 'Session source': 'localhost' },

    // ❌ DIRTY — staging source
    { 'Event name': 'core_button_link_click', 'Button Name': 'Register Now', 'Event count': 5, 'Session source': 'staging.matchingdonors.com' },

    // ❌ DIRTY — bot source
    { 'Event name': 'page_view', 'Button Name': '(not set)', 'Event count': 3, 'Session source': 'googlebot' },

    // ❌ DIRTY — admin button name
    { 'Event name': 'core_button_link_click', 'Button Name': 'test-button', 'Event count': 7, 'Session source': 'google' },

    // ❌ DIRTY — Lighthouse audit
    { 'Event name': 'page_view', 'Button Name': '(not set)', 'Event count': 2, 'Session source': 'lighthouse' },
];

const mockPath = path.resolve(process.cwd(), 'analytics_output.json');
const originalExists = fs.existsSync(mockPath);
const originalData = originalExists ? fs.readFileSync(mockPath, 'utf-8') : null;

// Write mock data
fs.writeFileSync(mockPath, JSON.stringify(mockData, null, 2));
const expectedClean = mockData.filter(r =>
    !/localhost|127\.0\.0\.1|192\.168\.|staging|internal/i.test(r['Session source'] ?? '') &&
    !/bot|spider|crawl|lighthouse|gtmetrix|pingdom/i.test(r['Session source'] ?? '') &&
    !/test|debug|admin|preview/i.test(r['Button Name'] ?? '')
).length;
console.log(`📋 Injected ${mockData.length} mock rows (${expectedClean} expected clean)\n`);

// --- 2. Run the sanitizer ---
const clean = loadCleanGA4Data();
console.log(`\n✅ Rows surviving sanitization: ${clean.length}`);
clean.forEach(r => console.log(`   → "${r['Button Name']}" | source: ${r['Session source']} | count: ${r['Event count']}`));

// --- 3. Check top button action ---
const top = getTopButtonAction();
console.log(`\n🏆 Top button action: ${top ?? '(none)'}`);
console.log(`   Expected: "Find a Donor" (highest clean count = 42)\n`);

// --- 4. Assert results ---
let passed = true;
if (clean.length !== 2) { console.error(`❌ Expected 2 clean rows, got ${clean.length}`); passed = false; }
if (top !== 'Find a Donor') { console.error(`❌ Expected top action "Find a Donor", got ${top}`); passed = false; }
if (passed) console.log('🎉 All assertions passed!\n');

// --- 5. Restore original analytics_output.json ---
if (originalData) {
    fs.writeFileSync(mockPath, originalData);
    console.log('♻️  Restored original analytics_output.json');
} else {
    fs.unlinkSync(mockPath);
    console.log('🗑️  Removed temporary mock analytics_output.json');
}