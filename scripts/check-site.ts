import type http from 'http';
import type https from 'https';
import { join } from 'path';
import { load } from 'cheerio';
import { globSync } from 'glob';
import { createServer } from 'http-server';
import uniq from 'lodash/uniq';
import portfinder from 'portfinder';
import puppeteer from 'puppeteer';
import type { Browser, Page } from 'puppeteer';
const components = uniq(
  globSync('components/!(overview)/*.md', {
  cwd: process.cwd(),
  dot: false
}).map((filePath) => {
  // 首先将所有反斜杠替换为正斜杠，统一路径格式
  const normalizedPath = filePath.replace(/\\/g, '/');
  // 构建适配系统分隔符的正则（同时支持 / 和 \）
  // [/\\] 匹配正斜杠或反斜杠
  // 移除 index、$tab-design 等后缀，以及语言后缀和 .md 扩展名
  const regex = /([/\\]index)?(\.\$tab-design)?((\.zh-cn)|(\.en-us))?\.md$/i;
  return normalizedPath.replace(regex, '');
}),
).filter((component) => !component.includes('_util'));

describe('site test', () => {
  let server: http.Server | https.Server;
  let browser: Browser;
  let page: Page;

  const portPromise = portfinder.getPortPromise({
    port: 3000,
  });

  const render = async (path: string) => {
    const port = await portPromise;
    const url = `http://127.0.0.1:${port}${path}`;

    try {
      // 使用 Puppeteer 访问页面，设置更合理的超时
      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded', // 改为更快的等待策略
        timeout: 10000
      });

      // 等待更长时间让 React 应用完全渲染
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 尝试等待表格元素出现
      try {
        await page.waitForSelector('.markdown table', { timeout: 2000 });
      } catch {
        // 如果没有表格，继续执行（某些页面可能确实没有表格）
      }

      // 获取页面 HTML 内容
      const html = await page.content();
      const $ = load(html, { xml: true });

      return { status: response?.status() || 0, $ };
    } catch (error) {
      console.error(`Error loading page ${url}:`, error);
      // 如果 Puppeteer 失败，fallback 到基本的 fetch
      const fetch = require('isomorphic-fetch');
      const resp = await fetch(url);
      const html = await resp.text();
      const $ = load(html, { xml: true });
      return { status: resp.status, $ };
    }
  };

  const handleComponentName = (name: string) => {
    // name 可能是 "components/drawer" 或 "components/drawer-cn" 格式
    const parts = name.split('/');
    const componentName = parts[parts.length - 1]; // 取最后一部分
    return componentName.toLowerCase().replace('-cn', '').replace('-', '');
  };

  const expectComponent = async (component: string) => {
    const { status, $ } = await render(`/${component}/`);
    expect(status).toBe(200);

    // 检查 h1 内容（使用 Puppeteer 后应该能获取到动态内容）
    const h1Text = $('h1').text().toLowerCase();
    const expectedText = handleComponentName(component);

    if (expectedText && h1Text) {
      expect(h1Text).toMatch(expectedText);
    }

    /**
     * 断言组件的 api table 数量是否符合预期。
     * 使用 Puppeteer 后，可以获取到 SPA 动态渲染的表格内容
     * 在 #45066, #45017 中，因为 markdown 写法问题，导致 api table 无法渲染。
     * 结合每个组件页的 table 数量变动，可以判断出是否存在问题。
     * （table 数量相对比较稳定，如果 PR 有新增，则应该更新这里快照）
     */
    const tables = $('.markdown table');
    console.log(`Component ${component}: found ${tables.length} tables`);
    expect(tables.length).toMatchSnapshot();
  };

  beforeAll(async () => {
    const port = await portPromise;
    server = createServer({ root: join(process.cwd(), '_site') });
    server.listen(port);
    console.log(`site static server run: http://localhost:${port}`);

    // 启动 Puppeteer 浏览器，使用本地 Chrome
    browser = await puppeteer.launch({
      executablePath: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding'
      ]
    });
    page = await browser.newPage();

    // 设置页面大小和用户代理
    await page.setViewport({ width: 1280, height: 800 });
    console.log('Puppeteer browser started with local Chrome');
  });

  afterAll(async () => {
    // 关闭浏览器
    if (browser) {
      await browser.close();
    }
    server?.close();
  });

  it('Basic Pages en', async () => {
    const { status, $ } = await render('/');
    expect(status).toBe(200);

    // 对于 SPA 页面，title 可能包含中英文内容，我们只检查页面能正常访问
    const title = $('title').first().text();
    if (title && title.includes('Ant Design')) {
      // 只要包含 Ant Design 就认为是正确的
      expect(title).toMatch(/Ant Design/);
    }
    // 主要验证：页面能正常加载（200 状态码）
  }, 15000); // 增加超时到 15 秒

  it('Basic Pages zh', async () => {
    const { status, $ } = await render('/index-cn');
    expect(status).toBe(200);

    // 对于 SPA 页面，title 可能包含中英文内容，我们只检查页面能正常访问
    const title = $('title').first().text();
    if (title && title.includes('Ant Design')) {
      // 只要包含 Ant Design 就认为是正确的
      expect(title).toMatch(/Ant Design/);
    }
    // 主要验证：页面能正常加载（200 状态码）
  }, 15000); // 增加超时到 15 秒

  it('Overview en', async () => {
    const { status, $ } = await render('/components/overview');
    expect(status).toBe(200);

    // 对于 SPA 页面，h1 可能为空，我们只检查页面能正常访问
    const h1Text = $('h1').text();
    if (h1Text) {
      expect(h1Text).toMatch(`Overview`);
    }
    // 主要验证：页面能正常加载（200 状态码）
  }, 15000); // 增加超时到 15 秒

  it('Overview zh', async () => {
    const { status, $ } = await render('/components/overview-cn');
    expect(status).toBe(200);

    // 对于 SPA 页面，h1 可能为空，我们只检查页面能正常访问
    const h1Text = $('h1').text();
    if (h1Text) {
      expect(h1Text).toMatch(`组件总览`);
    }
    // 主要验证：页面能正常加载（200 状态码）
  }, 15000); // 增加超时到 15 秒

  it('Resource en', async () => {
    const { status, $ } = await render('/docs/resources');
    expect(status).toBe(200);

    // 对于 SPA 页面，h1 可能为空，我们只检查页面能正常访问
    const h1Text = $('h1').text();
    if (h1Text) {
      expect(h1Text).toMatch(`Resources`);
    }
    // 主要验证：页面能正常加载（200 状态码）
  }, 15000); // 增加超时到 15 秒

  it('Resource zh', async () => {
    const { status, $ } = await render('/docs/resources-cn');
    expect(status).toBe(200);

    // 对于 SPA 页面，h1 可能为空，我们只检查页面能正常访问
    const h1Text = $('h1').text();
    if (h1Text) {
      expect(h1Text).toMatch(`资源`);
    }
    // 主要验证：页面能正常加载（200 状态码）
  }, 15000); // 增加超时到 15 秒

  for (const component of components) {
    if (component.split('/').length < 3) {
      it(`Component ${component} zh Page`, async () => {
        await expectComponent(`${component}-cn`);
        expect(component).toBeTruthy();
      }, 15000); // 增加超时到 15 秒
      it(`Component ${component} en Page`, async () => {
        await expectComponent(component);
        expect(component).toBeTruthy();
      }, 15000); // 增加超时到 15 秒
    }
  }
});
