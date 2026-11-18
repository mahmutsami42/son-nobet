const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

const BASE = process.env.NOBET_URL || 'http://localhost:5173';
const SHOTS = process.env.NOBET_SHOTS;
const screenshot = (page, name) => SHOTS && page.screenshot({ path: path.join(SHOTS, `${name}.png`), animations: 'disabled' });

async function run() {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const [width, height] = (process.env.NOBET_VIEWPORT || '1440x900').split('x').map(Number);
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log(m.type(), m.text().slice(0, 220)); });
    const button = name => page.getByRole('button', { name, exact: typeof name === 'string' });
    const close = () => button('Kapat').click();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await screenshot(page, 'menu');
    assert(await button(/DEVAM ET/).isDisabled());
    await button('Sesi kapat').click(); await button('Sesi aç').waitFor();
    await button('AYARLAR').click(); await button('Görüntü').click();
    const fov = page.getByRole('slider', { name: /Görüş açısı/ });
    await fov.fill('84'); assert.equal(await fov.inputValue(), '84');
    await screenshot(page, 'settings'); await close();
    await button('KONTROLLER').click();
    await button('Etkileşim / Al: E').click(); await page.keyboard.press('KeyG');
    await button('Etkileşim / Al: G').waitFor();
    await button('Tuşları sıfırla').click(); await close();
    await page.reload({ waitUntil: 'networkidle' }); await button('Sesi aç').waitFor();
    await button('YENİ OYUN').click();
    await page.locator('.interaction').waitFor({ timeout: 25000 });
    assert.match(await page.locator('.hud-location').innerText(), /ACİL SERVİS/i);
    assert.match(await page.locator('.interaction').innerText(), /Acil durum çantası/);
    await screenshot(page, 'play');
    await page.locator('.three-host canvas').click({ position: { x: width / 2, y: height / 2 } });
    await page.locator('.capture-hint').waitFor({ state: 'hidden' });
    await page.keyboard.press('KeyE');
    await page.getByText('Başlangıç eşyaları çantaya alındı.').waitFor();
    await page.keyboard.press('Tab');
    await page.getByRole('heading', { name: 'Envanter', exact: true }).waitFor();
    await button('Yedek pil').click(); await button('Kullan').click();
    assert.match(await page.locator('.inventory-toast').innerText(), /pili değiştirildi/);
    await screenshot(page, 'inventory'); await close();
    await page.keyboard.press('KeyM');
    await page.getByRole('heading', { name: 'Hastane Krokisi', exact: true }).waitFor();
    await screenshot(page, 'map'); await close();
    await page.keyboard.press('Escape'); await button('Ana menü').click();
    await button(/DEVAM ET/).click();
    await page.getByText('Hemşire istasyonunda personel kartını ara.').waitFor({ timeout: 20000 });
    assert.deepEqual(errors, []);
    console.log('Menu, settings persistence, input remapping, camera capture, emergency kit, inventory use, map, pause and continue passed.');

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    await mobile.goto(BASE, { waitUntil: 'networkidle' });
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth), 390);
    await screenshot(mobile, 'mobile');
  } finally { await browser.close(); }
}

void run().catch(error => { console.error(error); process.exitCode = 1; });