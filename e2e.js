// Two-player E2E run for the Playwright MCP `browser_run_code_unsafe` tool (filename: e2e.js).
// Creates a 1v1 room, joins with a second tab, starts, walks both champions to mid and fights.
async (page) => {
  const shot = (p, n) => p.screenshot({ path: `/tmp/aram-${n}.png` });
  for (const p of page.context().pages().slice(1)) await p.close();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("http://localhost:5173/");
  await page.fill("#name", "Pedro");
  await page.click("#create");
  await page.click('#mode button[data-v="1v1"]');
  await page.click("#ok");
  await page.waitForSelector("#t0 .slot");
  const p2 = await page.context().newPage();
  await p2.setViewportSize({ width: 1280, height: 800 });
  await p2.goto("http://localhost:5173/");
  await p2.fill("#name", "Alberto");
  await p2.click("tr.room", { timeout: 8000 });
  await p2.waitForSelector("#t1 .slot:not(.empty)");
  await page.click("#start");
  await page.waitForSelector(".hud", { timeout: 40000 });
  await p2.waitForSelector(".hud", { timeout: 40000 });
  const hp = p => p.evaluate(() => { const u = room.state.units.get(room.sessionId); return `${u.champ} ${Math.round(u.hp)}/${u.maxHp} x=${u.x.toFixed(1)} k${u.kills}/d${u.deaths}`; });
  const before = [await hp(page), await hp(p2)];
  // both walk toward mid: screen-right is always toward the enemy base
  for (let i = 0; i < 18; i++) {
    for (const p of [page, p2]) { await p.bringToFront(); await p.waitForTimeout(100); await p.mouse.click(1200, 380, { button: "right" }); }
    await page.waitForTimeout(1000);
  }
  await page.bringToFront(); await shot(page, "mid1"); await p2.bringToFront(); await shot(p2, "mid2");
  // spam abilities toward screen centre-right, then auto-attack whatever is under the cursor
  for (let i = 0; i < 10; i++) {
    for (const p of [page, p2]) { await p.bringToFront(); await p.waitForTimeout(100); await p.mouse.move(900, 390); for (const k of "qwe") await p.keyboard.press(k); await p.mouse.click(760, 380, { button: "right" }); }
    await page.waitForTimeout(700);
  }
  await page.bringToFront(); await shot(page, "fight1"); await p2.bringToFront(); await shot(p2, "fight2");
  return { before, after: [await hp(page), await hp(p2)], gold: [await page.textContent("#gold"), await p2.textContent("#gold")], feed: await page.textContent("#feed") };
}
