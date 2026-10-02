const { test, expect } = require('@playwright/test');

test('account creates an optional author identity separately from registration', async ({ page }) => {
  const calls = [];

  await page.route('https://api.yorubay.com/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    let body = null;
    try { body = request.postDataJSON(); } catch {}

    calls.push({ path: url.pathname, method, body });

    if (method === 'GET' && url.pathname === '/me') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          public_id: 'YR-TEST-0001',
          username: 'tester',
          display_name: '測試玩家',
          auth_type: 'session',
          billing_mode: 'cost_usd_v2',
          wallet_balance_usd: 0,
          wallet_balance_microusd: 0
        })
      });
    }

    if (method === 'GET' && url.pathname === '/me/authors') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ authors: [] })
      });
    }

    if (method === 'POST' && url.pathname === '/me/authors/claim') {
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          claimed: true,
          author_id: body.author_id,
          created_at: '2026-10-02T00:00:00.000Z',
          existing: false
        })
      });
    }

    if (method === 'POST' && url.pathname === '/me/authors/profile-pr') {
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          created: true,
          pr_number: 999,
          pr_url: 'https://github.test/pr/999',
          author_id: body.author_id,
          author_name: body.author_name,
          author_profile_mode: 'create'
        })
      });
    }

    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'not_found' })
    });
  });

  await page.route('**/data/authors.json', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ schema_version: 1, authors: [] })
  }));

  await page.goto('./account.html');

  const authorBox = page.locator('#author-identity-box');
  await expect(authorBox).toBeVisible();
  await expect(authorBox).toContainText('作者身份是可選的公開身份，不等於登入帳號');
  await expect(authorBox).toContainText('夜灣不代收、不轉金流、不抽成');

  const register = page.locator('#register-form');
  await expect(register.locator('[name="author_id"]')).toHaveCount(0);

  const form = page.locator('#author-profile-form');
  await form.locator('[name="author_id"]').fill('night-writer');
  await form.locator('[name="author_name"]').fill('夜裡寫故事的人');
  await form.locator('[name="author_bio"]').fill('把故事留在夜裡。');
  await form.locator('[name="author_support_label"]').fill('替作者留一盞燈');
  await form.locator('[name="author_support_url"]').fill('https://example.com/support');

  await form.getByRole('button', { name: '建立作者身份並送出公開資料 PR' }).click();

  await expect(page.locator('#author-result')).toContainText('作者資料 PR #999 已建立');
  await expect(form.locator('[name="author_id"]')).toHaveAttribute('readonly', '');
  await expect(form.getByRole('button', { name: '送出作者資料更新 PR' })).toBeVisible();

  const claim = calls.find(call => call.path === '/me/authors/claim' && call.method === 'POST');
  expect(claim.body).toEqual({ author_id: 'night-writer' });

  const profile = calls.find(call => call.path === '/me/authors/profile-pr' && call.method === 'POST');
  expect(profile.body).toMatchObject({
    author_id: 'night-writer',
    author_name: '夜裡寫故事的人',
    author_bio: '把故事留在夜裡。',
    author_support_label: '替作者留一盞燈',
    author_support_url: 'https://example.com/support'
  });
});

test('account loads an existing author identity without exposing login username as author id', async ({ page }) => {
  await page.route('https://api.yorubay.com/**', async route => {
    const url = new URL(route.request().url());

    if (route.request().method() === 'GET' && url.pathname === '/me') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          public_id: 'YR-TEST-0002',
          username: 'private-login-name',
          display_name: '帳號顯示名稱',
          auth_type: 'session',
          billing_mode: 'cost_usd_v2',
          wallet_balance_usd: 0
        })
      });
    }

    if (route.request().method() === 'GET' && url.pathname === '/me/authors') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          authors: [{
            author_id: 'public-writer',
            created_at: '2026-10-01T00:00:00.000Z'
          }]
        })
      });
    }

    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'not_found' })
    });
  });

  await page.route('**/data/authors.json', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      schema_version: 1,
      authors: [{
        id: 'public-writer',
        name: '公開筆名',
        bio: '公開作者介紹',
        support_links: []
      }]
    })
  }));

  await page.goto('./account.html');

  const form = page.locator('#author-profile-form');
  await expect(form.locator('[name="author_id"]')).toHaveValue('public-writer');
  await expect(form.locator('[name="author_id"]')).toHaveAttribute('readonly', '');
  await expect(form.locator('[name="author_name"]')).toHaveValue('公開筆名');
  await expect(page.locator('#account-body')).toContainText('private-login-name');
  await expect(form.locator('[name="author_id"]')).not.toHaveValue('private-login-name');
  await expect(page.getByRole('link', { name: '查看公開作者頁' }))
    .toHaveAttribute('href', 'author.html?id=public-writer');
});
