// End to end check of the demo build: two tabs, one booking, one video call.
// Usage: node e2e/demo.mjs [url] [screenshotDir]
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import path from 'node:path'

const url = process.argv[2] || 'http://localhost:4173/'
// Set REAL=1 to run the same flow against a client built for the Node server.
const real = process.env.REAL === '1'
async function login(page, name, email) {
  if (real) {
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill('password123')
    await page.getByRole('button', { name: 'Log in' }).click()
  } else {
    await page.getByRole('button', { name }).click()
  }
}
const shots = process.argv[3]
const shot = async (page, name) => shots && !process.env.NO_SHOTS && page.screenshot({ path: path.join(shots, `${name}.png`) })

const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
})
const context = await browser.newContext({ viewport: { width: 1360, height: 860 }, permissions: ['camera', 'microphone'] })
const errors = []
const watch = (page, who) => {
  page.on('console', m => { if (m.type() === 'error') errors.push(`${who}: ${m.text()}`) })
  page.on('pageerror', e => errors.push(`${who}: ${e.message}`))
  page.on('dialog', d => d.accept())
}
const step = msg => console.log('-', msg)
const balance = async page => Number((await page.getByTestId('balance').innerText()).replace(/\D/g, ''))

const maya = await context.newPage()
watch(maya, 'maya')
await maya.goto(url)
await maya.evaluate(() => localStorage.clear())
await maya.reload()
if (!real) await maya.getByTestId('demo-banner').waitFor()
await login(maya, /Maya Chen/, 'maya@skillswap.test')
await maya.getByTestId('skill-card').first().waitFor()
const mayaStart = await balance(maya)
step(`maya logged in with ${mayaStart} CR`)
await shot(maya, 'explore')

await maya.getByPlaceholder('Search for skills to learn...').fill('python')
await maya.keyboard.press('Enter')
await maya.waitForFunction(() => document.querySelectorAll('[data-testid=skill-card]').length === 1)
step('search works')
await maya.getByRole('button', { name: 'clear' }).click()

await maya.getByTestId('skill-card').filter({ hasText: 'Guitar Basics' }).click()
await maya.getByTestId('slot').first().click()
await maya.getByLabel(/Note for/).fill('Total beginner, I have an old acoustic.')
await shot(maya, 'skill-detail')
await maya.getByRole('button', { name: 'Request session' }).click()
await maya.waitForURL(/#\/bookings/)
await maya.waitForFunction(n => document.querySelector('[data-testid=balance]').innerText.startsWith(String(n)), mayaStart - 20)
step('booked, balance dropped by 20')
await maya.getByRole('link', { name: 'Wallet' }).click()
assert.equal(await maya.getByTestId('wallet-held').innerText(), '20 CR')
assert.match(await maya.getByTestId('ledger').innerText(), /Held for Guitar Basics/)
step('20 CR shown in escrow and in the ledger')
await shot(maya, 'wallet')

const liam = await context.newPage()
watch(liam, 'liam')
await liam.goto(url)
await login(liam, /Liam Carter/, 'liam@skillswap.test')
await liam.getByTestId('balance').waitFor()
const liamStart = await balance(liam)
await liam.getByRole('link', { name: 'My bookings' }).click()
await liam.getByRole('button', { name: 'Teaching' }).click()
await liam.getByRole('button', { name: 'Accept' }).click()
await liam.getByRole('link', { name: 'Join session' }).waitFor()
step('liam accepted')
await shot(liam, 'bookings-teacher')

await maya.getByRole('link', { name: 'My bookings' }).click()
await maya.getByRole('link', { name: 'Join session' }).click()
await liam.getByRole('link', { name: 'Join session' }).click()
for (const p of [maya, liam]) {
  await p.waitForSelector('[data-testid=call-state][data-state=connected]', { timeout: 20000 })
  await p.waitForFunction(() => document.querySelector('[data-testid=remote-video]').videoWidth > 0, null, { timeout: 15000 })
}
step('WebRTC connected both ways with remote video')

await maya.getByLabel('Message').fill('Hi Liam, can you hear me?')
await maya.getByRole('button', { name: 'Send' }).click()
await liam.getByTestId('chat').getByText('Hi Liam, can you hear me?').waitFor()
step('chat delivered')
await maya.getByRole('button', { name: 'Mute' }).click()
await maya.getByRole('button', { name: 'Unmute' }).waitFor()
await maya.waitForTimeout(4000)
await shot(maya, 'session')
await shot(liam, 'session-teacher')

await liam.getByRole('button', { name: 'End session' }).click()
await liam.getByTestId('session-ended').waitFor()
await maya.getByTestId('rate-form').waitFor()
step('session completed, learner asked to rate')
await maya.getByPlaceholder('How did it go?').fill('Learned three chords and a strumming pattern. Really patient.')
await shot(maya, 'rating')
await maya.getByRole('button', { name: /Rate and release/ }).click()
await maya.getByText(/went to Liam/).waitFor()

await liam.getByRole('button', { name: 'Back to bookings' }).click()
await liam.waitForFunction(n => document.querySelector('[data-testid=balance]').innerText.startsWith(String(n)), liamStart + 20, { timeout: 10000 })
step(`liam balance ${liamStart} -> ${liamStart + 20}`)
await liam.getByRole('link', { name: 'Wallet' }).click()
assert.match(await liam.getByTestId('ledger').innerText(), /Earned: Guitar Basics/)

await maya.getByRole('button', { name: 'Back to bookings' }).click()
await maya.getByRole('link', { name: 'Explore' }).click()
await maya.getByTestId('skill-card').filter({ hasText: 'Guitar Basics' }).click()
await maya.getByTestId('reviews').getByText('Learned three chords').waitFor()
step('review shows on the skill page')
await shot(maya, 'review')
await maya.getByRole('link', { name: 'Wallet' }).click()
assert.equal(await maya.getByTestId('wallet-held').innerText(), '0 CR')

await browser.close()
if (errors.length) {
  console.error('console errors:\n' + errors.join('\n'))
  process.exit(1)
}
console.log('demo check passed, no console errors')
