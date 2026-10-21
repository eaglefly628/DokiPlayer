// Only explicitly configured controls are candidates; never click arbitrary page buttons.
export async function observe(page, config) {
  const selectors = config.selectors;
  const story = [];
  if (selectors.story) for (const el of await page.locator(selectors.story).all()) {
    if (await el.isVisible()) story.push(await el.innerText());
  }
  const choices = [];
  if (selectors.choices) {
    const all = await page.locator(selectors.choices).all();
    for (let i=0;i<all.length;i++) if (await all[i].isVisible() && await all[i].isEnabled()) choices.push({ index:i, text:await all[i].innerText() });
  }
  const ending = selectors.ending ? await page.locator(selectors.ending).first().isVisible() : false;
  const loading = selectors.loading ? await page.locator(selectors.loading).first().isVisible() : false;
  let phase = 'story';
  let advance = null;
  if (config.adapter === 'aimeng') {
    for (const text of ['点击揭示下一格', '点击开始行动，跟随高亮完成第一步。']) {
      if (await page.getByText(text, {exact:true}).isVisible()) { advance={type:'text',text}; phase='prologue'; break; }
    }
    if (!advance && await page.getByRole('button',{name:'继续旅程',exact:true}).isVisible()) {
      advance={type:'button',text:'继续旅程'}; phase='chapter';
    }
    // Capture prologue/chapter text even before gameplay selectors are ready.
    if (phase !== 'story') story.splice(0, story.length, await page.locator('body').innerText());
  }
  const context = config.adapter==='aimeng' ? await page.locator('body').innerText() : '';
  const notices = ['AI 回应未通过校验','AI 回应超时','当前使用本地回应'].filter(text=>context.includes(text));
  return { url:page.url(), story:story.join('\n\n'), choices, ending, loading, phase, advance, context, notices };
}

export async function act(page, config, action) {
  if (action.type === 'choice') await page.locator(config.selectors.choices).nth(action.index).click();
  else if (action.type === 'text') await page.getByText(action.text,{exact:true}).click();
  else await page.getByRole('button',{name:action.text,exact:true}).click();
}
