import { test, expect } from './fixtures'
import type { Locator, Page } from '@playwright/test'

const ADMIN_USER = process.env.E2E_ADMIN_USER || 'cool_guy'
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? ''
if (!ADMIN_PASSWORD) throw new Error('E2E_ADMIN_PASSWORD is required (run via e2e/run.sh)')

async function signIn(page: Page) {
  await page.goto('/')
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByTestId('login-heading')).toBeVisible()
  await dialog.getByLabel('Benutzername').fill(ADMIN_USER)
  await dialog.getByLabel('Passwort').fill(ADMIN_PASSWORD)
  await dialog.getByRole('button', { name: 'Anmelden' }).click()
  await expect(dialog).toBeHidden()
}

// Grabs the white line where it is drawn and drags it with the mouse to `share` of the bar.
async function dragLine(page: Page, line: Locator, bar: Locator, share: number) {
  const from = await line.boundingBox()
  const box = await bar.boundingBox()
  if (!from || !box) throw new Error('noise gate not laid out')
  const y = from.y + from.height / 2
  await page.mouse.move(from.x + from.width / 2, y)
  await page.mouse.down()
  await page.mouse.move(box.x + 8 + (box.width - 16) * share, y, { steps: 12 })
  await page.mouse.up()
}

test('the noise gate line on the level bar is dragged with the mouse, also in auto mode', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  const page = await context.newPage()
  try {
    await signIn(page)
    await page.getByTestId('account-menu-button').click()
    await page.getByTestId('menu-sound').click()
    const dialog = page.getByTestId('settings-dialog')
    // The level moves while the check runs: the drag has to work against a live bar.
    await dialog.getByTestId('mic-test-toggle').click()
    const advanced = dialog.getByTestId('audio-advanced')
    await advanced.locator('summary').click()
    const auto = advanced.getByRole('checkbox', { name: 'Automatisch anpassen' })
    await auto.check()

    // The line next to the microphone check, the one in front of the mic test.
    const meter = dialog.locator('[data-testid="mic-level"]').first()
    const gate = meter.getByTestId('noise-gate')
    const line = meter.locator('[data-gate-marker]')
    await gate.scrollIntoViewIfNeeded()
    await expect(line).toBeVisible()

    // Dragging the line in auto mode takes over by hand.
    await dragLine(page, line, meter, 0.8)
    await expect.poll(async () => Number(await gate.inputValue())).toBeGreaterThanOrEqual(75)
    await expect(auto).not.toBeChecked()
    await expect(advanced.getByText(/Schwelle \d+ %/)).toHaveText(`Schwelle ${await gate.inputValue()} %`)

    // The line followed the pointer, and it can be dragged back down.
    await dragLine(page, line, meter, 0.2)
    await expect.poll(async () => Number(await gate.inputValue())).toBeLessThanOrEqual(25)
    const lineBox = await line.boundingBox()
    const barBox = await meter.boundingBox()
    if (!lineBox || !barBox) throw new Error('noise gate not laid out')
    expect(Math.abs(lineBox.x + lineBox.width / 2 - (barBox.x + 8 + (barBox.width - 16) * 0.2))).toBeLessThan(6)

    // The keyboard moves it too.
    await gate.focus()
    const before = Number(await gate.inputValue())
    await page.keyboard.press('ArrowRight')
    await expect.poll(async () => Number(await gate.inputValue())).toBe(before + 1)
  } finally {
    await context.close()
  }
})
